import { registerTool } from '../tool-registry.js'
import type { ToolCallResult, ExecutionContext } from '../types.js'

interface WebSearchResult {
  title: string
  url: string
  snippet: string
  source: string
}

interface WebSearchResponse {
  provider: string
  query: string
  results: WebSearchResult[]
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function fetchJson<T>(
  url: string,
  init: RequestInit,
  provider: string
): Promise<T> {
  const response = await fetch(url, init)

  if (!response.ok) {
    const body = await response.text()
    throw new Error(
      `${provider} search failed with ${response.status}: ${body.slice(0, 300)}`
    )
  }

  return response.json() as Promise<T>
}

function normalizeResults(
  provider: string,
  query: string,
  results: WebSearchResult[]
): WebSearchResponse {
  return {
    provider,
    query,
    results: results
      .filter((result) => result.title && result.url)
      .slice(0, 5),
  }
}

async function searchWithTavily(query: string): Promise<WebSearchResponse> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) {
    throw new Error('Missing TAVILY_API_KEY')
  }

  const data = await fetchJson<{
    results?: Array<{
      title?: string
      url?: string
      content?: string
    }>
  }>(
    'https://api.tavily.com/search',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'advanced',
        max_results: 5,
      }),
    },
    'Tavily'
  )

  return normalizeResults(
    'tavily',
    query,
    (data.results ?? []).map((result) => ({
      title: result.title ?? 'Untitled result',
      url: result.url ?? '',
      snippet: result.content ?? '',
      source: 'tavily',
    }))
  )
}

async function searchWithSerpApi(query: string): Promise<WebSearchResponse> {
  const apiKey = process.env.SERPAPI_API_KEY
  if (!apiKey) {
    throw new Error('Missing SERPAPI_API_KEY')
  }

  const searchParams = new URLSearchParams({
    engine: 'google',
    q: query,
    num: '5',
    api_key: apiKey,
  })

  const data = await fetchJson<{
    organic_results?: Array<{
      title?: string
      link?: string
      snippet?: string
    }>
  }>(
    `https://serpapi.com/search.json?${searchParams.toString()}`,
    {
      method: 'GET',
    },
    'SerpAPI'
  )

  return normalizeResults(
    'serpapi',
    query,
    (data.organic_results ?? []).map((result) => ({
      title: result.title ?? 'Untitled result',
      url: result.link ?? '',
      snippet: result.snippet ?? '',
      source: 'serpapi',
    }))
  )
}

async function searchWithExa(query: string): Promise<WebSearchResponse> {
  const apiKey = process.env.EXA_API_KEY
  if (!apiKey) {
    throw new Error('Missing EXA_API_KEY')
  }

  const data = await fetchJson<{
    results?: Array<{
      title?: string
      url?: string
      text?: string
      publishedDate?: string
    }>
  }>(
    'https://api.exa.ai/search',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        query,
        type: 'auto',
        numResults: 5,
        useAutoprompt: true,
      }),
    },
    'Exa'
  )

  return normalizeResults(
    'exa',
    query,
    (data.results ?? []).map((result) => ({
      title: result.title ?? 'Untitled result',
      url: result.url ?? '',
      snippet: result.text?.slice(0, 280) ?? '',
      source: result.publishedDate
        ? `exa (${result.publishedDate})`
        : 'exa',
    }))
  )
}

async function performWebSearch(query: string): Promise<WebSearchResponse> {
  const providers = [
    searchWithTavily,
    searchWithSerpApi,
    searchWithExa,
  ]

  const errors: string[] = []

  for (const provider of providers) {
    try {
      const result = await provider(query)
      if (result.results.length > 0) {
        return result
      }
      errors.push(`${result.provider}: no results`)
    } catch (error) {
      errors.push(stringifyError(error))
    }
  }

  throw new Error(
    `No web search provider is configured or available. Set one of TAVILY_API_KEY, SERPAPI_API_KEY, or EXA_API_KEY. Details: ${errors.join(' | ')}`
  )
}

function formatWebSearchDisplay(result: WebSearchResponse): string {
  if (result.results.length === 0) {
    return `No results found for "${result.query}" via ${result.provider}.`
  }

  return [
    `Found ${result.results.length} results via ${result.provider}:`,
    ...result.results.map(
      (item, index) =>
        `${index + 1}. ${item.title}\n   ${item.url}\n   ${item.snippet}`.trimEnd()
    ),
  ].join('\n')
}

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

// ============================================================
// WEB SEARCH (placeholder — will be wired to real search later)
// ============================================================

registerTool(
  {
    name: 'web_search',
    description: 'Search the web for current information. Use when you need up-to-date data that may not be in your training data.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query',
        },
      },
      required: ['query'],
    },
    category: 'web',
  },
  async (input: Record<string, unknown>, _context: ExecutionContext): Promise<ToolCallResult> => {
    const query = input.query as string

    try {
      const result = await performWebSearch(query)

      return {
        toolUseId: '',
        toolName: 'web_search',
        input,
        success: true,
        data: result,
        display: formatWebSearchDisplay(result),
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    } catch (error) {
      return {
        toolUseId: '',
        toolName: 'web_search',
        input,
        success: false,
        data: null,
        display: stringifyError(error),
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    }
  }
)

// ============================================================
// READ FILE (local filesystem — for non-Docker tasks)
// ============================================================

registerTool(
  {
    name: 'read_file',
    description: 'Read the contents of a file from the local filesystem.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute or relative path to the file',
        },
      },
      required: ['path'],
    },
    category: 'system',
  },
  async (input: Record<string, unknown>, _context: ExecutionContext): Promise<ToolCallResult> => {
    const { readFileSync, existsSync } = await import('node:fs')
    const path = input.path as string

    if (!existsSync(path)) {
      return {
        toolUseId: '',
        toolName: 'read_file',
        input,
        success: false,
        data: null,
        display: `File not found: ${path}`,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    }

    const content = readFileSync(path, 'utf-8')
    return {
      toolUseId: '',
      toolName: 'read_file',
      input,
      success: true,
      data: content,
      display: content.length > 2000 ? content.slice(0, 2000) + '\n... (truncated)' : content,
      durationMs: 0,
      timestamp: new Date().toISOString(),
    }
  }
)

// ============================================================
// WRITE FILE (local filesystem — for non-Docker tasks)
// ============================================================

registerTool(
  {
    name: 'write_file',
    description: 'Write content to a file on the local filesystem. Creates parent directories if needed.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute or relative path to the file',
        },
        content: {
          type: 'string',
          description: 'Content to write to the file',
        },
      },
      required: ['path', 'content'],
    },
    category: 'system',
  },
  async (input: Record<string, unknown>, _context: ExecutionContext): Promise<ToolCallResult> => {
    const { writeFileSync, mkdirSync } = await import('node:fs')
    const { dirname } = await import('node:path')

    const path = input.path as string
    const content = input.content as string

    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content, 'utf-8')

    return {
      toolUseId: '',
      toolName: 'write_file',
      input: { path, content: `(${content.length} chars)` },
      success: true,
      data: { path, bytesWritten: content.length },
      display: `Wrote ${content.length} chars to ${path}`,
      durationMs: 0,
      timestamp: new Date().toISOString(),
    }
  }
)

// ============================================================
// RUN COMMAND (local shell — for non-Docker tasks)
// ============================================================

registerTool(
  {
    name: 'run_command',
    description: 'Execute a shell command and return its output. Use for running tests, installing packages, checking status, etc.',
    input_schema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute',
        },
        cwd: {
          type: 'string',
          description: 'Working directory (optional)',
        },
      },
      required: ['command'],
    },
    category: 'system',
  },
  async (input: Record<string, unknown>, _context: ExecutionContext): Promise<ToolCallResult> => {
    const { execSync } = await import('node:child_process')

    const command = input.command as string
    const cwd = (input.cwd as string) || process.cwd()

    try {
      const output = execSync(command, {
        cwd,
        encoding: 'utf-8',
        timeout: 60_000,
        maxBuffer: 1024 * 1024,
      })

      return {
        toolUseId: '',
        toolName: 'run_command',
        input,
        success: true,
        data: output,
        display: output.length > 3000 ? output.slice(0, 3000) + '\n... (truncated)' : output,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    } catch (err) {
      const message = err instanceof Error ? (err as NodeJS.ErrnoException & { stderr?: string }).stderr ?? err.message : String(err)
      return {
        toolUseId: '',
        toolName: 'run_command',
        input,
        success: false,
        data: null,
        display: `Command failed: ${message.slice(0, 2000)}`,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    }
  }
)
