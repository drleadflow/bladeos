import { NextRequest } from 'next/server'
import { initializeDb, missions, activityEvents } from '@blade/db'
import { autoAssignMission } from '@blade/core'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'

export async function POST(req: NextRequest): Promise<Response> {
  const auth = requireAuth(req)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    const body = await req.json()
    const { id } = body as { id: string }

    if (!id) {
      return Response.json({ success: false, error: 'id is required' }, { status: 400 })
    }

    initializeDb()
    const assignedSlug = await autoAssignMission(id)
    const updated = missions.get(id)

    activityEvents.emit({
      eventType: 'mission_assigned',
      actorType: 'system',
      actorId: 'mission-router',
      summary: `Auto-assigned "${updated?.title}" to ${assignedSlug}`,
      targetType: 'mission',
      targetId: id,
      detail: { assignedTo: assignedSlug },
    })

    return Response.json({ success: true, data: updated, assignedTo: assignedSlug })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to auto-assign mission'
    logger.error('Missions', `Auto-assign error: ${msg}`)
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}
