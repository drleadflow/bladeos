import { getDb, initializeDb, missions, activityEvents } from '@blade/db'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'
import { ensureEmployeeDefinitionsLoaded } from '@/lib/employee-definitions'

export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    initializeDb()
    ensureEmployeeDefinitionsLoaded()
    const db = getDb()

    const agents = db.prepare(
      `SELECT slug, name, title, department, icon, objective, status,
       allowed_tools_json as allowedToolsJson, model_preference as modelPreference,
       total_runs as totalRuns, total_cost_usd as totalCostUsd, success_rate as successRate,
       active, archetype, manager_id as managerId, created_at as createdAt
       FROM employees ORDER BY department, name`
    ).all() as {
      slug: string; name: string; title: string; department: string | null
      icon: string; objective: string | null; status: string | null
      allowedToolsJson: string | null; modelPreference: string | null
      totalRuns: number | null; totalCostUsd: number | null; successRate: number | null
      active: number; archetype: string | null; managerId: string | null; createdAt: string
    }[]

    // Enrich with mission counts and recent activity
    const missionCounts = missions.countByEmployee()
    const missionMap = new Map(missionCounts.map(m => [m.assignedEmployee, m.count]))

    // Count recent conversation turns (last 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    return Response.json({
      success: true,
      agents: agents.map((a) => {
        let recentTurns = 0
        try {
          const events = activityEvents.list({ actorId: a.slug, since: oneDayAgo, limit: 100 })
          recentTurns = events.length
        } catch { /* table may not exist yet */ }

        return {
          ...a,
          active: Boolean(a.active),
          allowedTools: a.allowedToolsJson ? JSON.parse(a.allowedToolsJson) : [],
          allowedToolsJson: undefined,
          activeMissions: missionMap.get(a.slug) ?? 0,
          recentTurns,
        }
      }),
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to list agents'
    logger.error('Agents', `GET error: ${errorMessage}`)
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
