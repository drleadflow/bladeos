import type { AgentMessage, ToolCallResult, MemoryType } from '../types.js'
import { callModel, resolveModelConfig } from '../model-provider.js'
import { memoryStore } from '../memory/memory-store.js'
import { logger } from '@blade/shared'

interface ExtractedLearning {
  type: 'preference' | 'fact' | 'error_pattern'
  content: string
  tags: string[]
}

const EXTRACTION_SYSTEM_PROMPT = `You are a learning extraction system. Analyze the conversation transcript and extract reusable learnings.

Return a JSON array of learnings. Each learning has:
- type: "preference" (user likes/dislikes, style choices), "fact" (technical facts, project details, configurations), or "error_pattern" (mistakes made, bugs found, solutions that worked)
- content: A concise, self-contained statement of the learning (1-2 sentences max)
- tags: Array of 1-5 short keyword tags for retrieval

Rules:
- Only extract genuinely reusable information, not conversation-specific details
- Be concise — each learning should be independently useful in a future conversation
- If there are no meaningful learnings, return an empty array []
- Return ONLY the JSON array, no markdown fences or extra text`

/**
 * Extract learnings from a completed conversation and save them as memories.
 * Fire-and-forget: never throws, logs errors internally.
 */
export async function extractLearnings(
  conversationId: string,
  messages: AgentMessage[],
  toolCalls: ToolCallResult[]
): Promise<void> {
  try {
    if (messages.length < 2) {
      return
    }

    const transcript = buildTranscript(messages, toolCalls)

    const config = resolveModelConfig('claude-haiku-4-20250514')

    if (!config.apiKey) {
      logger.warn('Learning', 'No API key available for learning extraction, skipping')
      return
    }

    const response = await callModel(
      config,
      EXTRACTION_SYSTEM_PROMPT,
      [{ role: 'user', content: transcript }],
      [],
      2048
    )

    const text = response.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map(b => b.text)
      .join('')

    const learnings = parseLearnings(text)

    for (const learning of learnings) {
      try {
        await saveOrReinforce(learning, conversationId)
      } catch (err) {
        logger.debug('Learning', `Failed to save learning: ${err}`)
      }
    }

    logger.info('Learning', `Extracted ${learnings.length} learnings from conversation ${conversationId}`)
  } catch (err) {
    logger.debug('Learning', `Learning extraction failed (non-fatal): ${err}`)
  }
}

function buildTranscript(messages: AgentMessage[], toolCalls: ToolCallResult[]): string {
  const parts: string[] = ['## Conversation Transcript\n']

  for (const msg of messages) {
    const role = msg.role.toUpperCase()
    if (typeof msg.content === 'string') {
      parts.push(`${role}: ${msg.content}`)
    } else {
      const textParts = msg.content
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map(b => b.text)
      if (textParts.length > 0) {
        parts.push(`${role}: ${textParts.join('\n')}`)
      }
    }
  }

  if (toolCalls.length > 0) {
    parts.push('\n## Tools Used')
    const toolSummary = new Map<string, { count: number; successCount: number }>()
    for (const tc of toolCalls) {
      const entry = toolSummary.get(tc.toolName) ?? { count: 0, successCount: 0 }
      entry.count++
      if (tc.success) entry.successCount++
      toolSummary.set(tc.toolName, entry)
    }
    for (const [name, stats] of toolSummary) {
      parts.push(`- ${name}: ${stats.count} calls, ${stats.successCount} successful`)
    }
  }

  // Truncate to avoid excessive token usage
  const full = parts.join('\n')
  const MAX_CHARS = 12000
  if (full.length > MAX_CHARS) {
    return full.slice(0, MAX_CHARS) + '\n\n[transcript truncated]'
  }
  return full
}

function parseLearnings(text: string): ExtractedLearning[] {
  try {
    // Strip markdown fences if present
    const cleaned = text.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim()
    const parsed = JSON.parse(cleaned)

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter(
      (item: unknown): item is ExtractedLearning =>
        typeof item === 'object' &&
        item !== null &&
        'type' in item &&
        'content' in item &&
        typeof (item as ExtractedLearning).content === 'string' &&
        ['preference', 'fact', 'error_pattern'].includes((item as ExtractedLearning).type)
    ).map(item => ({
      type: item.type,
      content: item.content,
      tags: Array.isArray(item.tags) ? item.tags.filter((t: unknown) => typeof t === 'string') : [],
    }))
  } catch {
    return []
  }
}

function saveOrReinforce(learning: ExtractedLearning, source: string): void {
  // Extract keywords from content for duplicate search
  const keywords = learning.content
    .split(/\s+/)
    .filter(w => w.length > 3)
    .slice(0, 5)
    .join(' ')

  const existing = memoryStore.search(keywords, 3)

  // Check for duplicates by content similarity (simple substring match)
  const duplicate = existing.find(mem => {
    const memContent = mem.content.toLowerCase()
    const learningContent = learning.content.toLowerCase()
    return (
      memContent.includes(learningContent) ||
      learningContent.includes(memContent) ||
      memContent === learningContent
    )
  })

  if (duplicate) {
    memoryStore.reinforce(duplicate.id)
    logger.debug('Learning', `Reinforced existing memory ${duplicate.id}`)
  } else {
    memoryStore.save(
      learning.content,
      learning.type as MemoryType,
      learning.tags,
      `conversation:${source}`
    )
    logger.debug('Learning', `Saved new ${learning.type} memory`)
  }
}
