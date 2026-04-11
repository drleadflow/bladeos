import { logger } from '@blade/shared'
import type { AgentMessage, ContentBlock, ModelConfig } from './types.js'
import { callModel, resolveSmartModelConfig } from './model-provider.js'

// Approximate token counts per model family
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'claude': 200_000,
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gemini': 1_000_000,
  'o3': 200_000,
  'default': 128_000,
}

/**
 * Estimate token count for a message using the ~4 chars/token heuristic.
 * Not perfect but avoids adding a tokenizer dependency.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Estimate total tokens in a message array
 */
export function estimateMessageTokens(messages: AgentMessage[]): number {
  let total = 0
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      total += estimateTokens(msg.content)
    } else {
      for (const block of msg.content) {
        if (block.type === 'text') {
          total += estimateTokens((block as { type: 'text'; text: string }).text)
        } else if (block.type === 'tool_result') {
          total += estimateTokens((block as { type: 'tool_result'; tool_use_id: string; content: string }).content)
        } else if (block.type === 'tool_use') {
          total += estimateTokens(JSON.stringify((block as { type: 'tool_use'; input: Record<string, unknown> }).input))
        }
      }
    }
  }
  return total
}

/**
 * Get the context window limit for a model
 */
export function getContextLimit(modelId: string): number {
  for (const [prefix, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
    if (modelId.startsWith(prefix)) return limit
  }
  return MODEL_CONTEXT_LIMITS.default
}

/**
 * Manage context window by summarizing old messages when approaching the limit.
 *
 * Strategy:
 * - Keep the system prompt and most recent messages intact
 * - When history exceeds 60% of context window, summarize the oldest messages
 * - The summary replaces the old messages as a single "user" message
 * - Always preserve at least the last 10 messages verbatim
 */
export async function manageContext(
  messages: AgentMessage[],
  systemPrompt: string,
  modelConfig: ModelConfig,
): Promise<AgentMessage[]> {
  const contextLimit = getContextLimit(modelConfig.modelId)
  const systemTokens = estimateTokens(systemPrompt)
  const messageTokens = estimateMessageTokens(messages)
  const totalTokens = systemTokens + messageTokens

  // Only compress if we exceed 60% of context window
  const threshold = contextLimit * 0.6
  if (totalTokens <= threshold) {
    return messages
  }

  logger.info('ContextManager', `Context at ${Math.round((totalTokens / contextLimit) * 100)}% (${totalTokens}/${contextLimit} tokens). Compressing...`)

  // Preserve at least the last 10 messages
  const preserveCount = Math.min(10, messages.length)
  const toSummarize = messages.slice(0, messages.length - preserveCount)
  const toKeep = messages.slice(messages.length - preserveCount)

  if (toSummarize.length < 2) {
    // Not enough messages to summarize
    return messages
  }

  // Build summary text from old messages
  const summaryParts: string[] = []
  for (const msg of toSummarize) {
    const role = msg.role
    if (typeof msg.content === 'string') {
      summaryParts.push(`[${role}]: ${msg.content.slice(0, 500)}`)
    } else {
      for (const block of msg.content) {
        if (block.type === 'text') {
          const text = (block as { type: 'text'; text: string }).text
          summaryParts.push(`[${role}]: ${text.slice(0, 500)}`)
        } else if (block.type === 'tool_use') {
          const tu = block as { type: 'tool_use'; name: string; input: Record<string, unknown> }
          summaryParts.push(`[${role} tool_use]: ${tu.name}(${JSON.stringify(tu.input).slice(0, 200)})`)
        } else if (block.type === 'tool_result') {
          const tr = block as { type: 'tool_result'; content: string }
          summaryParts.push(`[${role} tool_result]: ${tr.content.slice(0, 300)}`)
        }
      }
    }
  }

  try {
    // Use a light model for summarization
    const summaryConfig = resolveSmartModelConfig('light')
    const summaryResponse = await callModel(
      summaryConfig,
      'You are a conversation summarizer. Summarize the following conversation history concisely, preserving key decisions, tool results, file changes, and important context. Be brief but complete. Output ONLY the summary.',
      [{ role: 'user', content: summaryParts.join('\n\n') }],
      [],
      1024,
    )

    const summaryText = summaryResponse.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('\n')

    const summaryMessage: AgentMessage = {
      role: 'user',
      content: `[Conversation Summary — ${toSummarize.length} earlier messages compressed]\n\n${summaryText}`,
    }

    const newMessages = [summaryMessage, ...toKeep]
    const newTokens = estimateMessageTokens(newMessages)
    logger.info('ContextManager', `Compressed ${toSummarize.length} messages. ${messageTokens} -> ${newTokens} tokens (${Math.round((1 - newTokens / messageTokens) * 100)}% reduction)`)

    return newMessages
  } catch (err) {
    // If summarization fails, fall back to simple truncation
    logger.warn('ContextManager', `Summarization failed, falling back to truncation: ${err instanceof Error ? err.message : String(err)}`)
    return toKeep
  }
}
