import { initializeDb, goals } from '@blade/db'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'
import { corsHeaders, corsOptionsResponse } from '@/lib/cors'

export const runtime = 'nodejs'

export async function OPTIONS(): Promise<Response> {
  return corsOptionsResponse()
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    initializeDb()
    const { id } = await params
    const goal = goals.get(id)
    if (!goal) {
      return Response.json({ success: false, error: 'Goal not found' }, { status: 404, headers: corsHeaders() })
    }

    const agents = goals.getAgents(id)
    const updates = goals.getUpdates(id, 20)

    return Response.json({ success: true, data: { ...goal, agents, updates } }, { headers: corsHeaders() })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get goal'
    logger.error('Goals', `GET [id] error: ${errorMessage}`)
    return Response.json({ success: false, error: errorMessage }, { status: 500, headers: corsHeaders() })
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    initializeDb()
    const { id } = await params
    const body = await request.json() as { currentValue?: number; status?: string; source?: string; note?: string }

    if (body.currentValue !== undefined) {
      goals.updateProgress(id, body.currentValue, body.source ?? 'manual', undefined, body.note)
    } else if (body.status !== undefined) {
      goals.updateStatus(id, body.status)
    }

    const updated = goals.get(id)
    return Response.json({ success: true, data: updated }, { headers: corsHeaders() })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to update goal'
    logger.error('Goals', `PATCH [id] error: ${errorMessage}`)
    return Response.json({ success: false, error: errorMessage }, { status: 500, headers: corsHeaders() })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    initializeDb()
    const { id } = await params
    const body = await request.json() as { action: string; employeeSlug: string; role?: string; weight?: number }

    if (body.action === 'assign') {
      goals.assignAgent(id, body.employeeSlug, body.role, body.weight)
    } else if (body.action === 'remove') {
      goals.removeAgent(id, body.employeeSlug)
    } else {
      return Response.json({ success: false, error: `Unknown action: ${body.action}` }, { status: 400, headers: corsHeaders() })
    }

    const agents = goals.getAgents(id)
    return Response.json({ success: true, data: agents }, { headers: corsHeaders() })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to update goal agents'
    logger.error('Goals', `POST [id] error: ${errorMessage}`)
    return Response.json({ success: false, error: errorMessage }, { status: 500, headers: corsHeaders() })
  }
}
