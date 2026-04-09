/**
 * Web SSE Adapter — Formats ConversationEvents as Server-Sent Events.
 * Replaces the inline logic in apps/web/src/app/api/chat/route.ts
 */

import type { ConversationRequest, ConversationEvent } from '@blade/core'
import type { ChannelAdapter, DeliveryContext } from './types.js'

export interface WebIncoming {
  message: string
  conversationId?: string
  userId: string
  employeeId?: string
}

export class WebSSEAdapter implements ChannelAdapter<WebIncoming, ReadableStream> {
  readonly channel = 'web' as const

  parseIncoming(raw: WebIncoming): ConversationRequest {
    return {
      message: raw.message,
      conversationId: raw.conversationId,
      userId: raw.userId,
      employeeId: raw.employeeId,
      channel: 'web',
    }
  }

  async deliver(events: AsyncGenerator<ConversationEvent>, context: DeliveryContext): Promise<ReadableStream> {
    const encoder = new TextEncoder()

    return new ReadableStream({
      async start(controller) {
        let currentConversationId = context.conversationId

        const send = (event: string, data: unknown): void => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        }

        for await (const event of events) {
          switch (event.type) {
            case 'conversation_started':
              currentConversationId = event.conversationId
              send('conversation_started', { conversationId: currentConversationId })
              break
            case 'text_delta':
              send('text', { conversationId: currentConversationId, text: event.text })
              break
            case 'tool_call':
              send('tool_call', {
                conversationId: currentConversationId,
                toolName: event.name,
                input: event.input,
                success: event.result.success,
                display: event.result.display,
                durationMs: event.result.durationMs,
              })
              break
            case 'turn':
              send('turn', {
                conversationId: currentConversationId,
                iteration: event.iteration,
                costSoFar: event.costSoFar,
                stopReason: event.stopReason,
              })
              break
            case 'done':
              send('done', {
                conversationId: event.conversationId,
                finalResponse: event.response,
                totalCost: event.cost,
                totalToolCalls: event.toolCalls,
                stopReason: event.stopReason,
              })
              break
            case 'error':
              send('error', { conversationId: currentConversationId, error: event.message })
              break
          }
        }
        controller.close()
      },
    })
  }

  formatResponse(text: string): string {
    return text
  }
}
