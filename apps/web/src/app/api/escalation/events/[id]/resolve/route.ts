import { NextRequest } from 'next/server'
import { initializeDb, escalationRules } from '@blade/db'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'
import { corsHeaders, corsOptionsResponse } from '@/lib/cors'

export const runtime = 'nodejs'

export async function OPTIONS(): Promise<Response> {
  return corsOptionsResponse()
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = requireAuth(req)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    const { id } = await params
    initializeDb()
    escalationRules.resolveEvent(parseInt(id, 10))
    return Response.json({ success: true }, { headers: corsHeaders() })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to resolve event'
    logger.error('Escalation', `resolve event error: ${msg}`)
    return Response.json({ success: false, error: msg }, { status: 500, headers: corsHeaders() })
  }
}
