import { initializeDb, reasoningPatterns } from '@blade/db'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'
import { corsHeaders, corsOptionsResponse } from '@/lib/cors'

export const runtime = 'nodejs'

export async function OPTIONS(): Promise<Response> {
  return corsOptionsResponse()
}

export async function GET(request: Request): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    initializeDb()
    const url = new URL(request.url)
    const taskType = url.searchParams.get('taskType') ?? undefined
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 20), 100)

    if (taskType) {
      const patterns = reasoningPatterns.listByTaskType(taskType, limit)
      return Response.json(
        { success: true, data: { patterns, taskType, total: patterns.length } },
        { headers: corsHeaders() }
      )
    }

    const stats = reasoningPatterns.getStats()
    return Response.json(
      { success: true, data: stats },
      { headers: corsHeaders() }
    )
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get reasoning patterns'
    logger.error('ReasoningPatterns', `GET error: ${errorMessage}`)
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500, headers: corsHeaders() }
    )
  }
}
