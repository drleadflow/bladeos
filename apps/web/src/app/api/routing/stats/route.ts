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
    const taskTypes = routing.getTaskTypeStats()
    const totalEpisodes = taskTypes.reduce((sum, t) => sum + t.totalVisits, 0)

    return Response.json(
      { success: true, data: { taskTypes, totalEpisodes } },
      { headers: corsHeaders() }
    )
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get routing stats'
    logger.error('RoutingStats', `GET error: ${errorMessage}`)
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500, headers: corsHeaders() }
    )
  }
}
