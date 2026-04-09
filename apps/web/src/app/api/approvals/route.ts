import { initializeDb, approvals } from '@blade/db'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'

export async function GET(request: Request): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    initializeDb()
    const pending = approvals.listPending()
    const pendingCount = approvals.countPending()
    return Response.json({ success: true, approvals: pending, pendingCount })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to list approvals'
    logger.error('Approvals', `GET error: ${errorMessage}`)
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}

export async function POST(request: Request): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    initializeDb()
    const body = await request.json() as { id?: string; decision?: string }

    if (!body.id || typeof body.id !== 'string') {
      return Response.json(
        { success: false, error: 'Missing required field: id' },
        { status: 400 }
      )
    }

    if (body.decision !== 'approved' && body.decision !== 'rejected') {
      return Response.json(
        { success: false, error: 'Decision must be "approved" or "rejected"' },
        { status: 400 }
      )
    }

    const existing = approvals.get(body.id)
    if (!existing) {
      return Response.json(
        { success: false, error: 'Approval not found' },
        { status: 404 }
      )
    }

    if (existing.status !== 'pending') {
      return Response.json(
        { success: false, error: `Approval already ${existing.status}` },
        { status: 409 }
      )
    }

    approvals.decide(body.id, body.decision, 'user')
    return Response.json({ success: true, id: body.id, decision: body.decision })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to decide approval'
    logger.error('Approvals', `POST error: ${errorMessage}`)
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
