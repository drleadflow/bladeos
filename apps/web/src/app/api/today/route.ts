import { activityEvents, approvals, monitorAlerts, costEntries, employees, jobEvals } from '@blade/db'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'
import { ensureServerInit } from '@/lib/server-init'

export async function GET(request: Request): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    ensureServerInit()

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

    // Agent eval success rate (last 30 days)
    let evalSummary = { totalJobs: 0, passed: 0, failed: 0, partial: 0, successRatePct: 0, avgCostUsd: 0, avgDurationSec: 0, avgToolCalls: 0, avgFixCycles: 0 }
    try {
      evalSummary = jobEvals.successRate({ days: 30 })
    } catch { /* job_evals table may not exist yet */ }

    // Active workers (running jobs right now)
    let activeWorkerCount = 0
    try {
      const { getDb } = await import('@blade/db')
      const db = getDb()
      const row = db.prepare("SELECT COUNT(*) as count FROM worker_sessions WHERE status IN ('active', 'booting')").get() as { count: number } | undefined
      activeWorkerCount = row?.count ?? 0
    } catch { /* worker_sessions table may not exist */ }

    // System health score (0-100 based on alerts + eval rate + cost)
    const healthFactors = {
      noAlerts: criticalAlertCount === 0 ? 30 : (warningAlertCount === 0 ? 15 : 0),
      evalRate: Math.min(30, Math.round(evalSummary.successRatePct * 0.3)),
      costOk: todayCost.totalUsd < 10 ? 20 : (todayCost.totalUsd < 50 ? 10 : 0),
      hasAgents: activeAgents.length > 0 ? 20 : 0,
    }
    const systemHealth = Math.min(100, Object.values(healthFactors).reduce((a, b) => a + b, 0))

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
        evalSummary,
        activeWorkerCount,
        systemHealth,
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
