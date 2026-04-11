import { logger } from '@blade/shared'

export interface QueuedJob {
  readonly id: string
  readonly priority: number  // lower = higher priority
  readonly createdAt: string
  readonly data: {
    readonly title: string
    readonly description: string
    readonly repoUrl: string
    readonly baseBranch?: string
    readonly agentModel?: string
  }
}

export type QueueJobStatus = 'queued' | 'running' | 'completed' | 'failed'

interface QueueEntry {
  job: QueuedJob
  status: QueueJobStatus
  startedAt?: string
  completedAt?: string
  error?: string
}

export interface JobQueueOptions {
  maxConcurrent?: number  // default: 2
  onJobStart?: (job: QueuedJob) => void
  onJobComplete?: (job: QueuedJob, result: unknown) => void
  onJobFailed?: (job: QueuedJob, error: Error) => void
}

export class JobQueue {
  private readonly queue: QueueEntry[] = []
  private readonly running = new Map<string, QueueEntry>()
  private readonly completed = new Map<string, QueueEntry>()
  private readonly maxConcurrent: number
  private readonly options: JobQueueOptions
  private processing = false

  constructor(options: JobQueueOptions = {}) {
    this.maxConcurrent = options.maxConcurrent ?? 2
    this.options = options
  }

  enqueue(job: QueuedJob): void {
    this.queue.push({ job, status: 'queued' })
    // Sort by priority (lower number = higher priority), then by creation time
    this.queue.sort((a, b) => {
      if (a.job.priority !== b.job.priority) return a.job.priority - b.job.priority
      return a.job.createdAt.localeCompare(b.job.createdAt)
    })
    logger.info('JobQueue', `Enqueued job ${job.id}: ${job.data.title} (priority: ${job.priority}, queue size: ${this.queue.length})`)
    this.processNext()
  }

  private async processNext(): Promise<void> {
    if (this.processing) return
    this.processing = true

    try {
      while (this.running.size < this.maxConcurrent && this.queue.length > 0) {
        const entry = this.queue.shift()
        if (!entry) break

        entry.status = 'running'
        entry.startedAt = new Date().toISOString()
        this.running.set(entry.job.id, entry)

        logger.info('JobQueue', `Starting job ${entry.job.id}: ${entry.job.data.title} (${this.running.size}/${this.maxConcurrent} slots used)`)
        this.options.onJobStart?.(entry.job)

        // Run job asynchronously - don't await here so we can start multiple
        this.executeJob(entry).catch(() => {
          // Error handling is done inside executeJob
        })
      }
    } finally {
      this.processing = false
    }
  }

  private async executeJob(entry: QueueEntry): Promise<void> {
    try {
      // The actual job execution will be wired up by the caller via a job runner
      // For now, this is a framework - the pipeline integration comes later
      entry.status = 'completed'
      entry.completedAt = new Date().toISOString()
      this.options.onJobComplete?.(entry.job, undefined)
    } catch (err) {
      entry.status = 'failed'
      entry.completedAt = new Date().toISOString()
      entry.error = err instanceof Error ? err.message : String(err)
      this.options.onJobFailed?.(entry.job, err instanceof Error ? err : new Error(String(err)))
    } finally {
      this.running.delete(entry.job.id)
      this.completed.set(entry.job.id, entry)
      logger.info('JobQueue', `Job ${entry.job.id} ${entry.status}. Queue: ${this.queue.length}, Running: ${this.running.size}`)
      // Process next job in queue
      this.processNext()
    }
  }

  getStatus(jobId: string): QueueEntry | undefined {
    // Check running first, then completed, then queued
    return this.running.get(jobId)
      ?? this.completed.get(jobId)
      ?? this.queue.find(e => e.job.id === jobId)
  }

  getQueueLength(): number { return this.queue.length }
  getRunningCount(): number { return this.running.size }

  listAll(): readonly QueueEntry[] {
    return [
      ...this.queue,
      ...[...this.running.values()],
      ...[...this.completed.values()],
    ]
  }

  cancel(jobId: string): boolean {
    const idx = this.queue.findIndex(e => e.job.id === jobId)
    if (idx !== -1) {
      this.queue.splice(idx, 1)
      logger.info('JobQueue', `Cancelled queued job ${jobId}`)
      return true
    }
    return false
  }
}

// Singleton instance
let _queue: JobQueue | null = null

export function getJobQueue(options?: JobQueueOptions): JobQueue {
  if (!_queue) {
    _queue = new JobQueue(options)
  }
  return _queue
}
