import { getDb, initializeDb, kpiDefinitions, kpiMeasurements, routines, activityEvents } from '@blade/db'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'
import { ensureEmployeeDefinitionsLoaded } from '@/lib/employee-definitions'

export const runtime = 'nodejs'

export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  const { slug } = params

  try {
    initializeDb()
    ensureEmployeeDefinitionsLoaded()
    const db = getDb()

    const agent = db.prepare(
      `SELECT id, slug, name, title, pillar, department, description, icon, objective, status,
       allowed_tools_json as allowedToolsJson, model_preference as modelPreference,
       total_runs as totalRuns, total_cost_usd as totalCostUsd, success_rate as successRate,
       active, archetype, manager_id as managerId,
       onboarding_answers_json as onboardingAnswersJson,
       created_at as createdAt, updated_at as updatedAt
       FROM employees WHERE slug = ?`
    ).get(slug) as {
      id: string; slug: string; name: string; title: string; pillar: string
      department: string | null; description: string; icon: string
      objective: string | null; status: string | null
      allowedToolsJson: string | null; modelPreference: string | null
      totalRuns: number | null; totalCostUsd: number | null; successRate: number | null
      active: number; archetype: string | null; managerId: string | null
      onboardingAnswersJson: string; createdAt: string; updatedAt: string
    } | undefined

    if (!agent) {
      return Response.json(
        { success: false, error: 'Agent not found' },
        { status: 404 }
      )
    }

    const kpis = kpiDefinitions.listByEmployee(agent.slug)
    const latestMeasurements = kpiMeasurements.latestByEmployee(agent.slug)
    const agentRoutines = routines.listByEmployee(agent.slug)
    const recentActivity = activityEvents.list({ actorId: agent.slug, limit: 20 })

    return Response.json({
      success: true,
      agent: {
        ...agent,
        active: Boolean(agent.active),
        allowedTools: agent.allowedToolsJson ? JSON.parse(agent.allowedToolsJson) : [],
        allowedToolsJson: undefined,
        onboardingAnswers: JSON.parse(agent.onboardingAnswersJson),
        onboardingAnswersJson: undefined,
      },
      kpis: kpis.map((k) => ({
        ...k,
        source: JSON.parse(k.sourceJson),
        sourceJson: undefined,
        thresholds: JSON.parse(k.thresholdsJson),
        thresholdsJson: undefined,
      })),
      latestMeasurements,
      routines: agentRoutines.map((r) => ({
        ...r,
        enabled: Boolean(r.enabled),
        tools: JSON.parse(r.toolsJson),
        toolsJson: undefined,
      })),
      recentActivity,
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get agent'
    logger.error('Agents', `GET [slug] error: ${errorMessage}`)
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
