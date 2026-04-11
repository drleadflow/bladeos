import type {
  AgentLoopOptions,
  AgentLoopResult,
  AgentMessage,
  AgentTurn,
  ContentBlock,
  ContentBlockToolUse,
  ContentBlockToolResult,
  ToolCallResult,
  StopReason,
  ModelConfig,
} from './types.js'
import { callModel, streamModel, resolveModelConfig, resolveSmartModelConfigChain } from './model-provider.js'
import { manageContext } from './context-manager.js'
import { executeTool } from './tool-registry.js'
import { calculateCost, isWithinBudget } from './cost-tracker.js'
import { requiresApproval, requestApproval, waitForApproval } from './approval-checker.js'
import { logger } from '@blade/shared'

const DEFAULT_MAX_ITERATIONS = 25
const MAX_MODEL_RETRIES = 2
const RETRY_DELAYS_MS = [1000, 3000]
const STUCK_LOOP_THRESHOLD = 3
const DEFAULT_MAX_WALL_CLOCK_MS = 600_000 // 10 minutes
const DEFAULT_TOOL_TIMEOUT_MS = 120_000   // 2 minutes per tool

// ============================================================
// ERROR CLASSIFICATION (inspired by Hermes agent/error_classifier.py)
// ============================================================

type ErrorCategory = 'auth' | 'rate_limit' | 'context_overflow' | 'timeout' | 'server_error' | 'model_not_found' | 'unknown'

interface ClassifiedError {
  category: ErrorCategory
  retryable: boolean
  retryDelayMs?: number
  message: string
}

function classifyError(err: Error): ClassifiedError {
  const msg = err.message.toLowerCase()

  if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('invalid api key') || msg.includes('authentication')) {
    return { category: 'auth', retryable: false, message: err.message }
  }

  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests')) {
    const retryAfterMatch = msg.match(/retry.after[:\s]*(\d+)/i)
    const retryDelayMs = retryAfterMatch ? parseInt(retryAfterMatch[1], 10) * 1000 : 10_000
    return { category: 'rate_limit', retryable: true, retryDelayMs, message: err.message }
  }

  if (msg.includes('context') && (msg.includes('too long') || msg.includes('overflow') || msg.includes('exceed'))
    || msg.includes('maximum context length')
    || (msg.includes('400') && (msg.includes('too many tokens') || msg.includes('max_tokens')))) {
    return { category: 'context_overflow', retryable: false, message: err.message }
  }

  if (msg.includes('model not found') || msg.includes('not a valid model') || msg.includes('404') || msg.includes('does not exist')) {
    return { category: 'model_not_found', retryable: false, message: err.message }
  }

  if (msg.includes('timeout') || msg.includes('etimedout') || msg.includes('econnreset') || msg.includes('socket hang up')) {
    return { category: 'timeout', retryable: true, retryDelayMs: 2000, message: err.message }
  }

  if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504')
    || msg.includes('internal server error') || msg.includes('bad gateway') || msg.includes('overloaded')) {
    return { category: 'server_error', retryable: true, message: err.message }
  }

  return { category: 'unknown', retryable: true, message: err.message }
}

function extractText(content: ContentBlock[]): string {
  return content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map(b => b.text)
    .join('')
}

function extractLatestTextFromTurns(turns: AgentTurn[]): string {
  for (let i = turns.length - 1; i >= 0; i--) {
    const text = extractText(turns[i].response.content).trim()
    if (text) {
      return text
    }
  }

  return ''
}

function extractToolUseBlocks(content: ContentBlock[]): ContentBlockToolUse[] {
  return content.filter(
    (b): b is ContentBlockToolUse => b.type === 'tool_use'
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Detect if the same tool+input has been called N+ times consecutively. */
function isStuckLoop(
  history: Array<{ name: string; input: string }>,
  threshold: number
): boolean {
  if (history.length < threshold) return false
  const recent = history.slice(-threshold)
  const first = recent[0]
  return recent.every(h => h.name === first.name && h.input === first.input)
}

/**
 * Runs async tasks with a concurrency limit.
 * Results are returned in task submission order (same as Promise.allSettled).
 *
 * Future enhancement: individual ToolDefinitions could carry a `sequential: true`
 * flag to force them out of the parallel batch and run one-at-a-time.
 */
async function withConcurrencyLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: Array<{ index: number } & PromiseSettledResult<T>> = []
  const executing = new Set<Promise<void>>()

  for (let i = 0; i < tasks.length; i++) {
    const index = i
    const task = tasks[i]
    const p: Promise<void> = task().then(
      value => { results.push({ index, status: 'fulfilled', value }) },
      reason => { results.push({ index, status: 'rejected', reason }) },
    ).then(() => { executing.delete(p) })
    executing.add(p)
    if (executing.size >= limit) {
      await Promise.race(executing)
    }
  }

  await Promise.allSettled([...executing])

  // Return in original task order
  results.sort((a, b) => a.index - b.index)
  return results.map(({ status, ...rest }) =>
    status === 'fulfilled'
      ? { status, value: (rest as { value: T }).value }
      : { status, reason: (rest as { reason: unknown }).reason },
  )
}

/** Wrap a promise with a timeout. Rejects with a descriptive error on timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`))
    }, ms)

    promise.then(
      (val) => { clearTimeout(timer); resolve(val) },
      (err) => { clearTimeout(timer); reject(err) },
    )
  })
}

export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  const {
    systemPrompt,
    tools,
    context,
    maxIterations = DEFAULT_MAX_ITERATIONS,
    costBudget = context.costBudget ?? 0,
    maxWallClockMs = DEFAULT_MAX_WALL_CLOCK_MS,
    toolTimeoutMs = DEFAULT_TOOL_TIMEOUT_MS,
    parallelTools = true,
    streaming = false,
    onTurn,
    onToolCall,
    onTextDelta,
    onComplete,
    onError,
  } = options

  const loopStartTime = performance.now()
  const deadline = Date.now() + maxWallClockMs

  // Build provider fallback chain: primary config + alternatives
  const fallbackChain: ModelConfig[] = context.modelConfig
    ? [context.modelConfig]
    : resolveSmartModelConfigChain('standard', { needsToolCalling: true })
  let modelConfig: ModelConfig = fallbackChain[0] ?? resolveModelConfig(context.modelId)

  if (!modelConfig.apiKey) {
    throw new Error(`No API key configured for provider "${modelConfig.provider}". Set the appropriate environment variable.`)
  }

  // Mutable message history for the loop
  let messages: AgentMessage[] = [...options.messages]
  const turns: AgentTurn[] = []
  let totalCost = 0
  let totalToolCalls = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let stopReason: StopReason = 'end_turn'

  // Track tool call history for stuck-loop detection
  const toolCallHistory: Array<{ name: string; input: string }> = []

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    // Wall-clock deadline check
    if (Date.now() >= deadline) {
      logger.warn('AgentLoop', `Wall-clock timeout reached (${Math.round(maxWallClockMs / 1000)}s)`)
      onError?.(new Error(`Agent loop timed out after ${Math.round(maxWallClockMs / 1000)}s`), 'wall_clock_timeout')
      stopReason = 'timeout'
      break
    }

    // Cost gate
    if (!isWithinBudget(totalCost, costBudget)) {
      logger.warn('AgentLoop', `Cost budget exceeded: $${totalCost.toFixed(4)} >= $${costBudget}`)
      stopReason = 'cost_limit'
      break
    }

    logger.debug('AgentLoop', `Iteration ${iteration + 1}/${maxIterations} | tokens: ${totalInputTokens}in/${totalOutputTokens}out | cost: $${totalCost.toFixed(4)}`)

    // Manage context window before calling the model
    messages = await manageContext(messages, systemPrompt, modelConfig)

    // Determine if we can use streaming for this provider
    const canStream = streaming && modelConfig.provider !== 'claude-cli'

    // Call model with classified error handling and retry logic
    let response
    let modelCallSucceeded = false

    for (let attempt = 0; attempt <= MAX_MODEL_RETRIES; attempt++) {
      try {
        if (canStream) {
          for await (const event of streamModel(modelConfig, systemPrompt, messages, tools)) {
            if (event.type === 'text_delta') {
              onTextDelta?.(event.text)
            }
            if (event.type === 'message_done') {
              response = event.response
            }
          }
          if (!response) {
            throw new Error('Stream ended without a message_done event')
          }
        } else {
          response = await callModel(modelConfig, systemPrompt, messages, tools)
        }
        modelCallSucceeded = true
        break
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        const classified = classifyError(error)
        const isLastAttempt = attempt === MAX_MODEL_RETRIES

        if (!classified.retryable) {
          logger.error('AgentLoop', `Model call failed (${classified.category}, non-retryable): ${error.message}`)
          onError?.(error, `model_call_${classified.category}`)
          stopReason = 'error'
          break
        }

        if (isLastAttempt) {
          logger.error('AgentLoop', `Model call failed after ${MAX_MODEL_RETRIES + 1} attempts (${classified.category}): ${error.message}`)
          onError?.(error, `model_call_failed_after_retries`)
          stopReason = 'error'
        } else {
          const delayMs = classified.retryDelayMs ?? RETRY_DELAYS_MS[attempt] ?? 3000
          logger.warn('AgentLoop', `Model call attempt ${attempt + 1} failed (${classified.category}): ${error.message}. Retrying in ${delayMs}ms...`)
          onError?.(error, `model_call_retry_${attempt + 1}_${classified.category}`)
          await sleep(delayMs)
        }
      }
    }

    // Provider fallback: if primary failed all retries, try next provider in chain
    if (!modelCallSucceeded && fallbackChain.length > 1) {
      for (let fi = 1; fi < fallbackChain.length; fi++) {
        const fallbackConfig = fallbackChain[fi]
        if (!fallbackConfig.apiKey) continue
        logger.warn('AgentLoop', `Primary provider "${modelConfig.provider}" failed. Falling back to "${fallbackConfig.provider}" (${fallbackConfig.modelId})`)
        onError?.(new Error(`Falling back to ${fallbackConfig.provider}`), 'provider_fallback')

        try {
          const canFallbackStream = streaming && fallbackConfig.provider !== 'claude-cli'
          if (canFallbackStream) {
            for await (const event of streamModel(fallbackConfig, systemPrompt, messages, tools)) {
              if (event.type === 'text_delta') onTextDelta?.(event.text)
              if (event.type === 'message_done') response = event.response
            }
            if (!response) throw new Error('Fallback stream ended without message_done')
          } else {
            response = await callModel(fallbackConfig, systemPrompt, messages, tools)
          }
          modelConfig = fallbackConfig
          modelCallSucceeded = true
          stopReason = 'end_turn'
          logger.info('AgentLoop', `Fallback to "${fallbackConfig.provider}" succeeded`)
          break
        } catch (fallbackErr) {
          const fbError = fallbackErr instanceof Error ? fallbackErr : new Error(String(fallbackErr))
          logger.error('AgentLoop', `Fallback to "${fallbackConfig.provider}" also failed: ${fbError.message}`)
          onError?.(fbError, `fallback_${fallbackConfig.provider}_failed`)
        }
      }
    }

    if (!modelCallSucceeded) {
      break
    }

    // Track tokens
    totalInputTokens += response!.inputTokens
    totalOutputTokens += response!.outputTokens

    // Track cost
    const cost = calculateCost(response!.model, response!.inputTokens, response!.outputTokens)
    totalCost += cost.totalCostUsd

    // Check if model wants to use tools
    const toolUseBlocks = extractToolUseBlocks(response!.content)

    if (toolUseBlocks.length === 0) {
      const finalText = extractText(response!.content)

      const turn: AgentTurn = {
        iteration,
        response: {
          content: response!.content,
          model: response!.model,
          inputTokens: response!.inputTokens,
          outputTokens: response!.outputTokens,
          stopReason: response!.stopReason,
        },
        toolCalls: [],
        costSoFar: totalCost,
      }
      turns.push(turn)
      if (finalText && !canStream) {
        onTextDelta?.(finalText)
      }
      onTurn?.(turn)
      stopReason = 'end_turn'
      break
    }

    // Stuck-loop detection: check if the agent is repeating the same tool call
    for (const block of toolUseBlocks) {
      toolCallHistory.push({ name: block.name, input: JSON.stringify(block.input) })
    }

    if (isStuckLoop(toolCallHistory, STUCK_LOOP_THRESHOLD)) {
      const lastCall = toolCallHistory[toolCallHistory.length - 1]
      logger.warn('AgentLoop', `Stuck loop detected: "${lastCall.name}" called ${STUCK_LOOP_THRESHOLD}+ times with identical input. Breaking out.`)
      const stuckError = new Error(`Agent stuck in loop: "${lastCall.name}" called ${STUCK_LOOP_THRESHOLD}+ times with same input`)
      onError?.(stuckError, 'stuck_loop_detected')

      messages.push({ role: 'assistant', content: response!.content })
      messages.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: toolUseBlocks[0].id,
          content: `Error: You have called "${lastCall.name}" ${STUCK_LOOP_THRESHOLD} times with the same input. Please try a different approach or respond to the user directly.`,
          is_error: true,
        }],
      })
      continue
    }

    // Check deadline before executing tools
    if (Date.now() >= deadline) {
      logger.warn('AgentLoop', `Wall-clock timeout reached before tool execution`)
      stopReason = 'timeout'
      break
    }

    // Execute tool calls — parallel (default) or sequential (parallelTools: false)
    const toolResults: ContentBlockToolResult[] = []
    const turnToolCalls: ToolCallResult[] = []

    /**
     * Core logic for executing a single tool block (approval + execution).
     * Returns a ToolCallResult — never throws; errors are captured in the result.
     */
    const executeBlock = async (block: ContentBlockToolUse): Promise<ToolCallResult> => {
      logger.info('AgentLoop', `Tool call: ${block.name}`, block.input)

      // Approval gate: check if this tool needs human approval before execution
      if (requiresApproval(block.name, block.input)) {
        logger.info('AgentLoop', `Tool "${block.name}" requires approval — requesting...`)
        onError?.(new Error(`Approval required for "${block.name}"`), `approval_requested_${block.name}`)

        try {
          const approvalId = requestApproval({
            toolName: block.name,
            toolInput: block.input,
            userId: context.userId,
            conversationId: context.conversationId,
          })

          const { approved, decidedBy } = await waitForApproval(approvalId, Math.min(toolTimeoutMs, 300_000))

          if (!approved) {
            logger.info('AgentLoop', `Tool "${block.name}" was ${decidedBy === 'system-timeout' ? 'timed out' : 'rejected'}`)
            return {
              toolUseId: block.id,
              toolName: block.name,
              input: block.input,
              success: false,
              data: null,
              display: decidedBy === 'system-timeout'
                ? `Tool "${block.name}" approval timed out. The operator did not respond in time. Try a different approach or ask the user to approve.`
                : `Tool "${block.name}" was rejected by ${decidedBy ?? 'the operator'}. Do not retry this action — try a different approach.`,
              durationMs: 0,
              timestamp: new Date().toISOString(),
            }
          }

          logger.info('AgentLoop', `Tool "${block.name}" approved by ${decidedBy ?? 'operator'}`)
        } catch (approvalErr) {
          const message = approvalErr instanceof Error ? approvalErr.message : String(approvalErr)
          logger.error('AgentLoop', `Approval check failed for "${block.name}": ${message}`)
          return {
            toolUseId: block.id,
            toolName: block.name,
            input: block.input,
            success: false,
            data: null,
            display: `Tool "${block.name}" could not run because the approval system failed: ${message}`,
            durationMs: 0,
            timestamp: new Date().toISOString(),
          }
        }
      }

      try {
        return await withTimeout(
          executeTool(block.name, block.id, block.input, context),
          toolTimeoutMs,
          `Tool "${block.name}"`,
        )
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        const isTimeout = error.message.includes('timed out')
        logger.error('AgentLoop', `${isTimeout ? 'Tool timeout' : 'Unexpected tool error'} in "${block.name}": ${error.message}`)
        onError?.(error, isTimeout ? `tool_timeout_${block.name}` : `tool_crash_${block.name}`)

        return {
          toolUseId: block.id,
          toolName: block.name,
          input: block.input,
          success: false,
          data: null,
          display: isTimeout
            ? `Tool "${block.name}" timed out after ${Math.round(toolTimeoutMs / 1000)}s. Try a simpler approach or break the operation into smaller steps.`
            : `Tool "${block.name}" crashed: ${error.message}`,
          durationMs: isTimeout ? toolTimeoutMs : 0,
          timestamp: new Date().toISOString(),
        }
      }
    }

    if (parallelTools && toolUseBlocks.length > 1) {
      // Parallel path: run all tool calls concurrently (max 5 at a time)
      // Results are returned in the same order as toolUseBlocks to match tool_use IDs.
      const settled = await withConcurrencyLimit(
        toolUseBlocks.map(block => () => executeBlock(block)),
        5,
      )

      for (const settled_result of settled) {
        // executeBlock never rejects (errors are captured inside), so 'rejected'
        // would only occur from an unexpected internal error — handle defensively.
        const result: ToolCallResult = settled_result.status === 'fulfilled'
          ? settled_result.value
          : {
              toolUseId: 'unknown',
              toolName: 'unknown',
              input: {},
              success: false,
              data: null,
              display: `Unexpected executor error: ${String(settled_result.reason)}`,
              durationMs: 0,
              timestamp: new Date().toISOString(),
            }

        totalToolCalls++
        onToolCall?.(result)
        turnToolCalls.push(result)
        toolResults.push({
          type: 'tool_result',
          tool_use_id: result.toolUseId,
          content: result.success ? (result.display || JSON.stringify(result.data)) : `Error: ${result.display}`,
          is_error: !result.success,
        })
      }
    } else {
      // Sequential path: execute one tool at a time (parallelTools: false, or only 1 tool)
      for (const block of toolUseBlocks) {
        const result = await executeBlock(block)
        totalToolCalls++
        onToolCall?.(result)
        turnToolCalls.push(result)
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result.success ? (result.display || JSON.stringify(result.data)) : `Error: ${result.display}`,
          is_error: !result.success,
        })
      }
    }

    // Build turn record
    const turn: AgentTurn = {
      iteration,
      response: {
        content: response!.content,
        model: response!.model,
        inputTokens: response!.inputTokens,
        outputTokens: response!.outputTokens,
        stopReason: response!.stopReason,
      },
      toolCalls: turnToolCalls,
      costSoFar: totalCost,
    }
    turns.push(turn)
    onTurn?.(turn)

    // Append assistant message (with tool_use blocks) and tool results to history
    messages.push({ role: 'assistant', content: response!.content })
    messages.push({ role: 'user', content: toolResults })

    if (iteration === maxIterations - 1) {
      stopReason = 'max_iterations'
    }
  }

  const finalResponse = extractLatestTextFromTurns(turns)
  const durationMs = Math.round(performance.now() - loopStartTime)

  const result: AgentLoopResult = {
    finalResponse,
    turns,
    totalCost,
    totalToolCalls,
    totalInputTokens,
    totalOutputTokens,
    durationMs,
    stopReason,
  }

  // Award XP for agent loop activity
  try {
    const { awardXP, XP_AWARDS } = await import('./gamification/index.js')
    if (totalToolCalls > 0) {
      awardXP({ action: 'first_tool_use_of_day', xp: XP_AWARDS.first_tool_use_of_day })
    }
    if (turns.length > 0 && stopReason === 'end_turn') {
      awardXP({ action: 'completed_task', xp: XP_AWARDS.completed_task })
    }
  } catch { /* gamification not initialized */ }

  try {
    const { checkAchievements } = await import('./gamification/index.js')
    checkAchievements()
  } catch { /* ignore */ }

  onComplete?.(result)

  return result
}
