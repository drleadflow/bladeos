import { initializeDb, conversations } from '@blade/db'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'

export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    initializeDb()
    const list = conversations.list(50)

    return Response.json({
      success: true,
      data: list,
    })
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to load conversations'
    return Response.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
