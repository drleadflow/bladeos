import { NextRequest } from 'next/server'
import { initializeDb, missions, activityEvents } from '@blade/db'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'

export async function GET(req: NextRequest): Promise<Response> {
  const auth = requireAuth(req)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    initializeDb()
    const status = req.nextUrl.searchParams.get('status') ?? undefined
    const employeeId = req.nextUrl.searchParams.get('employee') ?? undefined
    const data = missions.list({ status, employeeId })
    const counts = missions.countByStatus()
    return Response.json({ success: true, data, counts })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to list missions'
    logger.error('Missions', `GET error: ${msg}`)
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const auth = requireAuth(req)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    const body = await req.json()
    const { title, description, priority } = body as {
      title: string
      description?: string
      priority?: string
    }

    if (!title) {
      return Response.json({ success: false, error: 'title is required' }, { status: 400 })
    }

    initializeDb()
    const mission = missions.create({ title, description, priority, createdBy: 'user' })

    activityEvents.emit({
      eventType: 'mission_created',
      actorType: 'user',
      actorId: 'user',
      summary: `Mission created: ${title}`,
      targetType: 'mission',
      targetId: mission.id,
    })

    return Response.json({ success: true, data: mission }, { status: 201 })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to create mission'
    logger.error('Missions', `POST error: ${msg}`)
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}

export async function PUT(req: NextRequest): Promise<Response> {
  const auth = requireAuth(req)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    const body = await req.json()
    const { id, status, result } = body as { id: string; status?: string; result?: string }

    if (!id) {
      return Response.json({ success: false, error: 'id is required' }, { status: 400 })
    }

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
    logger.error('Missions', `PUT error: ${msg}`)
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const auth = requireAuth(req)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    const body = await req.json()
    const { id } = body as { id: string }
    if (!id) return Response.json({ success: false, error: 'id is required' }, { status: 400 })

    initializeDb()
    missions.delete(id)
    return Response.json({ success: true })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to delete mission'
    logger.error('Missions', `DELETE error: ${msg}`)
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}
