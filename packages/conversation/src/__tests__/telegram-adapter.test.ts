import { describe, expect, it } from 'vitest'
import type { ConversationEvent } from '@blade/core'
import { TelegramAdapter } from '../adapters/telegram.js'

async function* eventStream(events: ConversationEvent[]): AsyncGenerator<ConversationEvent> {
  for (const event of events) {
    yield event
  }
}

describe('TelegramAdapter', () => {
  it('uses the final done response when present', async () => {
    const adapter = new TelegramAdapter()

    const response = await adapter.deliver(
      eventStream([
        { type: 'text_delta', text: 'Hello' },
        {
          type: 'done',
          conversationId: 'conv-1',
          response: 'Hello world',
          cost: 0.12,
          toolCalls: 0,
          stopReason: 'end_turn',
        },
      ]),
      { destination: '123', conversationId: 'conv-1' }
    )

    expect(response).toBe('Hello world')
  })

  it('falls back to accumulated text deltas when no done event arrives', async () => {
    const adapter = new TelegramAdapter()

    const response = await adapter.deliver(
      eventStream([
        { type: 'conversation_started', conversationId: 'conv-1' },
        { type: 'text_delta', text: 'Partial ' },
        { type: 'text_delta', text: 'response' },
      ]),
      { destination: '123', conversationId: 'conv-1' }
    )

    expect(response).toBe('Partial response')
  })

  it('returns the engine error when the stream fails before a final response', async () => {
    const adapter = new TelegramAdapter()

    const response = await adapter.deliver(
      eventStream([
        { type: 'conversation_started', conversationId: 'conv-1' },
        { type: 'error', message: 'Agent loop completed without a result' },
      ]),
      { destination: '123', conversationId: 'conv-1' }
    )

    expect(response).toBe('Agent loop completed without a result')
  })
})
