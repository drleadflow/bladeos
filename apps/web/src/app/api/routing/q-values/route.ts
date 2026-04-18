import { initializeDb, routing } from '@blade/db'
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
    const taskType = url.searchParams.get('taskType') ?? undefined

    if (taskType) {
      const qValues = routing.getAllQValues(taskType)
      return Response.json(
        { success: true, data: { taskType, qValues } },
        { headers: corsHeaders() }
      )
    }

    const taskTypes = routing.getTaskTypeStats()
    const allQValues: Array<{ taskType: string; employeeSlug: string; qValue: number; visitCount: number }> = []

    for (const stat of taskTypes) {
      const qValues = routing.getAllQValues(stat.taskType)
      allQValues.push(...qValues.map(q => ({
        taskType: q.taskType,
        employeeSlug: q.employeeSlug,
        qValue: q.qValue,
        visitCount: q.visitCount,
      })))
    }

    return Response.json(
      { success: true, data: { qValues: allQValues } },
      { headers: corsHeaders() }
    )
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get Q-values'
    logger.error('RoutingQValues', `GET error: ${errorMessage}`)
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500, headers: corsHeaders() }
    )
  }
}
