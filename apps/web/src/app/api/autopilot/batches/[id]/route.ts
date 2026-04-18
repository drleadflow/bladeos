import { initializeDb } from '@blade/db'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'
import { corsHeaders, corsOptionsResponse } from '@/lib/cors'
import { getBatchProgress, stopBatch, cancelBatch } from '@blade/core'

export const runtime = 'nodejs'

export async function OPTIONS(): Promise<Response> {
  return corsOptionsResponse()
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    const { id } = await params
    initializeDb()

    const progress = getBatchProgress(id)
    if (!progress) {
      return Response.json(
        { success: false, error: 'Batch not found' },
        { status: 404, headers: corsHeaders() }
      )
    }

    return Response.json(
      { success: true, data: progress },
      { headers: corsHeaders() }
    )
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get batch progress'
    logger.error('AutopilotBatch', `GET error: ${errorMessage}`)
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500, headers: corsHeaders() }
    )
  }
}

interface BatchControlBody {
  action: 'stop' | 'cancel'
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    const { id } = await params
    initializeDb()

    const body = (await request.json()) as BatchControlBody

    if (body.action === 'stop') {
      await stopBatch(id)
    } else if (body.action === 'cancel') {
      await cancelBatch(id)
    } else {
      return Response.json(
        { success: false, error: 'action must be stop or cancel' },
        { status: 400, headers: corsHeaders() }
      )
    }

    return Response.json(
      { success: true, data: { id, action: body.action } },
      { headers: corsHeaders() }
    )
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to control batch'
    logger.error('AutopilotBatch', `POST error: ${errorMessage}`)
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500, headers: corsHeaders() }
    )
  }
}
