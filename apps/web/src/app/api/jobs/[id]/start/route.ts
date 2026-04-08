import { initializeDb, jobs } from '@blade/db'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'

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

    const job = jobs.get(id)
    if (!job) {
      return Response.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      )
    }

    const jobData = job as { id: string; title: string; description: string; repoUrl: string; baseBranch: string; agentModel: string }

    // Run pipeline in background (don't await)
    import('@blade/core').then(({ runCodingPipeline }) => {
      runCodingPipeline({
        jobId: jobData.id,
        title: jobData.title,
        description: jobData.description,
        repoUrl: jobData.repoUrl,
        baseBranch: jobData.baseBranch,
        agentModel: jobData.agentModel,
        githubToken: process.env.GITHUB_TOKEN ?? '',
      }).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Pipeline crashed'
        logger.error('Jobs', `Pipeline error for ${id}: ${msg}`)
        jobs.updateStatus(id, 'failed', { error: msg })
      })
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to load @blade/core'
      logger.error('Jobs', `Import error: ${msg}`)
      jobs.updateStatus(id, 'failed', { error: msg })
    })

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
