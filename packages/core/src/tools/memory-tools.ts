import { registerTool } from '../tool-registry.js'
import type { ToolCallResult, ExecutionContext } from '../types.js'

// ============================================================
// SAVE MEMORY
// ============================================================

registerTool(
  {
    name: 'save_memory',
    description: 'Save an important fact, preference, pattern, or learning for future recall. Use this when the user tells you something worth remembering, or when you discover a useful pattern during work.',
    input_schema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The information to remember',
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
    // Dynamic import to avoid circular deps
    const { memories } = await import('@blade/db')

    const content = input.content as string
    const type = input.type as string
    const tagsStr = (input.tags as string) ?? ''
    const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()) : []

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
    description: 'Search your memory for relevant past knowledge, preferences, or patterns. Use this when the user references something from the past, or when you need context about their preferences.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query to find relevant memories',
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
      // FTS5 can fail on special chars — fall back to listing all
      results = memories.getAll(limit)
    }

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
