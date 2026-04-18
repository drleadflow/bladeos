import { goals } from '@blade/db'
import { logger } from '@blade/shared'

export interface GoalProgress {
  id: string
  title: string
  category: string
  metricName: string
  metricUnit: string
  targetValue: number
  currentValue: number
  progressPercent: number
  status: string
  priority: string
  assignedAgents: string[]
  deadline: string | null
  onTrack: boolean
}

/**
 * Get all active goals with progress calculations.
 */
export function getGoalsDashboard(): GoalProgress[] {
  const activeGoals = goals.list({ status: 'active' })

  return activeGoals.map(goal => {
    const agents = goals.getAgents(goal.id)
    const progressPercent = goal.targetValue > 0
      ? Math.min(100, Math.round((goal.currentValue / goal.targetValue) * 100))
      : 0

    let onTrack = true
    if (goal.deadline) {
      const totalMs = new Date(goal.deadline).getTime() - new Date(goal.createdAt).getTime()
      const elapsedMs = Date.now() - new Date(goal.createdAt).getTime()
      const expectedPercent = totalMs > 0 ? Math.round((elapsedMs / totalMs) * 100) : 100
      onTrack = progressPercent >= expectedPercent * 0.8
    }

    return {
      id: goal.id,
      title: goal.title,
      category: goal.category,
      metricName: goal.metricName,
      metricUnit: goal.metricUnit,
      targetValue: goal.targetValue,
      currentValue: goal.currentValue,
      progressPercent,
      status: goal.status,
      priority: goal.priority,
      assignedAgents: agents.map(a => a.employeeSlug),
      deadline: goal.deadline,
      onTrack,
    }
  })
}

/**
 * Record progress from an agent activity.
 * Called by the agent loop or mission completion hooks.
 */
export function recordAgentContribution(
  employeeSlug: string,
  metricName: string,
  delta: number,
  note?: string
): number {
  const employeeGoals = goals.getGoalsForEmployee(employeeSlug)
  let updated = 0

  for (const goal of employeeGoals) {
    if (goal.metricName === metricName) {
      goals.incrementProgress(goal.id, delta, 'agent', employeeSlug, note)
      updated++
      logger.info('GoalTracker', `${employeeSlug} contributed ${delta} to goal "${goal.title}" (${metricName})`)
    }
  }

  return updated
}
