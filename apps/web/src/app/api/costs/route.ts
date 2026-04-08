import { initializeDb, costEntries } from '@blade/db'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'

export async function GET(request: Request): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    initializeDb()
    const summary = costEntries.summary()
    return Response.json({ success: true, data: summary })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get cost summary'
    logger.error('Costs', `GET error: ${errorMessage}`)
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
