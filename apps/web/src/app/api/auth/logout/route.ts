import { lucia, validateRequest } from '@/lib/lucia'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'

export async function POST(): Promise<Response> {
  const { session } = await validateRequest()

  if (!session) {
    return Response.json(
      { success: false, error: 'Not authenticated' },
      { status: 401 }
    )
  }

  await lucia.invalidateSession(session.id)

  const blankCookie = lucia.createBlankSessionCookie()
  const cookieStore = await cookies()
  cookieStore.set(blankCookie.name, blankCookie.value, blankCookie.attributes)

  // Also clear legacy cookie if present
  cookieStore.set('blade_token', '', { path: '/', maxAge: 0 })

  return Response.json({ success: true })
}
