import { lucia } from '@/lib/lucia'
import { authUsers } from '@blade/db'
import { verify } from '@node-rs/argon2'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as { email?: string; password?: string; token?: string }

    // Legacy token auth (backward compatibility during migration)
    if (body.token && !body.email) {
      const { getOrCreateAuthSecret } = await import('@/lib/auth')
      const secret = getOrCreateAuthSecret()
      if (body.token !== secret) {
        return Response.json({ success: false, error: 'Invalid token' }, { status: 401 })
      }
      const isProduction = process.env.NODE_ENV === 'production'
      const cookieFlags = `HttpOnly; SameSite=Strict; Path=/; Max-Age=${60 * 60 * 24 * 30}${isProduction ? '; Secure' : ''}`
      const response = Response.json({ success: true, data: { legacy: true } })
      response.headers.set('Set-Cookie', `blade_token=${body.token}; ${cookieFlags}`)
      return response
    }

    const email = body.email?.trim().toLowerCase()
    const password = body.password

    if (!email || !password) {
      return Response.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      )
    }

    const user = authUsers.getByEmail(email)
    if (!user) {
      return Response.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    const hashedPassword = authUsers.getPassword(user.id)
    if (!hashedPassword) {
      return Response.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    const validPassword = await verify(hashedPassword, password)
    if (!validPassword) {
      return Response.json(
        { success: false, error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    const session = await lucia.createSession(user.id, {})
    const sessionCookie = lucia.createSessionCookie(session.id)

    const cookieStore = await cookies()
    cookieStore.set(
      sessionCookie.name,
      sessionCookie.value,
      sessionCookie.attributes
    )

    return Response.json({
      success: true,
      data: {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Login failed'
    return Response.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
