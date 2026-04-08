import { initializeDb, jobs, jobLogs } from '@blade/db'
import { logger } from '@blade/shared'

export const runtime = 'nodejs'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
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

    const logs = jobLogs.listByJob(id)

    return Response.json({ success: true, data: { job, logs } })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get job'
    logger.error('Jobs', `GET [id] error: ${errorMessage}`)
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
