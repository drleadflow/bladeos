import { NextRequest } from 'next/server'
import { initializeDb, missions, activityEvents } from '@blade/db'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = requireAuth(req)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    const { id } = await params
    const body = await req.json()
    const { reason } = body as { reason?: string }

    initializeDb()

    const mission = missions.get(id)
    if (!mission) {
      return Response.json({ success: false, error: 'Mission not found' }, { status: 404 })
    }
    if (mission.status !== 'pending_review') {
      return Response.json({ success: false, error: `Cannot reject mission with status "${mission.status}"` }, { status: 400 })
    }

    missions.reject(id, reason ?? 'Rejected by user')

    activityEvents.emit({
      eventType: 'mission_rejected',
      actorType: 'user',
      actorId: 'user',
      summary: `Mission rejected: ${mission.title}${reason ? ` — ${reason}` : ''}`,
      targetType: 'mission',
      targetId: id,
    })

    return Response.json({ success: true, data: missions.get(id) })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to reject mission'
    logger.error('Missions', `reject error: ${msg}`)
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}
