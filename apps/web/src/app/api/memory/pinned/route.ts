import { NextRequest } from 'next/server'
import { initializeDb, memories } from '@blade/db'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'

export async function GET(req: NextRequest): Promise<Response> {
  const auth = requireAuth(req)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    initializeDb()
    const data = memories.getPinned()
    return Response.json({ success: true, data })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to get pinned memories'
    logger.error('Memory', `GET pinned error: ${msg}`)
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}

export async function PUT(req: NextRequest): Promise<Response> {
  const auth = requireAuth(req)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    const body = await req.json()
    const { id, pinned } = body as { id: string; pinned: boolean }

    if (!id || typeof pinned !== 'boolean') {
      return Response.json(
        { success: false, error: 'id (string) and pinned (boolean) are required' },
        { status: 400 }
      )
    }

    initializeDb()
    memories.setPinned(id, pinned)

    return Response.json({ success: true, data: { id, pinned } })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to update pinned status'
    logger.error('Memory', `PUT pinned error: ${msg}`)
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}
