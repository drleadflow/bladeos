import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AgentLoopOptions, ModelResponse, ContentBlock, ExecutionContext } from '../types.js'

// Mock dependencies before importing the module under test
vi.mock('../model-provider.js', () => ({
  callModel: vi.fn(),
  streamModel: vi.fn(),
  resolveModelConfig: vi.fn(() => ({ provider: 'claude-cli', modelId: 'test-model', apiKey: 'test-key' })),
  resolveSmartModelConfig: vi.fn(() => ({ provider: 'claude-cli', modelId: 'test-model', apiKey: 'test-key' })),
  resolveSmartModelConfigChain: vi.fn(() => [{ provider: 'claude-cli', modelId: 'test-model', apiKey: 'test-key' }]),
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

vi.mock('../approval-checker.js', () => ({
  requiresApproval: vi.fn(() => false),
  requestApproval: vi.fn(() => 'approval-1'),
  waitForApproval: vi.fn(async () => ({ approved: true, decidedBy: 'tester' })),
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
import { requiresApproval, waitForApproval } from '../approval-checker.js'

const mockedCallModel = vi.mocked(callModel)
const mockedExecuteTool = vi.mocked(executeTool)
const mockedIsWithinBudget = vi.mocked(isWithinBudget)
const mockedRequiresApproval = vi.mocked(requiresApproval)
const mockedWaitForApproval = vi.mocked(waitForApproval)

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
  mockedIsWithinBudget.mockImplementation((spent: number, budget: number) => {
    if (budget <= 0) return true
    return spent < budget
  })
  mockedRequiresApproval.mockReturnValue(false)
  mockedWaitForApproval.mockResolvedValue({ approved: true, decidedBy: 'tester' })
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

  it('tracks token counts across iterations', async () => {
    mockedCallModel
      .mockResolvedValueOnce(makeToolUseResponse('read_file', { path: 'test.ts' }))
      .mockResolvedValueOnce(makeTextResponse('Done.'))

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

    const result = await runAgentLoop(makeBaseOptions())

    // Two model calls: 100 input + 100 input = 200, 50 output + 50 output = 100
    expect(result.totalInputTokens).toBe(200)
    expect(result.totalOutputTokens).toBe(100)
  })

  it('tracks duration in milliseconds', async () => {
    mockedCallModel.mockResolvedValueOnce(makeTextResponse('Fast response'))

    const result = await runAgentLoop(makeBaseOptions())

    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    expect(typeof result.durationMs).toBe('number')
  })

  it('executes tools and loops', async () => {
    mockedCallModel.mockResolvedValueOnce(
      makeToolUseResponse('read_file', { path: 'test.ts' })
    )

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

    mockedCallModel.mockResolvedValueOnce(makeTextResponse('Done reading file.'))

    const result = await runAgentLoop(makeBaseOptions())

    expect(result.turns).toHaveLength(2)
    expect(result.totalToolCalls).toBe(1)
    expect(result.stopReason).toBe('end_turn')
    expect(mockedCallModel).toHaveBeenCalledTimes(2)
    expect(mockedExecuteTool).toHaveBeenCalledTimes(1)
  })

  it('fails closed when the approval system errors', async () => {
    mockedRequiresApproval.mockReturnValue(true)
    mockedWaitForApproval.mockRejectedValueOnce(new Error('approval db unavailable'))

    mockedCallModel
      .mockResolvedValueOnce(makeToolUseResponse('slack_send_message', { channel: 'general', text: 'hi' }))
      .mockResolvedValueOnce(makeTextResponse('I could not send the message because approvals were unavailable.'))

    const result = await runAgentLoop(makeBaseOptions())

    expect(mockedExecuteTool).not.toHaveBeenCalled()
    expect(result.turns).toHaveLength(2)
    expect(result.turns[0]?.toolCalls[0]?.success).toBe(false)
    expect(result.turns[0]?.toolCalls[0]?.display).toContain('approval system failed')
  })

  it('respects maxIterations', async () => {
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
    mockedCallModel.mockResolvedValue(makeTextResponse('Expensive answer'))

    let callNum = 0
    mockedIsWithinBudget.mockImplementation(() => {
      callNum++
      return callNum <= 1
    })

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

  it('respects wall-clock timeout', async () => {
    const onError = vi.fn()

    // Simulate a model call that takes long enough for the deadline to expire
    // First call returns a tool use, then we sleep past the deadline before next iteration
    let callCount = 0
    mockedCallModel.mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        // First call: return tool use to force another iteration
        return makeToolUseResponse('read_file', { path: 'a.ts' }, 'tool-1')
      }
      // Delay long enough for deadline to expire (won't reach here)
      await new Promise(resolve => setTimeout(resolve, 200))
      return makeTextResponse('Too late')
    })

    mockedExecuteTool.mockImplementation(async () => {
      // Slow tool execution — pushes past the deadline
      await new Promise(resolve => setTimeout(resolve, 100))
      return {
        toolUseId: 'tool-1',
        toolName: 'read_file',
        input: { path: 'a.ts' },
        success: true,
        data: 'ok',
        display: 'ok',
        durationMs: 100,
        timestamp: new Date().toISOString(),
      }
    })

    const result = await runAgentLoop(makeBaseOptions({
      maxWallClockMs: 50, // 50ms — tool will take 100ms, pushing past deadline
      onError,
    }))

    expect(result.stopReason).toBe('timeout')
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('timed out') }),
      'wall_clock_timeout'
    )
  }, 5000)

  it('enforces per-tool timeout', async () => {
    const onError = vi.fn()

    mockedCallModel.mockResolvedValueOnce(
      makeToolUseResponse('slow_tool', { data: 'test' })
    )

    // Tool takes longer than timeout
    mockedExecuteTool.mockImplementationOnce(() =>
      new Promise((resolve) => setTimeout(() => resolve({
        toolUseId: 'tool-1',
        toolName: 'slow_tool',
        input: { data: 'test' },
        success: true,
        data: 'eventually done',
        display: 'eventually done',
        durationMs: 5000,
        timestamp: new Date().toISOString(),
      }), 5000))
    )

    // After tool timeout, model should get error and respond
    mockedCallModel.mockResolvedValueOnce(makeTextResponse('Tool was too slow'))

    const result = await runAgentLoop(makeBaseOptions({
      toolTimeoutMs: 50, // 50ms timeout
      maxWallClockMs: 10_000, // Give enough wall time
      onError,
    }))

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('timed out') }),
      expect.stringContaining('tool_timeout')
    )
    // Tool should have been recorded as failed
    expect(result.totalToolCalls).toBe(1)
  }, 10_000)

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

  it('calls onTextDelta for text response', async () => {
    const onTextDelta = vi.fn()

    mockedCallModel.mockResolvedValueOnce(makeTextResponse('Full text'))

    await runAgentLoop(makeBaseOptions({ streaming: true, onTextDelta }))

    expect(onTextDelta).toHaveBeenCalled()
    const allText = onTextDelta.mock.calls.map((c: unknown[]) => c[0]).join('')
    expect(allText).toContain('Full text')
  })

  it('handles model errors with retry', async () => {
    const onError = vi.fn()

    mockedCallModel
      .mockRejectedValueOnce(new Error('500 internal server error'))
      .mockResolvedValueOnce(makeTextResponse('Recovered'))

    const result = await runAgentLoop(makeBaseOptions({ onError }))

    expect(result.finalResponse).toBe('Recovered')
    expect(result.stopReason).toBe('end_turn')
    expect(mockedCallModel).toHaveBeenCalledTimes(2)
    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.stringContaining('model_call_retry_1')
    )
  }, 15000)

  it('detects stuck loops', async () => {
    const onError = vi.fn()

    const sameToolResponse = makeToolUseResponse('read_file', { path: 'same.ts' })

    mockedCallModel
      .mockResolvedValueOnce(sameToolResponse)
      .mockResolvedValueOnce(sameToolResponse)
      .mockResolvedValueOnce(sameToolResponse)
      .mockResolvedValueOnce(makeTextResponse('Breaking out'))

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
    expect(result.turns.length).toBeGreaterThanOrEqual(2)
  })

  it('returns complete result shape with all fields', async () => {
    mockedCallModel.mockResolvedValueOnce(makeTextResponse('Complete'))

    const result = await runAgentLoop(makeBaseOptions())

    // Verify all fields exist
    expect(result).toHaveProperty('finalResponse')
    expect(result).toHaveProperty('turns')
    expect(result).toHaveProperty('totalCost')
    expect(result).toHaveProperty('totalToolCalls')
    expect(result).toHaveProperty('totalInputTokens')
    expect(result).toHaveProperty('totalOutputTokens')
    expect(result).toHaveProperty('durationMs')
    expect(result).toHaveProperty('stopReason')

    expect(typeof result.totalInputTokens).toBe('number')
    expect(typeof result.totalOutputTokens).toBe('number')
    expect(typeof result.durationMs).toBe('number')
  })
})
