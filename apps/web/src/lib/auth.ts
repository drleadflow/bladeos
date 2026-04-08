import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

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

function isLocalhost(request: Request): boolean {
  const forwarded = request.headers.get('x-forwarded-for')
  const host = request.headers.get('host') ?? ''

  if (forwarded) {
    const ip = forwarded.split(',')[0].trim()
    return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost'
  }

  return host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('[::1]')
}

export function requireAuth(request: Request): { authorized: boolean; error?: string } {
  // If remote access is not explicitly allowed, enforce localhost
  if (!process.env.BLADE_ALLOW_REMOTE) {
    if (!isLocalhost(request)) {
      return { authorized: false, error: 'Remote access denied. Set BLADE_ALLOW_REMOTE=true to allow.' }
    }
    // Localhost is trusted — no token needed for local access
    return { authorized: true }
  }

  // For remote access, require token auth
  const secret = getOrCreateAuthSecret()

  // Check Authorization header
  const authHeader = request.headers.get('authorization') ?? ''
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    if (token === secret) return { authorized: true }
  }

  // Check cookie
  const cookies = request.headers.get('cookie') ?? ''
  const tokenMatch = cookies.match(/blade_token=([^;]+)/)
  if (tokenMatch && tokenMatch[1] === secret) return { authorized: true }

  return { authorized: false, error: 'Invalid or missing authentication token.' }
}

export function unauthorizedResponse(error: string): Response {
  return Response.json({ success: false, error }, { status: 401 })
}

export { getOrCreateAuthSecret }
