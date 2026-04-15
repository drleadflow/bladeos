import { NextRequest } from 'next/server'
import { initializeDb, memories } from '@blade/db'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'

export async function GET(req: NextRequest): Promise<Response> {
  const auth = requireAuth(req)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    initializeDb()
    const data = memories.getStats()
    return Response.json({ success: true, data })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to get memory stats'
    logger.error('Memory', `GET stats error: ${msg}`)
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}
