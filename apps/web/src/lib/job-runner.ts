import { jobs, workerSessions, activityEvents } from '@blade/db'
import { logger } from '@blade/shared'

interface JobRunnerData {
  id: string
  title: string
  description: string
  repoUrl: string
  baseBranch: string
  agentModel: string
}

export function launchJobPipeline(job: JobRunnerData): void {
  import('@blade/core').then(({ runCodingPipeline }) => {
    runCodingPipeline({
      jobId: job.id,
      title: job.title,
      description: job.description,
      repoUrl: job.repoUrl,
      baseBranch: job.baseBranch,
      agentModel: job.agentModel,
      githubToken: process.env.GITHUB_TOKEN ?? '',
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Pipeline crashed'
      logger.error('Jobs', `Pipeline error for ${job.id}: ${msg}`)
      jobs.updateStatus(job.id, 'failed', { error: msg })
      workerSessions.update(job.id, {
        status: 'failed',
        latestSummary: msg,
        lastSeenAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      })
      try {
        activityEvents.emit({
          eventType: 'worker_failed',
          actorType: 'system',
          actorId: 'worker-control',
          summary: `Worker ${job.title} failed: ${msg}`,
          targetType: 'worker',
          targetId: job.id,
          conversationId: `job-${job.id}`,
          jobId: job.id,
        })
      } catch {
        // best-effort only
      }
    })
  }).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Failed to load @blade/core'
    logger.error('Jobs', `Import error: ${msg}`)
    jobs.updateStatus(job.id, 'failed', { error: msg })
    workerSessions.update(job.id, {
      status: 'failed',
      latestSummary: msg,
      lastSeenAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    })
  })
}
