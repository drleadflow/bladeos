import { NextRequest } from 'next/server'
import { createVoiceRoom } from '@blade/core/voice'
import type { VoiceConfig } from '@blade/core/voice'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest): Promise<Response> {
  const auth = requireAuth(req)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    const body = await req.json()
    const { roomName } = body as { roomName?: string }

    const livekitUrl = process.env.LIVEKIT_URL
    const apiKey = process.env.LIVEKIT_API_KEY
    const apiSecret = process.env.LIVEKIT_API_SECRET

    if (!livekitUrl || !apiKey || !apiSecret) {
      return Response.json(
        { success: false, error: 'LiveKit credentials not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.' },
        { status: 500 }
      )
    }

    const config: VoiceConfig = {
      livekitUrl,
      apiKey,
      apiSecret,
      roomName,
    }

    const result = await createVoiceRoom(config)

    return Response.json({
      success: true,
      data: {
        token: result.token,
        roomName: result.roomName,
        livekitUrl,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create voice token'
    return Response.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
