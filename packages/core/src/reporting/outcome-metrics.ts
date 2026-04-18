import { costEntries, employees, missions, activityEvents, jobs } from '@blade/db'
import { logger } from '@blade/shared'

type MissionRecord = ReturnType<typeof missions.list>[number]

export interface BusinessMetrics {
  period: string

  // Productivity
  missionsCompleted: number
  missionsFailed: number
  missionSuccessRate: number
  prsOpened: number
  prsMerged: number

  // Cost efficiency
  totalCostUsd: number
  costPerMission: number
  costPerPr: number
  tokensSaved: number

  // Knowledge
  memoriesCreated: number
  insightsGenerated: number
  patternsLearned: number

  // Workforce
  activeEmployees: number
  topPerformer: { slug: string; name: string; successRate: number } | null
  totalEmployeeRuns: number

  // Security
  injectionAttempts: number
  secretsRedacted: number

  // Time
  avgMissionDurationMs: number
  fastestMission: { title: string; durationMs: number } | null
}

export interface EmployeeOutcomes {
  slug: string
  name: string
  title: string
  missionsCompleted: number
  missionsFailed: number
  successRate: number
  totalCostUsd: number
  costPerMission: number
  topTaskTypes: string[]
  recentActivity: string[]
}

type JobRow = { status: string; prUrl: string | null; totalCost: number | null; createdAt: string }

function periodLabel(periodDays: number): string {
  if (periodDays === 1) return 'today'
  if (periodDays === 7) return 'this week'
  return `last ${periodDays} days`
}

function missionDurationMs(m: MissionRecord): number {
  if (!m.startedAt || !m.completedAt) return 0
  return new Date(m.completedAt).getTime() - new Date(m.startedAt).getTime()
}

/**
 * Generate business metrics for a given period (days back from now).
 */
export function getBusinessMetrics(periodDays = 7): BusinessMetrics {
  const since = new Date(Date.now() - periodDays * 86400000).toISOString()

  try {
    // Missions
    const allMissions = missions.list({ limit: 1000 })
    const recentMissions = allMissions.filter(m => m.createdAt >= since)
    const completed = recentMissions.filter(m => m.status === 'done')
    const failed = recentMissions.filter(m => m.status === 'failed')

    // Jobs (PRs)
    const allJobs = jobs.list(500) as JobRow[]
    const recentJobs = allJobs.filter(j => j.createdAt >= since)
    const prsOpened = recentJobs.filter(j => j.prUrl != null).length
    const prsMerged = recentJobs.filter(j => j.status === 'completed' && j.prUrl != null).length

    // Costs
    const costSummary = costEntries.summary(periodDays)
    const totalCostUsd = costSummary.totalUsd

    // Activity events
    const memoryEvents = activityEvents.list({ eventType: 'memory_created', since, limit: 500 })
    const insightEvents = activityEvents.list({ eventType: 'consolidation_complete', since, limit: 100 })
    const injections = activityEvents.list({ eventType: 'injection_detected', since, limit: 500 })
    const exfiltrations = activityEvents.list({ eventType: 'exfiltration_blocked', since, limit: 500 })

    // Employees
    const empList = employees.list()
    const activeEmps = empList.filter(e => e.active !== 0)

    // Per-employee mission counts for top performer
    const empMissionCounts = computeEmployeeMissionCounts(allMissions, since)
    const topPerformer = pickTopPerformer(activeEmps, empMissionCounts)

    // Mission durations
    const completedWithTimes = completed.filter(m => m.startedAt && m.completedAt)
    const durationsMs = completedWithTimes.map(missionDurationMs)
    const avgDurationMs = durationsMs.length > 0
      ? Math.round(durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length)
      : 0

    const fastest = completedWithTimes.slice().sort((a, b) => missionDurationMs(a) - missionDurationMs(b))[0]

    return {
      period: periodLabel(periodDays),
      missionsCompleted: completed.length,
      missionsFailed: failed.length,
      missionSuccessRate: recentMissions.length > 0
        ? Math.round((completed.length / recentMissions.length) * 100)
        : 0,
      prsOpened,
      prsMerged,
      totalCostUsd,
      costPerMission: completed.length > 0
        ? Math.round((totalCostUsd / completed.length) * 100) / 100
        : 0,
      costPerPr: prsOpened > 0
        ? Math.round((totalCostUsd / prsOpened) * 100) / 100
        : 0,
      tokensSaved: 0,
      memoriesCreated: memoryEvents.length,
      insightsGenerated: insightEvents.length,
      patternsLearned: 0,
      activeEmployees: activeEmps.length,
      topPerformer,
      totalEmployeeRuns: Object.values(empMissionCounts).reduce((sum, c) => sum + c.total, 0),
      injectionAttempts: injections.length,
      secretsRedacted: exfiltrations.length,
      avgMissionDurationMs: avgDurationMs,
      fastestMission: fastest
        ? { title: fastest.title, durationMs: missionDurationMs(fastest) }
        : null,
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    logger.error('OutcomeMetrics', `getBusinessMetrics error: ${msg}`)
    return emptyMetrics(periodLabel(periodDays))
  }
}

/**
 * Get per-employee outcome breakdown.
 */
export function getEmployeeOutcomes(periodDays = 7): EmployeeOutcomes[] {
  const since = new Date(Date.now() - periodDays * 86400000).toISOString()

  try {
    const empList = employees.list()
    const activeEmps = empList.filter(e => e.active !== 0)

    return activeEmps.map(emp => {
      const empMissions = missions.list({ employeeId: emp.slug, limit: 500 })
        .filter(m => m.createdAt >= since)
      const completed = empMissions.filter(m => m.status === 'done')
      const failed = empMissions.filter(m => m.status === 'failed')
      const totalCost = empMissions.reduce((sum, m) => sum + (m.costUsd ?? 0), 0)

      const recentActivity = activityEvents.list({ actorId: emp.slug, since, limit: 5 })

      return {
        slug: emp.slug,
        name: emp.name,
        title: emp.title,
        missionsCompleted: completed.length,
        missionsFailed: failed.length,
        successRate: empMissions.length > 0
          ? Math.round((completed.length / empMissions.length) * 100)
          : 0,
        totalCostUsd: Math.round(totalCost * 10000) / 10000,
        costPerMission: completed.length > 0
          ? Math.round((totalCost / completed.length) * 100) / 100
          : 0,
        topTaskTypes: [],
        recentActivity: recentActivity.map(e => e.summary),
      }
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    logger.error('OutcomeMetrics', `getEmployeeOutcomes error: ${msg}`)
    return []
  }
}

// ── Helpers ──────────────────────────────────────────────────

interface MissionCount { completed: number; total: number }

function computeEmployeeMissionCounts(
  allMissions: MissionRecord[],
  since: string,
): Record<string, MissionCount> {
  const counts: Record<string, MissionCount> = {}
  for (const m of allMissions) {
    if (m.createdAt < since || !m.assignedEmployee) continue
    const slug = m.assignedEmployee
    const entry = counts[slug] ?? { completed: 0, total: 0 }
    counts[slug] = {
      completed: entry.completed + (m.status === 'done' ? 1 : 0),
      total: entry.total + 1,
    }
  }
  return counts
}

function pickTopPerformer(
  activeEmps: { slug: string; name: string }[],
  empMissionCounts: Record<string, MissionCount>,
): { slug: string; name: string; successRate: number } | null {
  let best: { slug: string; name: string; successRate: number } | null = null
  for (const emp of activeEmps) {
    const counts = empMissionCounts[emp.slug]
    if (!counts || counts.total === 0) continue
    const rate = Math.round((counts.completed / counts.total) * 100)
    if (!best || rate > best.successRate) {
      best = { slug: emp.slug, name: emp.name, successRate: rate }
    }
  }
  return best
}

function emptyMetrics(period: string): BusinessMetrics {
  return {
    period,
    missionsCompleted: 0,
    missionsFailed: 0,
    missionSuccessRate: 0,
    prsOpened: 0,
    prsMerged: 0,
    totalCostUsd: 0,
    costPerMission: 0,
    costPerPr: 0,
    tokensSaved: 0,
    memoriesCreated: 0,
    insightsGenerated: 0,
    patternsLearned: 0,
    activeEmployees: 0,
    topPerformer: null,
    totalEmployeeRuns: 0,
    injectionAttempts: 0,
    secretsRedacted: 0,
    avgMissionDurationMs: 0,
    fastestMission: null,
  }
}
