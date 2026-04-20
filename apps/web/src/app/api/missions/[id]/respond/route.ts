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
    const { response } = body as { response?: string }

    if (!response) {
      return Response.json({ success: false, error: 'response is required' }, { status: 400 })
    }

    initializeDb()

    const mission = missions.get(id)
    if (!mission) {
      return Response.json({ success: false, error: 'Mission not found' }, { status: 404 })
    }
    if (mission.status !== 'awaiting_input') {
      return Response.json({ success: false, error: `Mission is not awaiting input (status: "${mission.status}")` }, { status: 400 })
    }

    missions.submitResponse(id, response)

    activityEvents.emit({
      eventType: 'mission_response_submitted',
      actorType: 'user',
      actorId: 'user',
      summary: `Responded to ${mission.assignedEmployee}'s question on: ${mission.title}`,
      targetType: 'mission',
      targetId: id,
    })

    return Response.json({ success: true, data: missions.get(id) })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to submit response'
    logger.error('Missions', `respond error: ${msg}`)
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}
