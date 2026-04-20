import { NextRequest } from 'next/server'
import { initializeDb, missions, activityEvents } from '@blade/db'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = requireAuth(req)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    const { id } = await params
    initializeDb()
    const mission = missions.get(id)
    if (!mission) {
      return Response.json({ success: false, error: 'Mission not found' }, { status: 404 })
    }
    return Response.json({ success: true, data: mission })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to get mission'
    logger.error('Missions', `GET [id] error: ${msg}`)
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = requireAuth(req)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    const { id } = await params
    const body = await req.json()
    const { status, result } = body as { status?: string; result?: string }

    initializeDb()

    if (status === 'live') {
      missions.start(id)
    } else if (status === 'done' && result) {
      missions.complete(id, result)
    } else if (status === 'failed' && result) {
      missions.fail(id, result)
    } else if (status) {
      missions.updateStatus(id, status)
    }

    const updated = missions.get(id)

    if (updated && status) {
      activityEvents.emit({
        eventType: `mission_${status}`,
        actorType: updated.assignedEmployee ? 'employee' : 'user',
        actorId: updated.assignedEmployee ?? 'user',
        summary: `Mission ${status}: ${updated.title}`,
        targetType: 'mission',
        targetId: id,
      })
    }

    return Response.json({ success: true, data: updated })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to update mission'
    logger.error('Missions', `PATCH [id] error: ${msg}`)
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}
