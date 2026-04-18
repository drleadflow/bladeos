import { autopilot } from '@blade/db'
import { logger } from '@blade/shared'

export interface StallCheckResult {
  stalledCount: number
  retriedCount: number
  failedCount: number
}

/**
 * Check for stalled jobs in a batch and either retry or fail them.
 */
export function checkForStalledJobs(batchId: string, stallTimeoutMs: number): StallCheckResult {
  const stalledJobs = autopilot.getStalled(stallTimeoutMs)
  const batchStalled = stalledJobs.filter(j => j.batchRunId === batchId)

  let retriedCount = 0
  let failedCount = 0

  for (const job of batchStalled) {
    if (job.retryCount < job.maxRetries) {
      autopilot.retryJob(job.id)
      retriedCount++
      logger.warn('StallDetector', `Retrying stalled job "${job.title}" (attempt ${job.retryCount + 1}/${job.maxRetries})`)
    } else {
      autopilot.failJob(job.id, `Stalled after ${job.maxRetries} retries`)
      autopilot.incrementFailed(batchId)
      failedCount++
      logger.error('StallDetector', `Failed stalled job "${job.title}" after max retries`)
    }
  }

  return { stalledCount: batchStalled.length, retriedCount, failedCount }
}
