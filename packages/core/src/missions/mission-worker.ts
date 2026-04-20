import { missions } from '@blade/db'
import { logger } from '@blade/shared'
import { executeMission } from './mission-executor.js'
import type { WorkerConfig } from './types.js'

let workerInterval: ReturnType<typeof setInterval> | null = null
let clarificationInterval: ReturnType<typeof setInterval> | null = null
let isProcessing = false
const activeMissions = new Map<string, string>()

export function startMissionWorker(config: WorkerConfig): void {
  if (workerInterval) {
    logger.warn('mission-worker', 'Worker already running')
    return
  }

  logger.info('mission-worker', `Starting mission worker (poll every ${config.pollIntervalMs}ms)`)

  const resetCount = missions.resetStaleLive(15 * 60 * 1000)
  if (resetCount > 0) {
    logger.info('mission-worker', `Reset ${resetCount} stale live missions to queued`)
  }

  workerInterval = setInterval(() => {
    if (!isProcessing) {
      processQueue(config).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        logger.error('mission-worker', `Queue processing error: ${msg}`)
      })
    }
  }, config.pollIntervalMs)

  clarificationInterval = setInterval(() => {
    checkClarificationTimeouts(config).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('mission-worker', `Clarification timeout check error: ${msg}`)
    })
  }, 30_000)
}

export function stopMissionWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval)
    workerInterval = null
  }
  if (clarificationInterval) {
    clearInterval(clarificationInterval)
    clarificationInterval = null
  }
  logger.info('mission-worker', 'Worker stopped')
}

async function processQueue(config: WorkerConfig): Promise<void> {
  isProcessing = true

  try {
    const busyEmployees = [...activeMissions.keys()]
    const mission = missions.getNextQueued(busyEmployees)
    if (!mission) return

    activeMissions.set(mission.assignedEmployee!, mission.id)

    logger.info('mission-worker', `Picked up mission "${mission.title}" for ${mission.assignedEmployee}`)

    await config.notifyTelegram(
      `[${mission.assignedEmployee}] Starting: ${mission.title}`
    ).catch(() => {})

    try {
      const result = await executeMission({
        missionId: mission.id,
      })

      const resultJson = JSON.stringify(result)
      const priority = parsePriority(mission.priority)

      if (priority >= 6) {
        missions.setPendingReview(mission.id, resultJson, result.summary, result.costUsd)

        const dashboardLink = `${config.dashboardUrl}/missions`
        await config.notifyTelegram(
          `[${mission.assignedEmployee}] Completed: ${mission.title}\n\n` +
          `Summary: ${result.summary}\n\n` +
          `Cost: $${result.costUsd.toFixed(4)} | Confidence: ${(result.confidence * 100).toFixed(0)}%\n\n` +
          `Review: ${dashboardLink}`
        ).catch(() => {})
      } else {
        missions.complete(mission.id, resultJson, result.summary, result.costUsd)

        await config.notifyTelegram(
          `[${mission.assignedEmployee}] Done: ${mission.title} — ` +
          `${result.artifacts.length} artifacts, $${result.costUsd.toFixed(4)} cost`
        ).catch(() => {})
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)

      const retryCount = missions.incrementRetry(mission.id)
      if (retryCount >= config.maxRetriesPerMission) {
        missions.fail(mission.id, msg)
        await config.notifyTelegram(
          `[${mission.assignedEmployee}] Failed: ${mission.title} — ${msg}`
        ).catch(() => {})
      } else {
        logger.warn('mission-worker', `Mission "${mission.title}" failed (attempt ${retryCount}/${config.maxRetriesPerMission}), requeueing`)
      }
    } finally {
      activeMissions.delete(mission.assignedEmployee!)
    }
  } finally {
    isProcessing = false
  }
}

async function checkClarificationTimeouts(config: WorkerConfig): Promise<void> {
  const awaiting = missions.getAwaitingInput()

  for (const mission of awaiting) {
    if (!mission.questionAskedAt) continue

    const askedAt = new Date(mission.questionAskedAt).getTime()
    const elapsed = Date.now() - askedAt

    if (elapsed >= config.clarificationTimeoutMs) {
      logger.info('mission-worker', `Clarification timeout for mission "${mission.title}" — re-notifying`)
      await config.notifyTelegram(
        `[Reminder] ${mission.assignedEmployee} is still waiting for your response on "${mission.title}": ${mission.questions}`
      ).catch(() => {})
    }
  }
}

function parsePriority(priority: string): number {
  const num = parseInt(priority, 10)
  if (!isNaN(num)) return num
  const map: Record<string, number> = { critical: 10, high: 8, medium: 5, low: 2 }
  return map[priority.toLowerCase()] ?? 5
}
