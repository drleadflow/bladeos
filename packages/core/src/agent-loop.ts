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
import { callModel, streamModel, resolveModelConfig } from './model-provider.js'
import { executeTool } from './tool-registry.js'
import { calculateCost, isWithinBudget } from './cost-tracker.js'
import { logger } from '@blade/shared'

const DEFAULT_MAX_ITERATIONS = 25
const MAX_MODEL_RETRIES = 2
const RETRY_DELAYS_MS = [1000, 3000]
const STUCK_LOOP_THRESHOLD = 3

function extractText(content: ContentBlock[]): string {
  return content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map(b => b.text)
    .join('')
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

export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  const {
    systemPrompt,
    tools,
    context,
    maxIterations = DEFAULT_MAX_ITERATIONS,
    costBudget = context.costBudget ?? 0,
    streaming = false,
    onTurn,
    onToolCall,
    onTextDelta,
    onComplete,
    onError,
  } = options

  const modelConfig: ModelConfig = resolveModelConfig(context.modelId)

  if (!modelConfig.apiKey) {
    throw new Error(`No API key configured for provider "${modelConfig.provider}". Set the appropriate environment variable.`)
  }

  // Mutable message history for the loop
  const messages: AgentMessage[] = [...options.messages]
  const turns: AgentTurn[] = []
  let totalCost = 0
  let totalToolCalls = 0
  let stopReason: StopReason = 'end_turn'

  // Track tool call history for stuck-loop detection
  const toolCallHistory: Array<{ name: string; input: string }> = []

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    // Cost gate
    if (!isWithinBudget(totalCost, costBudget)) {
      logger.warn('AgentLoop', `Cost budget exceeded: $${totalCost.toFixed(4)} >= $${costBudget}`)
      stopReason = 'cost_limit'
      break
    }

    logger.debug('AgentLoop', `Iteration ${iteration + 1}/${maxIterations}`)

    // Determine if we can use streaming for this provider
    const canStream = streaming && modelConfig.provider !== 'claude-cli'

    // Call model with retry logic (up to MAX_MODEL_RETRIES retries with exponential backoff)
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
        const isLastAttempt = attempt === MAX_MODEL_RETRIES

        if (isLastAttempt) {
          logger.error('AgentLoop', `Model call failed after ${MAX_MODEL_RETRIES + 1} attempts: ${error.message}`)
          onError?.(error, `model_call_failed_after_retries`)
          stopReason = 'error'
        } else {
          const delayMs = RETRY_DELAYS_MS[attempt] ?? 3000
          logger.warn('AgentLoop', `Model call attempt ${attempt + 1} failed: ${error.message}. Retrying in ${delayMs}ms...`)
          onError?.(error, `model_call_retry_${attempt + 1}`)
          await sleep(delayMs)
        }
      }
    }

    if (!modelCallSucceeded) {
      break
    }

    // Track cost
    const cost = calculateCost(response!.model, response!.inputTokens, response!.outputTokens)
    totalCost += cost.totalCostUsd

    // Check if model wants to use tools
    const toolUseBlocks = extractToolUseBlocks(response!.content)

    if (toolUseBlocks.length === 0) {
      const finalText = extractText(response!.content)

      // No tools — final response
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
        // Only emit bulk text when not streaming — streaming already fired onTextDelta per chunk
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

      // Inject a message telling the model to try a different approach
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
      // Continue to next iteration instead of breaking — give the model a chance to recover
      continue
    }

    // Execute each tool call, catching errors per-tool instead of crashing the loop
    const toolResults: ContentBlockToolResult[] = []
    const turnToolCalls: ToolCallResult[] = []

    for (const block of toolUseBlocks) {
      logger.info('AgentLoop', `Tool call: ${block.name}`, block.input)

      let result: ToolCallResult
      try {
        result = await executeTool(block.name, block.id, block.input, context)
      } catch (err) {
        // Catch unexpected errors from tool execution that bypass executeTool's own error handling
        const error = err instanceof Error ? err : new Error(String(err))
        logger.error('AgentLoop', `Unexpected tool error in "${block.name}": ${error.message}`)
        onError?.(error, `tool_crash_${block.name}`)

        result = {
          toolUseId: block.id,
          toolName: block.name,
          input: block.input,
          success: false,
          data: null,
          display: `Tool "${block.name}" crashed: ${error.message}`,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        }
      }

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

    // If we've hit max iterations on next loop, mark it
    if (iteration === maxIterations - 1) {
      stopReason = 'max_iterations'
    }
  }

  const finalResponse = turns.length > 0
    ? extractText(turns[turns.length - 1].response.content)
    : ''

  const result: AgentLoopResult = {
    finalResponse,
    turns,
    totalCost,
    totalToolCalls,
    stopReason,
  }

  onComplete?.(result)

  return result
}
