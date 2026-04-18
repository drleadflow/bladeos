import { initializeDb } from '@blade/db'
import { getGoalsDashboard } from '@blade/core'
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
    const dashboard = getGoalsDashboard()

    return Response.json({ success: true, data: dashboard }, { headers: corsHeaders() })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to get goals dashboard'
    logger.error('Goals', `GET dashboard error: ${errorMessage}`)
    return Response.json({ success: false, error: errorMessage }, { status: 500, headers: corsHeaders() })
  }
}
