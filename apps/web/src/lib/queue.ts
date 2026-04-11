import { Queue, Worker } from 'bullmq'
import { getRedis } from './redis'
import { launchJobPipeline } from './job-runner'
import { logger } from '@blade/shared'
import { jobs, workerSessions, activityEvents } from '@blade/db'

const QUEUE_NAME = 'blade-jobs'

let _queue: Queue | null = null
let _worker: Worker | null = null

export interface BladeJobData {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly repoUrl: string
  readonly baseBranch: string
  readonly agentModel: string
}

export function getQueue(): Queue {
  if (_queue) return _queue

  _queue = new Queue(QUEUE_NAME, {
    connection: getRedis(),
    defaultJobOptions: {
      attempts: 1, // Coding pipelines shouldn't auto-retry
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  })

  return _queue
}

export async function enqueueJob(data: BladeJobData, priority = 0): Promise<string> {
  const queue = getQueue()
  const job = await queue.add(data.id, data, {
    jobId: data.id,
    priority,
  })
  logger.info('Queue', `Enqueued job ${data.id}: ${data.title} (priority: ${priority})`)
  return job.id ?? data.id
}

export function initWorker(): Worker {
  if (_worker) return _worker

  _worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const data = job.data as BladeJobData
      logger.info('Queue', `Worker picked up job ${data.id}: ${data.title}`)

      // Update job status to running
      jobs.updateStatus(data.id, 'running')
      workerSessions.update(data.id, {
        status: 'running',
        lastSeenAt: new Date().toISOString(),
      })

      // Launch the pipeline (this is fire-and-forget internally but we await the import)
      launchJobPipeline(data)
    },
    {
      connection: getRedis(),
      concurrency: 2,
    }
  )

  _worker.on('completed', (job) => {
    logger.info('Queue', `Job ${job.id} completed via worker`)
  })

  _worker.on('failed', (job, err) => {
    const jobId = job?.id ?? 'unknown'
    logger.error('Queue', `Job ${jobId} failed: ${err.message}`)

    if (job) {
      jobs.updateStatus(jobId, 'failed', { error: err.message })
      workerSessions.update(jobId, {
        status: 'failed',
        latestSummary: err.message,
        lastSeenAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      })
      try {
        activityEvents.emit({
          eventType: 'worker_failed',
          actorType: 'system',
          actorId: 'worker-control',
          summary: `Worker ${jobId} failed: ${err.message}`,
          targetType: 'worker',
          targetId: jobId,
          conversationId: `job-${jobId}`,
          jobId,
        })
      } catch {
        // best-effort
      }
    }
  })

  logger.info('Queue', `Worker initialized (concurrency: 2)`)
  return _worker
}

export async function getJobStatus(jobId: string): Promise<{
  state: string
  progress: number
} | null> {
  const queue = getQueue()
  const job = await queue.getJob(jobId)
  if (!job) return null
  const state = await job.getState()
  return { state, progress: job.progress as number ?? 0 }
}

export async function cancelJob(jobId: string): Promise<boolean> {
  const queue = getQueue()
  const job = await queue.getJob(jobId)
  if (!job) return false
  const state = await job.getState()
  if (state === 'waiting' || state === 'delayed') {
    await job.remove()
    return true
  }
  return false
}
