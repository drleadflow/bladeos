import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { getDb, initializeDb } from '@blade/db'

const BLADE_DIR = join(homedir(), '.blade')
const SECRET_PATH = join(BLADE_DIR, 'auth-secret')

function getOrCreateAuthSecret(): string {
  // Check env first
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET

  // Check file
  if (existsSync(SECRET_PATH)) {
    return readFileSync(SECRET_PATH, 'utf-8').trim()
  }

  // Generate and save
  const secret = crypto.randomUUID() + '-' + crypto.randomUUID()
  mkdirSync(BLADE_DIR, { recursive: true })
  writeFileSync(SECRET_PATH, secret, 'utf-8')
  return secret
}

function isLocalhostByHost(request: Request): boolean {
  const host = request.headers.get('host') ?? ''
  return host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('[::1]')
}

function isLocalhostViaProxy(request: Request): boolean {
  const trustedProxiesEnv = process.env.BLADE_TRUSTED_PROXIES ?? ''
  if (!trustedProxiesEnv) return false

  const trustedProxies = trustedProxiesEnv.split(',').map(s => s.trim()).filter(Boolean)

  const forwarded = request.headers.get('x-forwarded-for')
  if (!forwarded) return false

  if (trustedProxies.length === 0) return false

  const clientIp = forwarded.split(',')[0].trim()
  return clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === 'localhost'
}

function getCookieValue(request: Request, name: string): string | undefined {
  const cookies = request.headers.get('cookie') ?? ''
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
  if (!match?.[1]) return undefined

  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

function normalizeExpiresAt(value: number): number {
  // Lucia stores integer expiry timestamps; support both seconds and milliseconds.
  return value > 1_000_000_000_000 ? value : value * 1000
}

function validateSessionCookie(request: Request): AuthResult | null {
  const sessionId = getCookieValue(request, 'auth_session')
  if (!sessionId) return null

  try {
    initializeDb()
    const db = getDb()
    const row = db.prepare(
      `SELECT
         s.user_id as userId,
         s.expires_at as expiresAt,
         u.email as email,
         u.role as role
       FROM auth_session s
       JOIN auth_user u ON u.id = s.user_id
       WHERE s.id = ?`
    ).get(sessionId) as {
      userId: string
      expiresAt: number
      email: string
      role: 'admin' | 'user'
    } | undefined

    if (!row) return null

    if (normalizeExpiresAt(row.expiresAt) <= Date.now()) {
      db.prepare('DELETE FROM auth_session WHERE id = ?').run(sessionId)
      return null
    }

    return {
      authorized: true,
      userId: row.userId,
      email: row.email,
      role: row.role,
    }
  } catch {
    return null
  }
}

export interface AuthResult {
  authorized: boolean
  error?: string
  userId?: string
  email?: string
  role?: string
}

/**
 * Sync auth check — used by all existing API routes.
 * Checks localhost bypass and legacy token auth.
 * Does NOT check Lucia sessions (use requireAuthAsync for that).
 */
export function requireAuth(request: Request): AuthResult {
  // 1. Localhost bypass (existing behavior)
  if (!process.env.BLADE_ALLOW_REMOTE) {
    const local = isLocalhostByHost(request) || isLocalhostViaProxy(request)
    if (!local) {
      return { authorized: false, error: 'Remote access denied. Set BLADE_ALLOW_REMOTE=true to allow.' }
    }
    return { authorized: true }
  }

  // 2. Validate Lucia session cookie synchronously against the DB.
  const sessionAuth = validateSessionCookie(request)
  if (sessionAuth?.authorized) {
    return sessionAuth
  }

  // 3. Legacy token auth (backward compatibility)
  const secret = getOrCreateAuthSecret()

  const authHeader = request.headers.get('authorization') ?? ''
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    if (token === secret) return { authorized: true }
  }

  const cookies = request.headers.get('cookie') ?? ''
  const tokenMatch = cookies.match(/blade_token=([^;]+)/)
  if (tokenMatch && tokenMatch[1] === secret) return { authorized: true }

  return { authorized: false, error: 'Invalid or missing authentication. Please log in.' }
}

/**
 * Async auth check — validates Lucia session fully.
 * Use in new routes that need user identity (userId, email, role).
 */
export async function requireAuthAsync(request: Request): Promise<AuthResult> {
  // 1. Try Lucia session first
  try {
    const { validateRequest } = await import('./lucia')
    const { user } = await validateRequest()
    if (user) {
      return {
        authorized: true,
        userId: user.id,
        email: user.email,
        role: user.role,
      }
    }
  } catch {
    // Lucia not available — fall through to legacy
  }

  // 2. Fall back to sync checks
  return requireAuth(request)
}

export function unauthorizedResponse(error: string): Response {
  return Response.json({ success: false, error }, { status: 401 })
}

export { getOrCreateAuthSecret }
