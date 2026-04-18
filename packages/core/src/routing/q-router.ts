import { routing } from '@blade/db'
import type { TaskType } from './task-classifier.js'
import { calculateReward } from './reward-calculator.js'
import type { MissionOutcome } from './reward-calculator.js'

export interface QRouterConfig {
  alpha: number
  gamma: number
  epsilon: number
  minEpsilon: number
  coldStartThreshold: number
}

const DEFAULT_CONFIG: QRouterConfig = {
  alpha: 0.1,
  gamma: 0.9,
  epsilon: 0.15,
  minEpsilon: 0.05,
  coldStartThreshold: 5,
}

function mergeConfig(overrides?: Partial<QRouterConfig>): QRouterConfig {
  return { ...DEFAULT_CONFIG, ...overrides }
}

function hasSufficientData(taskType: string, config: QRouterConfig): boolean {
  const stats = routing.getTaskTypeStats()
  const stat = stats.find(s => s.taskType === taskType)
  return stat !== undefined && stat.totalVisits >= config.coldStartThreshold
}

export function selectEmployee(
  taskType: TaskType,
  availableEmployees: string[],
  config?: Partial<QRouterConfig>
): { employeeSlug: string; method: 'q_learning' | 'exploration' | 'cold_start' } {
  const cfg = mergeConfig(config)

  if (!hasSufficientData(taskType, cfg)) {
    return { employeeSlug: availableEmployees[0], method: 'cold_start' }
  }

  const epsilon = Math.max(cfg.minEpsilon, cfg.epsilon)

  if (Math.random() < epsilon) {
    const idx = Math.floor(Math.random() * availableEmployees.length)
    return { employeeSlug: availableEmployees[idx], method: 'exploration' }
  }

  const qValues = routing.getAllQValues(taskType)
  const knownSlugs = new Set(qValues.map(q => q.employeeSlug))

  for (const q of qValues) {
    if (availableEmployees.includes(q.employeeSlug)) {
      return { employeeSlug: q.employeeSlug, method: 'q_learning' }
    }
  }

  const unknown = availableEmployees.filter(s => !knownSlugs.has(s))
  if (unknown.length > 0) {
    const idx = Math.floor(Math.random() * unknown.length)
    return { employeeSlug: unknown[idx], method: 'exploration' }
  }

  return { employeeSlug: availableEmployees[0], method: 'exploration' }
}

export function updateQValue(
  taskType: TaskType,
  employeeSlug: string,
  reward: number,
  config?: Partial<QRouterConfig>
): void {
  const cfg = mergeConfig(config)
  const existing = routing.getQValue(taskType, employeeSlug)
  const currentQ = existing?.qValue ?? 0.5
  const newQ = currentQ + cfg.alpha * (reward - currentQ)
  routing.upsertQValue(taskType, employeeSlug, newQ, reward)
}

export function recordRoutingDecision(
  taskType: TaskType,
  taskDescription: string,
  selectedEmployee: string,
  method: string,
  missionId?: string
): string {
  const episode = routing.createEpisode({
    taskType,
    taskDescription,
    selectedEmployee,
    selectionMethod: method,
    missionId,
  })
  return episode.id
}

export function processOutcome(missionId: string, outcome: MissionOutcome): void {
  const episode = routing.getEpisodeByMission(missionId)
  if (!episode) return

  const reward = calculateReward(outcome)

  routing.resolveEpisode(
    episode.id,
    reward,
    outcome.status,
    outcome.costUsd,
    outcome.durationMs
  )

  updateQValue(episode.taskType as TaskType, episode.selectedEmployee, reward)
}
