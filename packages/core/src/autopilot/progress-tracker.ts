import { autopilot } from '@blade/db'

export interface BatchProgress {
  batchId: string
  name: string
  status: string
  totalJobs: number
  completedJobs: number
  failedJobs: number
  runningJobs: number
  queuedJobs: number
  totalCostUsd: number
  maxCostUsd: number | null
  budgetExceeded: boolean
  completionPercent: number
}

export function getBatchProgress(batchId: string): BatchProgress | null {
  const batch = autopilot.getBatch(batchId)
  if (!batch) return null

  const jobs = autopilot.listJobs(batchId)
  const running = jobs.filter(j => j.status === 'running').length
  const queued = jobs.filter(j => j.status === 'queued').length
  const budgetExceeded = batch.maxCostUsd != null && batch.totalCostUsd >= batch.maxCostUsd
  const completionPercent = batch.totalJobs > 0
    ? Math.round(((batch.completedJobs + batch.failedJobs) / batch.totalJobs) * 100)
    : 0

  return {
    batchId: batch.id,
    name: batch.name,
    status: batch.status,
    totalJobs: batch.totalJobs,
    completedJobs: batch.completedJobs,
    failedJobs: batch.failedJobs,
    runningJobs: running,
    queuedJobs: queued,
    totalCostUsd: batch.totalCostUsd,
    maxCostUsd: batch.maxCostUsd,
    budgetExceeded,
    completionPercent,
  }
}

export function isBatchComplete(batchId: string): boolean {
  const progress = getBatchProgress(batchId)
  if (!progress) return true
  return progress.queuedJobs === 0 && progress.runningJobs === 0
}
