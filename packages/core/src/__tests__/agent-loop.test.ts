import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AgentLoopOptions, ModelResponse, ContentBlock, ExecutionContext } from '../types.js'

// Mock dependencies before importing the module under test
vi.mock('../model-provider.js', () => ({
  callModel: vi.fn(),
  streamModel: vi.fn(),
  resolveModelConfig: vi.fn(() => ({ provider: 'anthropic', modelId: 'test-model', apiKey: 'test-key' })),
  resolveSmartModelConfig: vi.fn(() => ({ provider: 'anthropic', modelId: 'test-model', apiKey: 'test-key' })),
}))

vi.mock('../tool-registry.js', () => ({
  executeTool: vi.fn(),
}))

vi.mock('../cost-tracker.js', () => ({
  calculateCost: vi.fn((_model: string, _input: number, _output: number) => ({
    model: 'test-model',
    inputTokens: _input,
    outputTokens: _output,
    inputCostUsd: 0.001,
    outputCostUsd: 0.002,
    totalCostUsd: 0.003,
    timestamp: new Date().toISOString(),
  })),
  isWithinBudget: vi.fn((spent: number, budget: number) => {
    if (budget <= 0) return true
    return spent < budget
  }),
}))

vi.mock('@blade/shared', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { runAgentLoop } from '../agent-loop.js'
import { callModel } from '../model-provider.js'
import { executeTool } from '../tool-registry.js'
import { isWithinBudget } from '../cost-tracker.js'

const mockedCallModel = vi.mocked(callModel)
const mockedExecuteTool = vi.mocked(executeTool)
const mockedIsWithinBudget = vi.mocked(isWithinBudget)

function makeTextResponse(text: string): ModelResponse {
  return {
    content: [{ type: 'text', text }],
    model: 'test-model',
    inputTokens: 100,
    outputTokens: 50,
    stopReason: 'end_turn',
  }
}

function makeToolUseResponse(toolName: string, toolInput: Record<string, unknown>, id = 'tool-1'): ModelResponse {
  return {
    content: [{ type: 'tool_use', id, name: toolName, input: toolInput }],
    model: 'test-model',
    inputTokens: 100,
    outputTokens: 50,
    stopReason: 'tool_use',
  }
}

function makeContext(): ExecutionContext {
  return {
    conversationId: 'test-conv-1',
    userId: 'test-user',
    modelId: 'test-model',
    maxIterations: 25,
    costBudget: 0,
  }
}

function makeBaseOptions(overrides?: Partial<AgentLoopOptions>): AgentLoopOptions {
  return {
    systemPrompt: 'You are a test assistant.',
    messages: [{ role: 'user', content: 'Hello' }],
    tools: [],
    context: makeContext(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Reset isWithinBudget to default behavior
  mockedIsWithinBudget.mockImplementation((spent: number, budget: number) => {
    if (budget <= 0) return true
    return spent < budget
  })
})

describe('agent-loop: runAgentLoop', () => {
  it('runs and returns result with text response', async () => {
    mockedCallModel.mockResolvedValueOnce(makeTextResponse('Hello back!'))

    const result = await runAgentLoop(makeBaseOptions())

    expect(result.finalResponse).toBe('Hello back!')
    expect(result.turns).toHaveLength(1)
    expect(result.totalCost).toBeGreaterThan(0)
    expect(result.stopReason).toBe('end_turn')
  })

  it('executes tools and loops', async () => {
    // First call: model requests a tool
    mockedCallModel.mockResolvedValueOnce(
      makeToolUseResponse('read_file', { path: 'test.ts' })
    )

    // Mock tool execution
    mockedExecuteTool.mockResolvedValueOnce({
      toolUseId: 'tool-1',
      toolName: 'read_file',
      input: { path: 'test.ts' },
      success: true,
      data: 'file contents',
      display: 'file contents',
      durationMs: 10,
      timestamp: new Date().toISOString(),
    })

    // Second call: model returns text
    mockedCallModel.mockResolvedValueOnce(makeTextResponse('Done reading file.'))

    const result = await runAgentLoop(makeBaseOptions())

    expect(result.turns).toHaveLength(2)
    expect(result.totalToolCalls).toBe(1)
    expect(result.stopReason).toBe('end_turn')
    expect(mockedCallModel).toHaveBeenCalledTimes(2)
    expect(mockedExecuteTool).toHaveBeenCalledTimes(1)
  })

  it('respects maxIterations', async () => {
    // Always return tool_use to force looping
    mockedCallModel.mockResolvedValue(
      makeToolUseResponse('read_file', { path: 'a.ts' }, 'tool-a')
    )
    // Use different inputs each time to avoid stuck-loop detection
    let callCount = 0
    mockedCallModel.mockImplementation(async () => {
      callCount++
      return makeToolUseResponse('read_file', { path: `file-${callCount}.ts` }, `tool-${callCount}`)
    })

    mockedExecuteTool.mockResolvedValue({
      toolUseId: 'tool-a',
      toolName: 'read_file',
      input: { path: 'a.ts' },
      success: true,
      data: 'ok',
      display: 'ok',
      durationMs: 1,
      timestamp: new Date().toISOString(),
    })

    const result = await runAgentLoop(makeBaseOptions({ maxIterations: 3 }))

    expect(result.turns).toHaveLength(3)
    expect(result.stopReason).toBe('max_iterations')
  })

  it('respects costBudget', async () => {
    // First call succeeds (within budget)
    mockedCallModel.mockResolvedValue(makeTextResponse('Expensive answer'))

    // After first iteration, budget is exceeded
    let callNum = 0
    mockedIsWithinBudget.mockImplementation(() => {
      callNum++
      return callNum <= 1 // Only allow the first iteration
    })

    // Return tool use first to force a second iteration attempt
    mockedCallModel.mockResolvedValueOnce(
      makeToolUseResponse('read_file', { path: 'x.ts' })
    )
    mockedExecuteTool.mockResolvedValueOnce({
      toolUseId: 'tool-1',
      toolName: 'read_file',
      input: { path: 'x.ts' },
      success: true,
      data: 'ok',
      display: 'ok',
      durationMs: 1,
      timestamp: new Date().toISOString(),
    })

    const result = await runAgentLoop(makeBaseOptions({ costBudget: 0.001 }))

    expect(result.stopReason).toBe('cost_limit')
  })

  it('calls onToolCall callback', async () => {
    const onToolCall = vi.fn()

    mockedCallModel
      .mockResolvedValueOnce(makeToolUseResponse('write_file', { path: 'out.ts', content: 'hello' }))
      .mockResolvedValueOnce(makeTextResponse('Written.'))

    mockedExecuteTool.mockResolvedValueOnce({
      toolUseId: 'tool-1',
      toolName: 'write_file',
      input: { path: 'out.ts', content: 'hello' },
      success: true,
      data: { path: 'out.ts' },
      display: 'Wrote file',
      durationMs: 5,
      timestamp: new Date().toISOString(),
    })

    await runAgentLoop(makeBaseOptions({ onToolCall }))

    expect(onToolCall).toHaveBeenCalledTimes(1)
    expect(onToolCall).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: 'write_file', success: true })
    )
  })

  it('calls onTextDelta for streaming', async () => {
    const onTextDelta = vi.fn()

    // For non-streaming path (claude-cli provider in resolveModelConfig returns provider that
    // disables streaming, so callModel is used). The agent-loop emits onTextDelta with the full
    // text when not streaming.
    mockedCallModel.mockResolvedValueOnce(makeTextResponse('Streamed text'))

    await runAgentLoop(makeBaseOptions({ streaming: true, onTextDelta }))

    // Since the mock resolveModelConfig returns provider: 'claude-cli', streaming is disabled
    // and the loop falls back to callModel. It then emits the full text via onTextDelta.
    expect(onTextDelta).toHaveBeenCalled()
    const allText = onTextDelta.mock.calls.map((c: unknown[]) => c[0]).join('')
    expect(allText).toContain('Streamed text')
  })

  it('handles model errors with retry', async () => {
    const onError = vi.fn()

    // First call fails, second succeeds
    mockedCallModel
      .mockRejectedValueOnce(new Error('API rate limit'))
      .mockResolvedValueOnce(makeTextResponse('Recovered'))

    const result = await runAgentLoop(makeBaseOptions({ onError }))

    expect(result.finalResponse).toBe('Recovered')
    expect(result.stopReason).toBe('end_turn')
    expect(mockedCallModel).toHaveBeenCalledTimes(2)
    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      'model_call_retry_1'
    )
  })

  it('detects stuck loops', async () => {
    const onError = vi.fn()

    // Return same tool call 3 times (STUCK_LOOP_THRESHOLD = 3)
    const sameToolResponse = makeToolUseResponse('read_file', { path: 'same.ts' })

    mockedCallModel
      .mockResolvedValueOnce(sameToolResponse) // iteration 0
      .mockResolvedValueOnce(sameToolResponse) // iteration 1
      .mockResolvedValueOnce(sameToolResponse) // iteration 2 - stuck detected, injects error message
      .mockResolvedValueOnce(makeTextResponse('Breaking out')) // iteration 3 - model recovers

    mockedExecuteTool.mockResolvedValue({
      toolUseId: 'tool-1',
      toolName: 'read_file',
      input: { path: 'same.ts' },
      success: true,
      data: 'content',
      display: 'content',
      durationMs: 1,
      timestamp: new Date().toISOString(),
    })

    const result = await runAgentLoop(makeBaseOptions({ onError }))

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('stuck in loop') }),
      'stuck_loop_detected'
    )
    // The loop should eventually finish (either by recovery or max iterations)
    expect(result.turns.length).toBeGreaterThanOrEqual(2)
  })
})
