export interface MissionOutcome {
  status: 'done' | 'failed'
  costUsd: number
  durationMs: number
  expectedBudget?: number
}

const TWO_MINUTES_MS = 2 * 60 * 1000

export function calculateReward(outcome: MissionOutcome): number {
  let reward = outcome.status === 'done' ? 0.8 : 0.1

  if (outcome.status === 'done' && outcome.expectedBudget && outcome.expectedBudget > 0) {
    const ratio = outcome.costUsd / outcome.expectedBudget
    if (ratio < 0.5) {
      reward += 0.1
    } else if (ratio < 0.75) {
      reward += 0.05
    }
  }

  if (outcome.status === 'done' && outcome.durationMs < TWO_MINUTES_MS) {
    reward += 0.1
  }

  return Math.min(1.0, Math.max(0.0, reward))
}
