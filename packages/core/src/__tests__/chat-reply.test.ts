import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentLoopOptions, AgentLoopResult, ExecutionContext } from '../types.js'

vi.mock('../agent-loop.js', () => ({
  runAgentLoop: vi.fn(),
}))

vi.mock('../model-provider.js', () => ({
  callModel: vi.fn(),
  resolveSmartModelConfig: vi.fn(() => ({
    provider: 'openrouter',
    modelId: 'test-model',
    apiKey: 'test-key',
  })),
}))

vi.mock('@blade/shared', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}))

import { runAgentLoop } from '../agent-loop.js'
import { callModel } from '../model-provider.js'
import { extractBestResponseText, runConversationReply } from '../chat/reply.js'

const mockedRunAgentLoop = vi.mocked(runAgentLoop)
const mockedCallModel = vi.mocked(callModel)

function makeContext(): ExecutionContext {
  return {
    conversationId: 'conv-1',
    userId: 'user-1',
    modelId: 'model-1',
    maxIterations: 10,
    costBudget: 0,
  }
}

function makeLoopOptions(overrides?: Partial<AgentLoopOptions>): AgentLoopOptions {
  return {
    systemPrompt: 'You are Blade.',
    messages: [{ role: 'user', content: 'Hello' }],
    tools: [],
    context: makeContext(),
    ...overrides,
  }
}

function makeLoopResult(overrides?: Partial<AgentLoopResult>): AgentLoopResult {
  return {
    finalResponse: '',
    turns: [],
    totalCost: 0,
    totalToolCalls: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    durationMs: 0,
    stopReason: 'end_turn',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('chat-reply', () => {
  it('extracts text from the latest text-bearing turn when finalResponse is empty', () => {
    const result = makeLoopResult({
      turns: [
        {
          iteration: 0,
          response: {
            content: [{ type: 'text', text: 'Earlier answer' }],
            model: 'test-model',
            inputTokens: 10,
            outputTokens: 10,
            stopReason: 'end_turn',
          },
          toolCalls: [],
          costSoFar: 0.01,
        },
        {
          iteration: 1,
          response: {
            content: [{ type: 'tool_use', id: 'tool-1', name: 'save_memory', input: { foo: 'bar' } }],
            model: 'test-model',
            inputTokens: 10,
            outputTokens: 10,
            stopReason: 'tool_use',
          },
          toolCalls: [
            {
              toolUseId: 'tool-1',
              toolName: 'save_memory',
              input: { foo: 'bar' },
              success: true,
              data: null,
              display: 'Saved memory',
              durationMs: 1,
              timestamp: new Date().toISOString(),
            },
          ],
          costSoFar: 0.02,
        },
      ],
    })

    expect(extractBestResponseText(result)).toBe('Earlier answer')
  })

  it('summarizes tool results when the loop ends without text', async () => {
    mockedRunAgentLoop.mockResolvedValueOnce(
      makeLoopResult({
        turns: [
          {
            iteration: 0,
            response: {
              content: [{ type: 'tool_use', id: 'tool-1', name: 'read_file', input: { path: 'a.ts' } }],
              model: 'test-model',
              inputTokens: 10,
              outputTokens: 10,
              stopReason: 'tool_use',
            },
            toolCalls: [
              {
                toolUseId: 'tool-1',
                toolName: 'read_file',
                input: { path: 'a.ts' },
                success: true,
                data: 'file contents',
                display: 'file contents',
                durationMs: 1,
                timestamp: new Date().toISOString(),
              },
            ],
            costSoFar: 0.01,
          },
        ],
        totalToolCalls: 1,
        stopReason: 'max_iterations',
      })
    )

    mockedCallModel.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Here is the summary.' }],
      model: 'summary-model',
      inputTokens: 10,
      outputTokens: 10,
      stopReason: 'end_turn',
    })

    const reply = await runConversationReply({
      ...makeLoopOptions(),
      fallbackText: 'Fallback text',
      responseLabel: 'test reply',
    })

    expect(reply.responseText).toBe('Here is the summary.')
    expect(mockedCallModel).toHaveBeenCalledTimes(1)
  })

  it('uses fallback text when no text can be synthesized', async () => {
    mockedRunAgentLoop.mockResolvedValueOnce(
      makeLoopResult({
        turns: [
          {
            iteration: 0,
            response: {
              content: [{ type: 'tool_use', id: 'tool-1', name: 'read_file', input: { path: 'a.ts' } }],
              model: 'test-model',
              inputTokens: 10,
              outputTokens: 10,
              stopReason: 'tool_use',
            },
            toolCalls: [
              {
                toolUseId: 'tool-1',
                toolName: 'read_file',
                input: { path: 'a.ts' },
                success: true,
                data: 'file contents',
                display: 'file contents',
                durationMs: 1,
                timestamp: new Date().toISOString(),
              },
            ],
            costSoFar: 0.01,
          },
        ],
        totalToolCalls: 1,
        stopReason: 'max_iterations',
      })
    )

    mockedCallModel.mockRejectedValueOnce(new Error('Summary failed'))

    const reply = await runConversationReply({
      ...makeLoopOptions(),
      fallbackText: 'Fallback text',
    })

    expect(reply.responseText).toBe('Fallback text')
  })
})
