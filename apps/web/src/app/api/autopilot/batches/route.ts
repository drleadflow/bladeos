import { initializeDb, autopilot } from '@blade/db'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'
import { corsHeaders, corsOptionsResponse } from '@/lib/cors'

export const runtime = 'nodejs'

export async function OPTIONS(): Promise<Response> {
  return corsOptionsResponse()
}

export async function GET(request: Request): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    initializeDb()
    const url = new URL(request.url)
    const status = url.searchParams.get('status') ?? undefined
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)

    const batches = autopilot.listBatches({ status, limit })

    return Response.json(
      { success: true, data: { batches, total: batches.length } },
      { headers: corsHeaders() }
    )
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to list batches'
    logger.error('AutopilotBatches', `GET error: ${errorMessage}`)
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500, headers: corsHeaders() }
    )
  }
}

interface CreateBatchBody {
  name: string
  maxConcurrent?: number
  maxCostUsd?: number
  jobs?: Array<{ title: string; description: string; priority?: number }>
}

export async function POST(request: Request): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    initializeDb()
    const body = (await request.json()) as CreateBatchBody

    if (!body.name) {
      return Response.json(
        { success: false, error: 'name is required' },
        { status: 400, headers: corsHeaders() }
      )
    }

    const batch = autopilot.createBatch({
      name: body.name,
      maxConcurrent: body.maxConcurrent,
      maxCostUsd: body.maxCostUsd,
    })

    const addedJobs = []
    for (const job of body.jobs ?? []) {
      const entry = autopilot.addJob({
        batchRunId: batch.id,
        title: job.title,
        description: job.description,
        priority: job.priority,
      })
      addedJobs.push(entry)
    }

    return Response.json(
      { success: true, data: { batch, jobs: addedJobs } },
      { status: 201, headers: corsHeaders() }
    )
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to create batch'
    logger.error('AutopilotBatches', `POST error: ${errorMessage}`)
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500, headers: corsHeaders() }
    )
  }
}
