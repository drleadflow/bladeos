import { lucia } from '@/lib/lucia'
import { authUsers } from '@blade/db'
import { generateIdFromEntropySize } from 'lucia'
import { hash } from '@node-rs/argon2'
import { cookies } from 'next/headers'
import { ensureServerInit } from '@/lib/server-init'

export const runtime = 'nodejs'

export async function POST(req: Request): Promise<Response> {
  try {
    ensureServerInit()
    const body = (await req.json()) as { email?: string; password?: string; name?: string }

    const email = body.email?.trim().toLowerCase()
    const password = body.password
    const name = body.name?.trim()

    if (!email || !password) {
      return Response.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      )
    }

    if (password.length < 8) {
      return Response.json(
        { success: false, error: 'Password must be at least 8 characters' },
        { status: 400 }
      )
    }

    const existing = authUsers.getByEmail(email)
    if (existing) {
      return Response.json(
        { success: false, error: 'An account with this email already exists' },
        { status: 409 }
      )
    }

    const userId = generateIdFromEntropySize(10)
    const hashedPassword = await hash(password, {
      memoryCost: 19456,
      timeCost: 2,
      outputLen: 32,
      parallelism: 1,
    })

    authUsers.create(userId, email, name)
    authUsers.setPassword(userId, hashedPassword)

    // First user is automatically admin
    if (authUsers.count() === 1) {
      const { getDb } = await import('@blade/db')
      getDb().prepare('UPDATE auth_user SET role = ? WHERE id = ?').run('admin', userId)
    }

    const session = await lucia.createSession(userId, {})
    const sessionCookie = lucia.createSessionCookie(session.id)

    const cookieStore = await cookies()
    cookieStore.set(
      sessionCookie.name,
      sessionCookie.value,
      sessionCookie.attributes
    )

    return Response.json({
      success: true,
      data: { userId, email },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Registration failed'
    return Response.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
