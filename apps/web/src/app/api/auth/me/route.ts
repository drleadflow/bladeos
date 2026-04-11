import { validateRequest } from '@/lib/lucia'

export const runtime = 'nodejs'

export async function GET(): Promise<Response> {
  const { user, session } = await validateRequest()

  if (!user) {
    return Response.json(
      { success: false, error: 'Not authenticated' },
      { status: 401 }
    )
  }

  return Response.json({
    success: true,
    data: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatarUrl: user.avatarUrl,
      sessionId: session.id,
    },
  })
}
