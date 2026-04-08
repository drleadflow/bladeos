import type {
  AgentLoopOptions,
  AgentLoopResult,
  AgentMessage,
  AgentTurn,
  ContentBlock,
  ContentBlockToolUse,
  ContentBlockToolResult,
  StopReason,
  ModelConfig,
} from './types.js'
import { callModel, resolveModelConfig } from './model-provider.js'
import { executeTool } from './tool-registry.js'
import { calculateCost, isWithinBudget } from './cost-tracker.js'
import { logger } from '@blade/shared'

const DEFAULT_MAX_ITERATIONS = 25

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

export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  const {
    systemPrompt,
    tools,
    context,
    maxIterations = DEFAULT_MAX_ITERATIONS,
    costBudget = context.costBudget ?? 0,
    onTurn,
    onToolCall,
    onTextDelta,
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

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    // Cost gate
    if (!isWithinBudget(totalCost, costBudget)) {
      logger.warn('AgentLoop', `Cost budget exceeded: $${totalCost.toFixed(4)} >= $${costBudget}`)
      stopReason = 'cost_limit'
      break
    }

    logger.debug('AgentLoop', `Iteration ${iteration + 1}/${maxIterations}`)

    // Call model
    let response
    try {
      response = await callModel(modelConfig, systemPrompt, messages, tools)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error('AgentLoop', `Model call failed: ${message}`)
      stopReason = 'error'
      break
    }

    // Track cost
    const cost = calculateCost(response.model, response.inputTokens, response.outputTokens)
    totalCost += cost.totalCostUsd

    // Check if model wants to use tools
    const toolUseBlocks = extractToolUseBlocks(response.content)

    if (toolUseBlocks.length === 0) {
      const finalText = extractText(response.content)

      // No tools — final response
      const turn: AgentTurn = {
        iteration,
        response: {
          content: response.content,
          model: response.model,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          stopReason: response.stopReason,
        },
        toolCalls: [],
        costSoFar: totalCost,
      }
      turns.push(turn)
      if (finalText) {
        onTextDelta?.(finalText)
      }
      onTurn?.(turn)
      stopReason = 'end_turn'
      break
    }

    // Execute each tool call
    const toolResults: ContentBlockToolResult[] = []
    const turnToolCalls = []

    for (const block of toolUseBlocks) {
      logger.info('AgentLoop', `Tool call: ${block.name}`, block.input)

      const result = await executeTool(block.name, block.id, block.input, context)
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
        content: response.content,
        model: response.model,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        stopReason: response.stopReason,
      },
      toolCalls: turnToolCalls,
      costSoFar: totalCost,
    }
    turns.push(turn)
    onTurn?.(turn)

    // Append assistant message (with tool_use blocks) and tool results to history
    messages.push({ role: 'assistant', content: response.content })
    messages.push({ role: 'user', content: toolResults })

    // If we've hit max iterations on next loop, mark it
    if (iteration === maxIterations - 1) {
      stopReason = 'max_iterations'
    }
  }

  const finalResponse = turns.length > 0
    ? extractText(turns[turns.length - 1].response.content)
    : ''

  return {
    finalResponse,
    turns,
    totalCost,
    totalToolCalls,
    stopReason,
  }
}
