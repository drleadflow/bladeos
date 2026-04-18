import { autopilot } from '@blade/db'
import { logger } from '@blade/shared'
import { checkForStalledJobs } from './stall-detector.js'
import { getBatchProgress, isBatchComplete } from './progress-tracker.js'

export interface BatchRunnerOptions {
  onJobStart?: (jobId: string, title: string) => Promise<void>
  onJobComplete?: (jobId: string, title: string, costUsd: number) => void
  onJobFail?: (jobId: string, title: string, error: string) => void
  onBatchComplete?: (batchId: string) => void
  pollIntervalMs?: number
}

const activeBatches = new Map<string, NodeJS.Timeout>()

/**
 * Start a batch run. Jobs will be executed via the onJobStart callback.
 * The runner manages concurrency, stall detection, and budget limits.
 */
export function startBatch(batchId: string, options: BatchRunnerOptions): void {
  const batch = autopilot.getBatch(batchId)
  if (!batch) throw new Error(`Batch ${batchId} not found`)
  if (batch.status !== 'running') throw new Error(`Batch ${batchId} is ${batch.status}, not running`)

  const pollInterval = options.pollIntervalMs ?? 15_000

  const tick = async (): Promise<void> => {
    try {
      await runBatchTick(batchId, options)
    } catch (err) {
      logger.error('BatchRunner', `Tick error for batch ${batchId}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  void tick()
  const interval = setInterval(() => void tick(), pollInterval)
  activeBatches.set(batchId, interval)

  logger.info('BatchRunner', `Started batch "${batch.name}" with ${batch.totalJobs} jobs (max ${batch.maxConcurrent} concurrent)`)
}

export function stopBatch(batchId: string): void {
  const interval = activeBatches.get(batchId)
  if (interval) {
    clearInterval(interval)
    activeBatches.delete(batchId)
  }
  autopilot.updateBatchStatus(batchId, 'paused')
  logger.info('BatchRunner', `Stopped batch ${batchId}`)
}

export function cancelBatch(batchId: string): void {
  const interval = activeBatches.get(batchId)
  if (interval) {
    clearInterval(interval)
    activeBatches.delete(batchId)
  }
  autopilot.updateBatchStatus(batchId, 'cancelled')
  logger.info('BatchRunner', `Cancelled batch ${batchId}`)
}

export function getActiveBatchIds(): string[] {
  return [...activeBatches.keys()]
}

async function runBatchTick(batchId: string, options: BatchRunnerOptions): Promise<void> {
  const batch = autopilot.getBatch(batchId)
  if (!batch || batch.status !== 'running') {
    const interval = activeBatches.get(batchId)
    if (interval) {
      clearInterval(interval)
      activeBatches.delete(batchId)
    }
    return
  }

  if (batch.maxCostUsd != null && batch.totalCostUsd >= batch.maxCostUsd) {
    logger.warn('BatchRunner', `Budget exceeded for batch "${batch.name}" ($${batch.totalCostUsd.toFixed(2)} >= $${batch.maxCostUsd.toFixed(2)})`)
    autopilot.updateBatchStatus(batchId, 'budget_exceeded')
    const interval = activeBatches.get(batchId)
    if (interval) {
      clearInterval(interval)
      activeBatches.delete(batchId)
    }
    return
  }

  checkForStalledJobs(batchId, batch.stallTimeoutMs)

  if (isBatchComplete(batchId)) {
    autopilot.updateBatchStatus(batchId, 'completed')
    const interval = activeBatches.get(batchId)
    if (interval) {
      clearInterval(interval)
      activeBatches.delete(batchId)
    }
    options.onBatchComplete?.(batchId)
    const progress = getBatchProgress(batchId)
    logger.info('BatchRunner', `Batch "${batch.name}" completed: ${progress?.completedJobs ?? 0} succeeded, ${progress?.failedJobs ?? 0} failed, $${progress?.totalCostUsd.toFixed(2) ?? '0'} total`)
    return
  }

  const runningJobs = autopilot.listJobs(batchId, 'running')
  const slotsAvailable = batch.maxConcurrent - runningJobs.length

  for (let i = 0; i < slotsAvailable; i++) {
    const nextJob = autopilot.getNextQueued(batchId)
    if (!nextJob) break

    autopilot.startJob(nextJob.id)
    logger.info('BatchRunner', `Starting batch job "${nextJob.title}"`)

    if (options.onJobStart) {
      options.onJobStart(nextJob.id, nextJob.title)
        .then(() => {
          // Caller is responsible for calling autopilot.completeJob
        })
        .catch((err: unknown) => {
          const errorMsg = err instanceof Error ? err.message : String(err)
          autopilot.failJob(nextJob.id, errorMsg)
          autopilot.incrementFailed(batchId)
          options.onJobFail?.(nextJob.id, nextJob.title, errorMsg)
        })
    }
  }
}
