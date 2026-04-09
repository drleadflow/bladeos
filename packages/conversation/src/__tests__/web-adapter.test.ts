import { describe, expect, it } from 'vitest'
import { WebSSEAdapter } from '../adapters/web.js'
import type { ConversationEvent } from '@blade/core'

async function readStream(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let output = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    output += decoder.decode(value, { stream: true })
  }

  output += decoder.decode()
  return output
}

async function* eventStream(events: ConversationEvent[]): AsyncGenerator<ConversationEvent> {
  for (const event of events) {
    yield event
  }
}

describe('WebSSEAdapter', () => {
  it('parses incoming web requests into conversation requests', () => {
    const adapter = new WebSSEAdapter()
    const request = adapter.parseIncoming({
      message: 'Hello',
      conversationId: 'conv-1',
      userId: 'user-1',
      employeeId: 'chief-of-staff',
    })

    expect(request).toEqual({
      message: 'Hello',
      conversationId: 'conv-1',
      userId: 'user-1',
      employeeId: 'chief-of-staff',
      channel: 'web',
    })
  })

  it('emits SSE events using the started conversation id', async () => {
    const adapter = new WebSSEAdapter()
    const stream = await adapter.deliver(
      eventStream([
        { type: 'conversation_started', conversationId: 'conv-42' },
        { type: 'text_delta', text: 'Hello' },
        {
          type: 'turn',
          iteration: 1,
          costSoFar: 0.12,
          stopReason: 'end_turn',
        },
        {
          type: 'done',
          conversationId: 'conv-42',
          response: 'Hello world',
          cost: 0.34,
          toolCalls: 2,
          stopReason: 'end_turn',
        },
      ]),
      { destination: null, conversationId: '' }
    )

    const output = await readStream(stream)

    expect(output).toContain('event: conversation_started')
    expect(output).toContain('"conversationId":"conv-42"')
    expect(output).toContain('event: text')
    expect(output).toContain('"text":"Hello"')
    expect(output).toContain('event: turn')
    expect(output).toContain('"stopReason":"end_turn"')
    expect(output).toContain('event: done')
    expect(output).toContain('"finalResponse":"Hello world"')
  })
})
