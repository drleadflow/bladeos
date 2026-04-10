import { registerTool } from '../tool-registry.js'
import type { ToolCallResult, ExecutionContext } from '../types.js'
import { logger } from '@blade/shared'

// ============================================================
// PROMPT INJECTION SCANNING (Hermes-inspired)
// ============================================================

const INJECTION_PATTERNS = [
  /\bignore\s+(previous|above|all)\s+(instructions?|prompts?)/i,
  /\byou\s+are\s+now\b/i,
  /\bsystem\s*:\s*/i,
  /\bnew\s+instructions?\b/i,
  /\boverride\b.*\b(system|instructions?|prompt)\b/i,
  /\bforget\s+(everything|all|your)\b/i,
  /\bact\s+as\b/i,
  /\bcurl\s+.*\|\s*sh\b/i,
  /\bwget\s+.*\|\s*sh\b/i,
  /[\u200B-\u200F\u2028-\u202F\uFEFF]/, // invisible unicode characters
]

function containsInjection(text: string): boolean {
  return INJECTION_PATTERNS.some(pattern => pattern.test(text))
}

// ============================================================
// SAVE MEMORY
// ============================================================

registerTool(
  {
    name: 'save_memory',
    description: 'Save an important fact, preference, pattern, or learning for future recall. Use this when the user tells you something worth remembering, or when you discover a useful pattern during work. Do NOT save task progress, session outcomes, or temporary state.',
    input_schema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The information to remember. Must be a durable fact, not temporary task state.',
        },
        type: {
          type: 'string',
          description: 'Category of memory',
          enum: ['fact', 'preference', 'skill_result', 'error_pattern'],
        },
        tags: {
          type: 'string',
          description: 'Comma-separated tags for retrieval (e.g. "auth,bcrypt,security")',
        },
      },
      required: ['content', 'type'],
    },
    category: 'memory',
  },
  async (input: Record<string, unknown>, context: ExecutionContext): Promise<ToolCallResult> => {
    const { memories } = await import('@blade/db')

    const content = input.content as string
    const type = input.type as string
    const tagsStr = (input.tags as string) ?? ''
    const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()) : []

    // Prompt injection scan (Hermes pattern)
    if (containsInjection(content)) {
      logger.warn('MemoryTools', `Blocked memory write with suspected injection: "${content.slice(0, 100)}"`)
      return {
        toolUseId: '',
        toolName: 'save_memory',
        input,
        success: false,
        data: null,
        display: 'Memory content was blocked — it contains patterns that look like prompt injection. Please rephrase as a plain fact.',
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    }

    // Content length guard (Hermes uses 2200 char limit per memory file)
    if (content.length > 2000) {
      return {
        toolUseId: '',
        toolName: 'save_memory',
        input,
        success: false,
        data: null,
        display: 'Memory content too long (max 2000 chars). Summarize the key fact and try again.',
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    }

    const { id } = memories.create({
      type,
      content,
      tags,
      source: context.conversationId,
    })

    return {
      toolUseId: '',
      toolName: 'save_memory',
      input,
      success: true,
      data: { id },
      display: `Saved memory: "${content.slice(0, 80)}${content.length > 80 ? '...' : ''}"`,
      durationMs: 0,
      timestamp: new Date().toISOString(),
    }
  }
)

// ============================================================
// RECALL MEMORY
// ============================================================

registerTool(
  {
    name: 'recall_memory',
    description: 'Search your memory for relevant past knowledge, preferences, or patterns. Use this when the user references something from the past, or when you need context about their preferences. Only use when the user asks about something you might have stored.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Specific search query to find relevant memories. Be precise — vague queries return noise.',
        },
        limit: {
          type: 'string',
          description: 'Maximum number of results (default: 5)',
          default: '5',
        },
      },
      required: ['query'],
    },
    category: 'memory',
  },
  async (input: Record<string, unknown>, _context: ExecutionContext): Promise<ToolCallResult> => {
    const { memories } = await import('@blade/db')

    const query = input.query as string
    const limit = parseInt(input.limit as string ?? '5', 10)

    let results: unknown[]
    try {
      results = memories.search(query, limit)
    } catch {
      // FTS5 can fail on special chars — fall back to listing recent
      results = memories.getAll(limit)
    }

    // Sanitize results — strip any content that looks like injection
    results = (results as { id: string; content: string }[]).filter(r => !containsInjection(r.content))

    // Reinforce accessed memories
    for (const r of results as { id: string }[]) {
      memories.reinforce(r.id)
    }

    const display = results.length > 0
      ? `Found ${results.length} memories:\n${(results as { content: string }[]).map((r, i) => `${i + 1}. ${r.content}`).join('\n')}`
      : 'No memories found for that query.'

    return {
      toolUseId: '',
      toolName: 'recall_memory',
      input,
      success: true,
      data: results,
      display,
      durationMs: 0,
      timestamp: new Date().toISOString(),
    }
  }
)
