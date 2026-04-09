/**
 * REST API Adapter — Buffers all events and returns a JSON response.
 * For external integrations that don't support streaming.
 */

import type { ConversationRequest, ConversationEvent } from '@blade/core'
import type { ChannelAdapter, DeliveryContext } from './types.js'

export interface APIIncoming {
  message: string
  conversationId?: string
  userId: string
  employeeId?: string
}

export interface APIResponse {
  conversationId: string
  response: string
  cost: number
  toolCalls: number
}

export class APIAdapter implements ChannelAdapter<APIIncoming, APIResponse> {
  readonly channel = 'api' as const

  parseIncoming(raw: APIIncoming): ConversationRequest {
    return {
      message: raw.message,
      conversationId: raw.conversationId,
      userId: raw.userId,
      employeeId: raw.employeeId,
      channel: 'api',
    }
  }

  async deliver(events: AsyncGenerator<ConversationEvent>, _context: DeliveryContext): Promise<APIResponse> {
    let result: APIResponse = { conversationId: '', response: '', cost: 0, toolCalls: 0 }
    for await (const event of events) {
      if (event.type === 'conversation_started') {
        result = { ...result, conversationId: event.conversationId }
      }
      if (event.type === 'done') {
        result = {
          conversationId: event.conversationId,
          response: event.response,
          cost: event.cost,
          toolCalls: event.toolCalls,
        }
      }
    }
    return result
  }

  formatResponse(text: string): string {
    return text
  }
}
