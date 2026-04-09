import { initializeDb, workerSessions } from '@blade/db'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'

export async function GET(request: Request): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    initializeDb()
    const data = workerSessions.list(100)
    return Response.json({ success: true, data })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to list workers'
    logger.error('Workers', `GET error: ${errorMessage}`)
    return Response.json({ success: false, error: errorMessage }, { status: 500 })
  }
}
