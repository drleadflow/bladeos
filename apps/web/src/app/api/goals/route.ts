import { initializeDb, goals } from '@blade/db'
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
    const category = url.searchParams.get('category') ?? undefined

    const list = goals.list({ status, category })
    const stats = goals.getStats()

    return Response.json({ success: true, data: list, meta: stats }, { headers: corsHeaders() })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to list goals'
    logger.error('Goals', `GET error: ${errorMessage}`)
    return Response.json({ success: false, error: errorMessage }, { status: 500, headers: corsHeaders() })
  }
}

export async function POST(request: Request): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    initializeDb()
    const body = await request.json() as {
      title: string
      description?: string
      category?: string
      metricName: string
      metricUnit?: string
      targetValue: number
      priority?: string
      deadline?: string
      owner?: string
      agents?: Array<{ employeeSlug: string; role?: string; weight?: number }>
    }

    const goal = goals.create({
      title: body.title,
      description: body.description,
      category: body.category,
      metricName: body.metricName,
      metricUnit: body.metricUnit,
      targetValue: body.targetValue,
      priority: body.priority,
      deadline: body.deadline,
      owner: body.owner,
    })

    if (Array.isArray(body.agents)) {
      for (const agent of body.agents) {
        goals.assignAgent(goal.id, agent.employeeSlug, agent.role, agent.weight)
      }
    }

    return Response.json({ success: true, data: goal }, { status: 201, headers: corsHeaders() })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to create goal'
    logger.error('Goals', `POST error: ${errorMessage}`)
    return Response.json({ success: false, error: errorMessage }, { status: 500, headers: corsHeaders() })
  }
}
