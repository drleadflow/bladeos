import { NextRequest } from 'next/server'
import { initializeDb, messages } from '@blade/db'
import { createConversationEngine, WebSSEAdapter, createSkillResolver } from '@blade/conversation'
import { createExecutionAPI, loadPersonality, retrieveRelevant } from '@blade/core'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'

export const runtime = 'nodejs'

const executionApi = createExecutionAPI()
const conversationEngine = createConversationEngine(executionApi, {
  retrieveMemories: async (query: string) => {
    const ranked = retrieveRelevant(query, 8)
    if (ranked.length === 0) return ''

    return ranked
      .map((memory, index) => {
        const tags = memory.tags.length > 0 ? ` [tags: ${memory.tags.join(', ')}]` : ''
        return `${index + 1}. (${memory.type}) ${memory.content}${tags}`
      })
      .join('\n')
  },
  resolveSkillPrompt: createSkillResolver(),
})
const webAdapter = new WebSSEAdapter()

export async function GET(req: NextRequest): Promise<Response> {
  const auth = requireAuth(req)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  const conversationId = req.nextUrl.searchParams.get('conversationId')
  if (!conversationId) {
    return Response.json({ success: false, error: 'conversationId required' }, { status: 400 })
  }

  try {
    initializeDb()
    const msgs = messages.listByConversation(conversationId)
    return Response.json({ success: true, data: msgs })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to load messages'
    logger.error('Chat', `GET error: ${errorMessage}`)
    return Response.json({ success: false, error: errorMessage }, { status: 500 })
  }
}

const BASE_SYSTEM_PROMPT = `You are Blade, an AI super agent. You are helpful, direct, and capable.
You have tools for memory, file operations, and shell commands.
When the user tells you a preference or important fact, save it to memory.
When a topic comes up that you might have context on, use recall_memory.
Be concise but thorough.`

export async function POST(req: NextRequest): Promise<Response> {
  const auth = requireAuth(req)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    const body = await req.json()
    const {
      message,
      conversationId: existingConversationId,
      employeeId,
    } = body as {
      message: string
      conversationId?: string
      employeeId?: string
    }

    if (!message || typeof message !== 'string') {
      return Response.json(
        { success: false, error: 'message is required and must be a string' },
        { status: 400 }
      )
    }

    if (message.length > 32_000) {
      return Response.json({ success: false, error: 'Message too long' }, { status: 400 })
    }

    initializeDb()
    const personality = loadPersonality()
    const request = webAdapter.parseIncoming({
      message,
      conversationId: existingConversationId,
      userId: 'web-user',
      employeeId,
    })
    const events = conversationEngine.reply({
      ...request,
      systemPromptOverride: personality ? `${personality}\n\n${BASE_SYSTEM_PROMPT}` : BASE_SYSTEM_PROMPT,
    })
    const stream = await webAdapter.deliver(events, {
      destination: null,
      conversationId: existingConversationId ?? '',
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    logger.error('Chat', `Route error: ${errorMessage}`)
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
