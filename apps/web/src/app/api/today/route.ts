import { initializeDb, activityEvents, approvals, monitorAlerts, costEntries, employees } from '@blade/db'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'

export async function GET(request: Request): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    initializeDb()

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayIso = todayStart.toISOString()

    const allRecentAlerts = monitorAlerts.listRecent(10)
    const alerts = allRecentAlerts.filter((a) => a.acknowledged === 0)

    const pendingApprovals = approvals.countPending()
    const recentActivity = activityEvents.list({ limit: 10 })
    const todayCost = costEntries.summary(1)
    const activeAgents = employees.listActive()
    const todayEventCount = activityEvents.countSince(todayIso)

    return Response.json({
      success: true,
      data: {
        alerts,
        pendingApprovals,
        recentActivity,
        todayCost,
        activeAgents,
        todayEventCount,
      },
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to load today data'
    logger.error('Today', `GET error: ${errorMessage}`)
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
