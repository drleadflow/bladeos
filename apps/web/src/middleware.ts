import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// In-memory sliding window rate limiter
const windowMs = 60_000 // 1 minute
const maxRequests = 60   // 60 req/min for authenticated
const maxUnauthRequests = 30 // 30 req/min for unauthenticated (pages fire multiple API calls on load)

interface RateEntry {
  timestamps: number[]
}

const rateLimits = new Map<string, RateEntry>()

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  rateLimits.forEach((entry, key) => {
    entry.timestamps = entry.timestamps.filter(t => now - t < windowMs)
    if (entry.timestamps.length === 0) rateLimits.delete(key)
  })
}, 5 * 60_000)

function checkRateLimit(ip: string, max: number, windowMs: number): { allowed: boolean } {
  const key = `auth:${ip}`
  const now = Date.now()
  const entry = rateLimits.get(key) ?? { timestamps: [] }
  entry.timestamps = entry.timestamps.filter(t => now - t < windowMs)

  if (entry.timestamps.length >= max) {
    return { allowed: false }
  }

  entry.timestamps.push(now)
  rateLimits.set(key, entry)
  return { allowed: true }
}

function getClientIp(request: NextRequest): string {
  // Use the leftmost IP from X-Forwarded-For (original client IP)
  // Rightmost is the last proxy — attacker can't spoof leftmost behind a trusted proxy
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const ips = forwarded.split(',').map(s => s.trim())
    return ips[0] || 'unknown'
  }
  // Fallback: use Next.js request IP or pathname-based key
  return request.ip ?? request.nextUrl.pathname
}

export function middleware(request: NextRequest) {
  // Only rate limit API routes
  if (!request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  // Exempt health check from rate limiting
  const path = request.nextUrl.pathname
  if (path === '/api/health') {
    return NextResponse.next()
  }

  const clientIp = getClientIp(request)

  // Stricter rate limit for auth routes
  if (path.startsWith('/api/auth/')) {
    const authLimit = checkRateLimit(clientIp, 10, 60_000) // 10 requests per minute
    if (!authLimit.allowed) {
      return new NextResponse('Too many auth attempts', { status: 429 })
    }
    return NextResponse.next()
  }

  const ip = getClientIp(request)
  const hasAuth = !!request.headers.get('authorization')
    || !!request.cookies.get('blade_token')
    || !!request.cookies.get('auth_session')
  const limit = hasAuth ? maxRequests : maxUnauthRequests

  const now = Date.now()
  const entry = rateLimits.get(ip) ?? { timestamps: [] }

  // Clean old timestamps
  entry.timestamps = entry.timestamps.filter(t => now - t < windowMs)

  if (entry.timestamps.length >= limit) {
    const oldestInWindow = Math.min(...entry.timestamps)
    const retryAfter = Math.ceil((oldestInWindow + windowMs - now) / 1000)
    return new NextResponse(
      JSON.stringify({ error: 'Too many requests', retryAfter }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': '0',
        }
      }
    )
  }

  entry.timestamps.push(now)
  rateLimits.set(ip, entry)

  const response = NextResponse.next()
  response.headers.set('X-RateLimit-Limit', String(limit))
  response.headers.set('X-RateLimit-Remaining', String(limit - entry.timestamps.length))
  return response
}

export const config = {
  matcher: '/api/:path*',
}
