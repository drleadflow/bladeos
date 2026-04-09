/**
 * Telegram Adapter — Thin adapter for Telegram messages.
 * Replaces the inline conversation logic in packages/core/src/integrations/telegram.ts
 */

import type { ConversationRequest, ConversationEvent } from '@blade/core'
import type { ChannelAdapter, DeliveryContext } from './types.js'

export interface TelegramIncoming {
  chatId: string
  text: string
  isVoice: boolean
  voiceTranscript?: string
}

export class TelegramAdapter implements ChannelAdapter<TelegramIncoming, string> {
  readonly channel = 'telegram' as const

  parseIncoming(raw: TelegramIncoming): ConversationRequest {
    return {
      message: raw.isVoice ? (raw.voiceTranscript ?? '') : raw.text,
      userId: `telegram-${raw.chatId}`,
      channel: 'telegram',
      channelMetadata: { chatId: raw.chatId, isVoice: raw.isVoice },
    }
  }

  async deliver(events: AsyncGenerator<ConversationEvent>, _context: DeliveryContext): Promise<string> {
    let responseText = ''
    let deltaText = ''
    let errorMessage = ''

    for await (const event of events) {
      switch (event.type) {
        case 'text_delta':
          deltaText += event.text
          break
        case 'error':
          if (!errorMessage) {
            errorMessage = event.message
          }
          break
        case 'done':
          responseText = event.response
          break
      }
    }

    const bestEffortResponse = responseText || deltaText || errorMessage
    return this.formatResponse(bestEffortResponse)
  }

  formatResponse(text: string): string {
    let cleaned = text
    cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, '$1')
    cleaned = cleaned.replace(/\*(.*?)\*/g, '$1')
    cleaned = cleaned.replace(/#{1,6}\s/g, '')
    cleaned = cleaned.replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/g, '').trim())
    cleaned = cleaned.replace(/`([^`]+)`/g, '$1')
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim()
    return cleaned
  }
}
