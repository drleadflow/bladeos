import { NextRequest } from 'next/server'
import { initializeDb } from '@blade/db'
import { createWarRoomSession, getWarRoomSession, destroyWarRoomSession, setActiveAgent, getSessionTranscript } from '@blade/core'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'

export async function POST(req: NextRequest): Promise<Response> {
  const auth = requireAuth(req)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    initializeDb()
    const body = await req.json()
    const { action, sessionId, agentSlug } = body as {
      action: 'create' | 'switch-agent' | 'transcript' | 'destroy'
      sessionId?: string
      agentSlug?: string
    }

    if (action === 'create') {
      const id = `wr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const session = createWarRoomSession(id, agentSlug ?? 'chief-of-staff')
      return Response.json({ success: true, data: { sessionId: session.id, activeAgent: session.activeAgent } })
    }

    if (action === 'switch-agent' && sessionId && agentSlug) {
      setActiveAgent(sessionId, agentSlug)
      return Response.json({ success: true, data: { activeAgent: agentSlug } })
    }

    if (action === 'transcript' && sessionId) {
      const turns = getSessionTranscript(sessionId)
      const session = getWarRoomSession(sessionId)
      return Response.json({
        success: true,
        data: { turns, totalCost: session?.totalCost ?? 0, activeAgent: session?.activeAgent },
      })
    }

    if (action === 'destroy' && sessionId) {
      destroyWarRoomSession(sessionId)
      return Response.json({ success: true })
    }

    return Response.json({ success: false, error: 'Invalid action' }, { status: 400 })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'War room session error'
    logger.error('WarRoom', `Session error: ${msg}`)
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}
