import { initializeDb, workerSessions, jobs, jobLogs, activityEvents } from '@blade/db'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'
import { launchJobPipeline } from '@/lib/job-runner'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    initializeDb()
    const { id } = await params
    const worker = workerSessions.get(id)

    if (!worker) {
      return Response.json({ success: false, error: 'Worker not found' }, { status: 404 })
    }

    const job = worker.jobId ? jobs.get(worker.jobId) : null
    const logs = worker.jobId ? jobLogs.listByJob(worker.jobId, 100) : []
    const activity = activityEvents.list({
      limit: 30,
      targetType: 'conversation',
      targetId: worker.conversationId ?? undefined,
    })

    return Response.json({
      success: true,
      data: { worker, job, logs, activity },
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to load worker'
    logger.error('Workers', `GET detail error: ${errorMessage}`)
    return Response.json({ success: false, error: errorMessage }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    initializeDb()
    const { id } = await params
    const worker = workerSessions.get(id)

    if (!worker) {
      return Response.json({ success: false, error: 'Worker not found' }, { status: 404 })
    }

    const body = await request.json()
    const action = typeof body?.action === 'string' ? body.action : ''
    const now = new Date().toISOString()
    const job = worker.jobId ? jobs.get(worker.jobId) as {
      id: string
      title: string
      description: string
      repoUrl: string
      baseBranch: string
      agentModel: string
      status: string
    } | null : null

    if (action === 'stop') {
      if (!job) {
        return Response.json({ success: false, error: 'Only job-backed workers can be stopped right now' }, { status: 400 })
      }

      if (['completed', 'failed', 'stopped'].includes(job.status)) {
        return Response.json({ success: false, error: `Worker is already ${job.status}` }, { status: 409 })
      }

      workerSessions.requestAction(id, 'stop', 'operator')
      workerSessions.update(id, {
        status: 'stopping',
        latestSummary: 'Stop requested. Blade will halt after the current safe step.',
        lastSeenAt: now,
      })

      try {
        activityEvents.emit({
          eventType: 'worker_stop_requested',
          actorType: 'system',
          actorId: 'operator',
          summary: `Stop requested for ${worker.name}`,
          targetType: 'worker',
          targetId: id,
          jobId: worker.jobId ?? undefined,
          conversationId: worker.conversationId ?? undefined,
        })
      } catch {
        // best-effort
      }

      return Response.json({
        success: true,
        data: {
          action,
          status: 'accepted',
          message: 'Stop requested. The worker will stop after its current safe step.',
        },
      })
    }

    if (action === 'retry') {
      if (!job) {
        return Response.json({ success: false, error: 'Only job-backed workers can be retried right now' }, { status: 400 })
      }

      if (!['failed', 'completed', 'stopped'].includes(job.status)) {
        return Response.json({ success: false, error: `Worker cannot be retried while ${job.status}` }, { status: 409 })
      }

      jobs.updateStatus(job.id, 'cloning', {
        containerName: null,
        prUrl: null,
        prNumber: null,
        totalCost: 0,
        totalToolCalls: 0,
        totalIterations: 0,
        error: null,
        completedAt: null,
      })
      workerSessions.clearRequestedAction(id)
      workerSessions.update(id, {
        status: 'booting',
        runtime: 'pending',
        containerName: null,
        conversationId: `job-${job.id}`,
        latestSummary: 'Retry requested. Worker is preparing a fresh run.',
        startedAt: now,
        completedAt: null,
        lastSeenAt: now,
      })

      try {
        activityEvents.emit({
          eventType: 'worker_retry_requested',
          actorType: 'system',
          actorId: 'operator',
          summary: `Retry requested for ${worker.name}`,
          targetType: 'worker',
          targetId: id,
          jobId: worker.jobId ?? undefined,
          conversationId: `job-${job.id}`,
        })
      } catch {
        // best-effort
      }

      launchJobPipeline(job)

      return Response.json({
        success: true,
        data: {
          action,
          status: 'accepted',
          message: 'Retry requested. Blade is launching a fresh worker run.',
        },
      })
    }

    return Response.json({ success: false, error: 'Unsupported worker action' }, { status: 400 })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to act on worker'
    logger.error('Workers', `POST detail error: ${errorMessage}`)
    return Response.json({ success: false, error: errorMessage }, { status: 500 })
  }
}
