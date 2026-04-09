import { beforeEach, describe, expect, it } from 'vitest'
import { closeDb, getDb, initializeDb } from '@blade/db'
import { createConversationEngine } from '../engine.js'

function createExecutionApiMock() {
  return {
    resolveSmartModelConfig: () => ({
      modelId: 'test-model',
      apiKey: 'test-key',
    }),
    getToolDefinitions: () => [],
    createFilteredScope: () => 'scope-1',
    getScopedToolDefinitions: () => [],
    destroyToolScope: () => {},
    streamLoop: async function* () {
      yield {
        type: 'done',
        result: {
          finalResponse: 'Handled',
          totalCost: 0,
          totalToolCalls: 0,
          stopReason: 'end_turn',
          turns: [],
        },
      }
    },
    calculateCost: () => ({
      model: 'test-model',
      inputTokens: 0,
      outputTokens: 0,
      totalCost: 0,
    }),
  } as any
}

beforeEach(() => {
  closeDb()
  initializeDb(':memory:')

  const db = getDb()
  for (const table of ['channel_links', 'messages', 'conversations']) {
    db.prepare(`DELETE FROM ${table}`).run()
  }
})

describe('ConversationEngine channel links', () => {
  it('automatically links Telegram chat metadata to the created conversation', async () => {
    const engine = createConversationEngine(createExecutionApiMock())

    const result = await engine.replySync({
      channel: 'telegram',
      channelMetadata: { chatId: '555' },
      message: 'Hello there',
      userId: 'telegram-555',
    })

    expect(result.conversationId).toBeTruthy()
    expect(engine.findByChannel('555', 'telegram')).toBe(result.conversationId)

    const resumed = engine.resumeConversation(result.conversationId)
    expect(resumed?.channels).toContain('telegram')
  })
})
