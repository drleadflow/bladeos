import cron, { type ScheduledTask } from 'node-cron'
import { readFileSync } from 'fs'
import { runAgentLoop } from '../agent-loop.js'
import { runCodingPipeline } from '../pipeline/index.js'

export interface CronJob {
  id: string
  name: string
  schedule: string
  task: string
  repoUrl?: string
  model?: string
  enabled: boolean
}

const activeTasks: Map<string, ScheduledTask> = new Map()

export function startScheduler(jobs: readonly CronJob[]): void {
  for (const job of jobs) {
    if (!job.enabled) {
      console.log(`[cron] Skipping disabled job: ${job.name} (${job.id})`)
      continue
    }

    if (!cron.validate(job.schedule)) {
      console.error(`[cron] Invalid schedule for job ${job.id}: ${job.schedule}`)
      continue
    }

    const scheduledTask = cron.schedule(job.schedule, async () => {
      const startTime = Date.now()
      console.log(`[cron] Starting job: ${job.name} (${job.id})`)

      try {
        if (job.repoUrl) {
          await runCodingPipeline({
            jobId: `cron-${job.id}-${Date.now()}`,
            title: job.name,
            description: job.task,
            repoUrl: job.repoUrl,
            baseBranch: 'main',
            agentModel: job.model ?? 'claude-sonnet-4-20250514',
            githubToken: process.env.GITHUB_TOKEN ?? '',
          })
        } else {
          await runAgentLoop({
            systemPrompt: 'You are Blade, an AI agent running a scheduled task.',
            messages: [{ role: 'user', content: job.task }],
            tools: [],
            context: {
              conversationId: `cron-${job.id}-${Date.now()}`,
              userId: 'cron',
              modelId: job.model ?? 'claude-sonnet-4-20250514',
              maxIterations: 10,
              costBudget: 0,
            },
          })
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
        console.log(`[cron] Completed job: ${job.name} (${job.id}) in ${elapsed}s`)
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[cron] Job failed: ${job.name} (${job.id}) - ${message}`)
      }
    })

    activeTasks.set(job.id, scheduledTask)
    console.log(`[cron] Scheduled job: ${job.name} (${job.id}) [${job.schedule}]`)
  }
}

export function stopScheduler(): void {
  for (const [id, task] of activeTasks) {
    task.stop()
    console.log(`[cron] Stopped job: ${id}`)
  }
  activeTasks.clear()
}

export function loadCronsFromFile(path: string): CronJob[] {
  const raw = readFileSync(path, 'utf-8')
  const parsed: unknown = JSON.parse(raw)

  if (!Array.isArray(parsed)) {
    throw new Error(`Expected an array of cron jobs in ${path}`)
  }

  return parsed as CronJob[]
}
