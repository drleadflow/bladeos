import { initializeDb, activityEvents } from '@blade/db'
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
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const since = todayStart.toISOString()

    const injections = activityEvents.list({ eventType: 'injection_detected', since, limit: 1000 })
    const exfiltrations = activityEvents.list({ eventType: 'exfiltration_detected', since, limit: 1000 })

    const injectionsToday = injections.length
    const exfiltrationsToday = exfiltrations.length
    const total = injectionsToday + exfiltrationsToday
    const severity = total === 0 ? 'none' : total < 5 ? 'low' : total < 20 ? 'medium' : 'high'

    return Response.json(
      { success: true, data: { injectionsToday, exfiltrationsToday, severity } },
      { headers: corsHeaders() }
    )
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get security stats'
    logger.error('SecurityStats', `GET error: ${errorMessage}`)
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500, headers: corsHeaders() }
    )
  }
}
