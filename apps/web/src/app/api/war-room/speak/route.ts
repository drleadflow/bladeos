import { NextRequest } from 'next/server'
import { initializeDb } from '@blade/db'
import { processVoiceTurn, createExecutionAPI, buildMemoryAugmentedPrompt } from '@blade/core'
import { createConversationEngine } from '@blade/conversation'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'

export const runtime = 'nodejs'

const executionApi = createExecutionAPI()
const conversationEngine = createConversationEngine(executionApi, {
  retrieveMemories: async (query: string) => {
    const memoryBlock = buildMemoryAugmentedPrompt('', query)
    return memoryBlock
  },
})

/**
 * POST /api/war-room/speak
 * Receives audio blob from browser mic, processes through voice pipeline,
 * returns agent text + audio response.
 *
 * Body: FormData with:
 *   - audio: Blob (webm/mp3)
 *   - sessionId: string
 */
export async function POST(req: NextRequest): Promise<Response> {
  const auth = requireAuth(req)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    initializeDb()

    const formData = await req.formData()
    const audioFile = formData.get('audio') as Blob | null
    const sessionId = formData.get('sessionId') as string | null

    if (!audioFile || !sessionId) {
      return Response.json(
        { success: false, error: 'audio (Blob) and sessionId are required' },
        { status: 400 }
      )
    }

    const audioBuffer = Buffer.from(await audioFile.arrayBuffer())

    const result = await processVoiceTurn(
      sessionId,
      audioBuffer,
      async (message: string, agentSlug: string) => {
        // Use the conversation engine to get the agent reply
        const { responseText, cost } = await conversationEngine.replySync({
          message,
          userId: 'war-room-user',
          channel: 'web',
          employeeId: agentSlug,
        })
        return { text: responseText, cost }
      }
    )

    // Return JSON with transcript + base64 audio
    return Response.json({
      success: true,
      data: {
        userTranscript: result.userTranscript,
        agentText: result.agentText,
        agentSlug: result.agentSlug,
        agentAudio: result.agentAudio.length > 0 ? result.agentAudio.toString('base64') : null,
        costUsd: result.costUsd,
        durationMs: result.durationMs,
      },
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Voice processing failed'
    logger.error('WarRoom', `Speak error: ${msg}`)
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}
