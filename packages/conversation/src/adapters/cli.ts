/**
 * CLI Adapter — Streams text deltas to stdout, returns final response.
 */

import type { ConversationRequest, ConversationEvent } from '@blade/core'
import type { ChannelAdapter, DeliveryContext } from './types.js'

export interface CLIIncoming {
  text: string
  conversationId?: string
}

export class CLIAdapter implements ChannelAdapter<CLIIncoming, string> {
  readonly channel = 'cli' as const

  parseIncoming(raw: CLIIncoming): ConversationRequest {
    return {
      message: raw.text,
      conversationId: raw.conversationId,
      userId: 'cli-user',
      channel: 'cli',
    }
  }

  async deliver(events: AsyncGenerator<ConversationEvent>, _context: DeliveryContext): Promise<string> {
    let responseText = ''
    for await (const event of events) {
      if (event.type === 'text_delta') {
        process.stdout.write(event.text)
      }
      if (event.type === 'done') {
        responseText = event.response
      }
    }
    return responseText
  }

  formatResponse(text: string): string {
    return text
  }
}
