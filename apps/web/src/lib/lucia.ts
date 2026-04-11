import { Lucia } from 'lucia'
import { BetterSqlite3Adapter } from '@lucia-auth/adapter-sqlite'
import { getDb } from '@blade/db'
import { cache } from 'react'
import { cookies } from 'next/headers'
import type { Session, User } from 'lucia'

const adapter = new BetterSqlite3Adapter(getDb(), {
  user: 'auth_user',
  session: 'auth_session',
})

export const lucia = new Lucia(adapter, {
  sessionCookie: {
    attributes: {
      secure: process.env.NODE_ENV === 'production',
    },
  },
  getUserAttributes: (attributes) => ({
    email: attributes.email,
    name: attributes.name,
    role: attributes.role,
    avatarUrl: attributes.avatar_url,
  }),
})

declare module 'lucia' {
  interface Register {
    Lucia: typeof lucia
    DatabaseUserAttributes: {
      email: string
      name: string | null
      avatar_url: string | null
      role: 'admin' | 'user'
    }
  }
}

export const validateRequest = cache(
  async (): Promise<
    { user: User; session: Session } | { user: null; session: null }
  > => {
    const cookieStore = await cookies()
    const sessionId =
      cookieStore.get(lucia.sessionCookieName)?.value ?? null

    if (!sessionId) {
      return { user: null, session: null }
    }

    const result = await lucia.validateSession(sessionId)

    try {
      if (result.session?.fresh) {
        const sessionCookie = lucia.createSessionCookie(result.session.id)
        cookieStore.set(
          sessionCookie.name,
          sessionCookie.value,
          sessionCookie.attributes
        )
      }
      if (!result.session) {
        const blankCookie = lucia.createBlankSessionCookie()
        cookieStore.set(
          blankCookie.name,
          blankCookie.value,
          blankCookie.attributes
        )
      }
    } catch {
      // Cookies can only be set in Server Actions or Route Handlers
    }

    return result
  }
)
