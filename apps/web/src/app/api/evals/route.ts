import { initializeDb, jobEvals } from '@blade/db'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'

export async function GET(request: Request): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    initializeDb()
    const url = new URL(request.url)
    const view = url.searchParams.get('view') ?? 'summary'

    if (view === 'summary') {
      const days = parseInt(url.searchParams.get('days') ?? '30', 10)
      const language = url.searchParams.get('language') ?? undefined
      const model = url.searchParams.get('model') ?? undefined
      const summary = jobEvals.successRate({ days, language, model })
      return Response.json({ success: true, data: summary })
    }

    if (view === 'trend') {
      const days = parseInt(url.searchParams.get('days') ?? '90', 10)
      const bucketDays = parseInt(url.searchParams.get('bucketDays') ?? '7', 10)
      const trend = jobEvals.trend({ days, bucketDays })
      return Response.json({ success: true, data: trend })
    }

    if (view === 'recent') {
      const limit = parseInt(url.searchParams.get('limit') ?? '20', 10)
      const recent = jobEvals.recent(limit)
      return Response.json({ success: true, data: recent })
    }

    if (view === 'job') {
      const jobId = url.searchParams.get('jobId')
      if (!jobId) {
        return Response.json({ success: false, error: 'jobId is required' }, { status: 400 })
      }
      const evalData = jobEvals.getByJob(jobId)
      return Response.json({ success: true, data: evalData ?? null })
    }

    return Response.json({ success: false, error: `Unknown view: ${view}` }, { status: 400 })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get eval data'
    logger.error('Evals', `GET error: ${errorMessage}`)
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
