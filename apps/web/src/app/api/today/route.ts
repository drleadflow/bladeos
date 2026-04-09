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
    const severityRank: Record<string, number> = {
      critical: 4,
      error: 4,
      warning: 3,
      high: 3,
      medium: 2,
      low: 1,
      info: 1,
    }

    const allRecentAlerts = monitorAlerts.listRecent(10)
    const alerts = allRecentAlerts
      .filter((a) => a.acknowledged === 0)
      .sort((a, b) => {
        const severityDelta = (severityRank[b.severity] ?? 0) - (severityRank[a.severity] ?? 0)
        if (severityDelta !== 0) return severityDelta
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      })

    const pendingApprovals = approvals.countPending()
    const recentActivity = activityEvents.list({ limit: 10 }).sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
    const todayCost = costEntries.summary(1)
    const activeAgents = employees.listActive().sort((a, b) => a.name.localeCompare(b.name))
    const todayEventCount = activityEvents.countSince(todayIso)
    const criticalAlertCount = alerts.filter((alert) => ['critical', 'error'].includes(alert.severity)).length
    const warningAlertCount = alerts.filter((alert) => ['warning', 'high'].includes(alert.severity)).length
    const topAlert = alerts[0] ?? null

    return Response.json({
      success: true,
      data: {
        alerts,
        criticalAlertCount,
        warningAlertCount,
        topAlert,
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
