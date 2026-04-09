import { initializeDb, jobs, workerSessions } from '@blade/db'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'
import { launchJobPipeline } from '@/lib/job-runner'

export const runtime = 'nodejs'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')
  try {
    const { id } = await params
    initializeDb()

    // Prevent duplicate starts
    const job = jobs.get(id)
    if (!job) {
      return Response.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      )
    }

    const jobStatus = (job as { status: string }).status
    if (jobStatus !== 'queued') {
      return Response.json(
        { success: false, error: `Job is already ${jobStatus}. Cannot start again.` },
        { status: 409 }
      )
    }

    // Mark as started immediately to prevent race conditions
    jobs.updateStatus(id, 'cloning')
    workerSessions.update(id, {
      status: 'booting',
      runtime: 'pending',
      conversationId: `job-${id}`,
      latestSummary: 'Worker booting and preparing repository clone.',
      startedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    })

    const jobData = job as { id: string; title: string; description: string; repoUrl: string; baseBranch: string; agentModel: string }

    // Run pipeline in background (don't await)
    launchJobPipeline(jobData)

    return Response.json({
      success: true,
      message: 'Job started',
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to start job'
    logger.error('Jobs', `POST start error: ${errorMessage}`)
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
