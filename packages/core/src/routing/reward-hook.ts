import { processOutcome } from './q-router.js'
import type { MissionOutcome } from './reward-calculator.js'

/** Call this whenever a mission completes or fails */
export function onMissionComplete(
  missionId: string,
  status: 'done' | 'failed',
  costUsd: number,
  startedAt: string,
  completedAt: string
): void {
  const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime()
  const outcome: MissionOutcome = { status, costUsd, durationMs }
  processOutcome(missionId, outcome)
}
