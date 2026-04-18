import { initializeDb, escalationRules } from '@blade/db'
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
    const resolvedParam = url.searchParams.get('resolved')
    const ruleId = url.searchParams.get('ruleId') ?? undefined
    const limitParam = url.searchParams.get('limit')
    const limit = limitParam ? parseInt(limitParam, 10) : undefined

    const filters: { ruleId?: string; resolved?: boolean; limit?: number } = {}
    if (ruleId !== undefined) filters.ruleId = ruleId
    if (resolvedParam !== null) filters.resolved = resolvedParam === 'true'
    if (limit !== undefined && !isNaN(limit)) filters.limit = limit

    const events = escalationRules.getEvents(filters)

    return Response.json({ success: true, data: events }, { headers: corsHeaders() })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to list escalation events'
    logger.error('Escalation', `GET events error: ${errorMessage}`)
    return Response.json({ success: false, error: errorMessage }, { status: 500, headers: corsHeaders() })
  }
}
