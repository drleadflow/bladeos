import { initializeDb, activityEvents } from '@blade/db'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'

export async function GET(request: Request): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    initializeDb()

    const url = new URL(request.url)
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
    const offset = Number(url.searchParams.get('offset') ?? 0)
    const eventType = url.searchParams.get('type') ?? undefined
    const actorId = url.searchParams.get('actor') ?? undefined
    const targetType = url.searchParams.get('targetType') ?? undefined
    const targetId = url.searchParams.get('targetId') ?? undefined
    const since = url.searchParams.get('since') ?? undefined

    const events = activityEvents.list({
      limit,
      offset,
      eventType,
      actorId,
      targetType,
      targetId,
      since,
    })
    const total = since
      ? activityEvents.countSince(since)
      : activityEvents.countSince('1970-01-01T00:00:00.000Z')

    return Response.json({ success: true, data: { events, total } })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get timeline'
    logger.error('Timeline', `GET error: ${errorMessage}`)
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
