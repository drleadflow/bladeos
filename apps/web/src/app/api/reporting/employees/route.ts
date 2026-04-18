import { NextRequest } from 'next/server'
import { initializeDb } from '@blade/db'
import { getEmployeeOutcomes } from '@blade/core'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'
import { corsHeaders, corsOptionsResponse } from '@/lib/cors'

export const runtime = 'nodejs'

export async function OPTIONS(): Promise<Response> {
  return corsOptionsResponse()
}

export async function GET(req: NextRequest): Promise<Response> {
  const auth = requireAuth(req)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    initializeDb()
    const periodParam = req.nextUrl.searchParams.get('period')
    const period = periodParam ? Math.max(1, parseInt(periodParam, 10)) : 7
    const data = getEmployeeOutcomes(Number.isNaN(period) ? 7 : period)
    return Response.json({ success: true, data }, { headers: corsHeaders() })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to get employee outcomes'
    logger.error('Reporting', `GET /employees error: ${msg}`)
    return Response.json({ success: false, error: msg }, { status: 500, headers: corsHeaders() })
  }
}
