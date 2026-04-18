import { initializeDb } from '@blade/db'
import { evaluateAllRules } from '@blade/core'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'
import { corsHeaders, corsOptionsResponse } from '@/lib/cors'

export const runtime = 'nodejs'

export async function OPTIONS(): Promise<Response> {
  return corsOptionsResponse()
}

export async function POST(request: Request): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    initializeDb()
    const results = evaluateAllRules()
    const triggered = results.filter((r) => r.triggered)

    return Response.json(
      { success: true, data: results, meta: { total: results.length, triggered: triggered.length } },
      { headers: corsHeaders() }
    )
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to evaluate escalation rules'
    logger.error('Escalation', `POST evaluate error: ${errorMessage}`)
    return Response.json({ success: false, error: errorMessage }, { status: 500, headers: corsHeaders() })
  }
}
