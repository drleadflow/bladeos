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
    const command = input.command as string
    const cwd = (input.cwd as string) || process.cwd()

    // Comprehensive blocklist to prevent dangerous commands
    const DANGEROUS_PATTERNS = [
      'rm -rf /', 'rm -rf ~', 'rm -rf *',
      'sudo ', 'su ',
      'mkfs', 'dd if=', 'fdisk',
      'chmod 777 /', 'chown -R',
      '> /dev/', '> /etc/',
      'curl | sh', 'curl | bash', 'wget | sh', 'wget | bash',
      'eval ', 'exec ',
      '$(', '`',  // command substitution
      '; rm', '&& rm', '|| rm',  // chained destructive
      'env ', 'export ',  // env manipulation
      '/etc/passwd', '/etc/shadow',  // sensitive files
    ]

    const lowerCommand = command.toLowerCase()
    for (const pattern of DANGEROUS_PATTERNS) {
      if (lowerCommand.includes(pattern.toLowerCase())) {
        return {
          toolUseId: '',
          toolName: 'run_command',
          input,
          success: false,
          data: null,
          display: `Command blocked: contains dangerous pattern "${pattern}". This command is not allowed for safety reasons.`,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        }
      }
    }

    try {
      const { execFileSync } = await import('node:child_process')
      const output = execFileSync('/bin/sh', ['-c', command], {
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

// ============================================================
// GET FILE TREE
// ============================================================

const FILE_TREE_SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', '.turbo', '__pycache__'])

registerTool(
  {
    name: 'get_file_tree',
    description: 'Get a directory tree structure showing files and folders. Useful for understanding project layout.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute or relative path to the directory',
        },
        max_depth: {
          type: 'string',
          description: 'Maximum depth to traverse (default: 3)',
          default: '3',
        },
      },
      required: ['path'],
    },
    category: 'system',
  },
  async (input: Record<string, unknown>, _context: ExecutionContext): Promise<ToolCallResult> => {
    const { readdirSync, statSync } = await import('node:fs')
    const { join, basename } = await import('node:path')

    const rootPath = input.path as string
    const maxDepth = parseInt(input.max_depth as string ?? '3', 10)
    const MAX_LINES = 200

    try {
      const lines: string[] = []
      let truncated = false

      function walk(dirPath: string, prefix: string, depth: number): void {
        if (truncated || depth > maxDepth) return

        let entries: string[]
        try {
          entries = readdirSync(dirPath)
        } catch {
          return
        }

        // Filter and sort: directories first, then files
        const filtered = entries.filter(e => !FILE_TREE_SKIP_DIRS.has(e))
        const dirs: string[] = []
        const files: string[] = []
        for (const entry of filtered) {
          try {
            const fullPath = join(dirPath, entry)
            if (statSync(fullPath).isDirectory()) {
              dirs.push(entry)
            } else {
              files.push(entry)
            }
          } catch {
            files.push(entry)
          }
        }

        const sorted = [...dirs.sort(), ...files.sort()]
        for (let i = 0; i < sorted.length; i++) {
          if (lines.length >= MAX_LINES) {
            truncated = true
            return
          }

          const entry = sorted[i]
          const isLast = i === sorted.length - 1
          const connector = isLast ? '└── ' : '├── '
          const childPrefix = isLast ? '    ' : '│   '
          const fullPath = join(dirPath, entry)

          let isDir = false
          try {
            isDir = statSync(fullPath).isDirectory()
          } catch {
            // treat as file if stat fails
          }

          lines.push(`${prefix}${connector}${entry}${isDir ? '/' : ''}`)

          if (isDir) {
            walk(fullPath, prefix + childPrefix, depth + 1)
          }
        }
      }

      lines.push(`${basename(rootPath)}/`)
      walk(rootPath, '', 1)

      if (truncated) {
        lines.push('(truncated — exceeded 200 lines)')
      }

      const tree = lines.join('\n')

      return {
        toolUseId: '',
        toolName: 'get_file_tree',
        input,
        success: true,
        data: tree,
        display: tree,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    } catch (error) {
      return {
        toolUseId: '',
        toolName: 'get_file_tree',
        input,
        success: false,
        data: null,
        display: `Failed to read directory tree: ${stringifyError(error)}`,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    }
  }
)

// ============================================================
// LIST FILES (glob-like pattern matching)
// ============================================================

const LIST_FILES_SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next'])

registerTool(
  {
    name: 'list_files',
    description: 'Find files matching a glob-like pattern recursively. Supports * wildcard and ** for recursive matching.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Glob-like pattern to match (e.g. "*.ts", "**/*.test.ts", "src/**/*.js")',
        },
        path: {
          type: 'string',
          description: 'Directory to search in (default: current directory)',
        },
      },
      required: ['pattern'],
    },
    category: 'system',
  },
  async (input: Record<string, unknown>, _context: ExecutionContext): Promise<ToolCallResult> => {
    const { readdirSync, statSync } = await import('node:fs')
    const { join, relative } = await import('node:path')

    const pattern = input.pattern as string
    const rootPath = (input.path as string) || process.cwd()

    try {
      // Convert glob pattern to a regex
      function globToRegex(glob: string): RegExp {
        let regexStr = '^'
        let i = 0
        while (i < glob.length) {
          const c = glob[i]
          if (c === '*' && glob[i + 1] === '*') {
            // ** matches any path segment(s)
            regexStr += '.*'
            i += 2
            if (glob[i] === '/') i++ // skip trailing slash after **
          } else if (c === '*') {
            // * matches anything except /
            regexStr += '[^/]*'
            i++
          } else if (c === '?') {
            regexStr += '[^/]'
            i++
          } else if (c === '.') {
            regexStr += '\\.'
            i++
          } else {
            regexStr += c
            i++
          }
        }
        regexStr += '$'
        return new RegExp(regexStr)
      }

      const regex = globToRegex(pattern)
      const matches: string[] = []

      function walk(dirPath: string): void {
        let entries: string[]
        try {
          entries = readdirSync(dirPath)
        } catch {
          return
        }

        for (const entry of entries) {
          if (LIST_FILES_SKIP_DIRS.has(entry)) continue

          const fullPath = join(dirPath, entry)
          let isDir = false
          try {
            isDir = statSync(fullPath).isDirectory()
          } catch {
            continue
          }

          if (isDir) {
            walk(fullPath)
          } else {
            const rel = relative(rootPath, fullPath)
            if (regex.test(rel) || regex.test(entry)) {
              matches.push(rel)
            }
          }
        }
      }

      walk(rootPath)
      matches.sort()

      const display = matches.length > 0
        ? `Found ${matches.length} files:\n${matches.join('\n')}`
        : `No files found matching "${pattern}" in ${rootPath}`

      return {
        toolUseId: '',
        toolName: 'list_files',
        input,
        success: true,
        data: matches,
        display,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    } catch (error) {
      return {
        toolUseId: '',
        toolName: 'list_files',
        input,
        success: false,
        data: null,
        display: `Failed to list files: ${stringifyError(error)}`,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    }
  }
)

// ============================================================
// SEARCH CODE (content search across files)
// ============================================================

const SEARCH_CODE_SKIP_DIRS = new Set(['node_modules', '.git', 'dist'])
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.mp3', '.mp4', '.avi', '.mov', '.webm',
  '.exe', '.dll', '.so', '.dylib', '.o',
  '.lock', '.sqlite', '.db',
])

registerTool(
  {
    name: 'search_code',
    description: 'Search file contents for a text pattern (case-insensitive). Returns matching lines with file paths and line numbers.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Text pattern to search for (case-insensitive substring match)',
        },
        path: {
          type: 'string',
          description: 'Directory to search in (default: current directory)',
        },
        max_results: {
          type: 'string',
          description: 'Maximum number of matching lines to return (default: 50)',
          default: '50',
        },
      },
      required: ['pattern'],
    },
    category: 'system',
  },
  async (input: Record<string, unknown>, _context: ExecutionContext): Promise<ToolCallResult> => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs')
    const { join, relative, extname } = await import('node:path')

    const pattern = (input.pattern as string).toLowerCase()
    const rootPath = (input.path as string) || process.cwd()
    const maxResults = parseInt(input.max_results as string ?? '50', 10)

    try {
      const results: string[] = []

      function walk(dirPath: string): void {
        if (results.length >= maxResults) return

        let entries: string[]
        try {
          entries = readdirSync(dirPath)
        } catch {
          return
        }

        for (const entry of entries) {
          if (results.length >= maxResults) return
          if (SEARCH_CODE_SKIP_DIRS.has(entry)) continue

          const fullPath = join(dirPath, entry)
          let isDir = false
          try {
            isDir = statSync(fullPath).isDirectory()
          } catch {
            continue
          }

          if (isDir) {
            walk(fullPath)
          } else {
            const ext = extname(entry).toLowerCase()
            if (BINARY_EXTENSIONS.has(ext)) continue

            let content: string
            try {
              content = readFileSync(fullPath, 'utf-8')
            } catch {
              continue
            }

            const rel = relative(rootPath, fullPath)
            const lines = content.split('\n')
            for (let i = 0; i < lines.length; i++) {
              if (results.length >= maxResults) return
              if (lines[i].toLowerCase().includes(pattern)) {
                results.push(`${rel}:${i + 1}: ${lines[i].trimEnd()}`)
              }
            }
          }
        }
      }

      walk(rootPath)

      const display = results.length > 0
        ? `Found ${results.length} matches:\n${results.join('\n')}`
        : `No matches found for "${input.pattern}" in ${rootPath}`

      return {
        toolUseId: '',
        toolName: 'search_code',
        input,
        success: true,
        data: results,
        display,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    } catch (error) {
      return {
        toolUseId: '',
        toolName: 'search_code',
        input,
        success: false,
        data: null,
        display: `Failed to search code: ${stringifyError(error)}`,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    }
  }
)

// ============================================================
// BROWSE URL (agent-browser navigation + snapshot)
// ============================================================

const AGENT_BROWSER_NOT_INSTALLED =
  'agent-browser not installed. Run: npm install -g agent-browser && agent-browser install'

function runAgentBrowser(args: string[]): { success: boolean; output: string } {
  try {
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process')
    const output = execFileSync('agent-browser', args, {
      encoding: 'utf-8',
      timeout: 60_000,
      maxBuffer: 2 * 1024 * 1024,
    })
    return { success: true, output }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    if (
      message.includes('not found') ||
      message.includes('ENOENT') ||
      message.includes('command not found')
    ) {
      return { success: false, output: AGENT_BROWSER_NOT_INSTALLED }
    }
    return { success: false, output: `agent-browser error: ${message.slice(0, 2000)}` }
  }
}

registerTool(
  {
    name: 'browse_url',
    description:
      'Navigate to a URL and get a structured snapshot of the page content. Uses agent-browser for AI-optimized page understanding.',
    input_schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to navigate to',
        },
      },
      required: ['url'],
    },
    category: 'web',
  },
  async (input: Record<string, unknown>, _context: ExecutionContext): Promise<ToolCallResult> => {
    const url = input.url as string
    const navigateResult = runAgentBrowser(['navigate', url])
    if (!navigateResult.success) {
      return {
        toolUseId: '',
        toolName: 'browse_url',
        input,
        success: false,
        data: null,
        display: navigateResult.output,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    }
    const result = runAgentBrowser(['snapshot'])

    return {
      toolUseId: '',
      toolName: 'browse_url',
      input,
      success: result.success,
      data: result.success ? result.output : null,
      display: result.output,
      durationMs: 0,
      timestamp: new Date().toISOString(),
    }
  }
)

// ============================================================
// BROWSE CLICK (agent-browser click + snapshot)
// ============================================================

registerTool(
  {
    name: 'browse_click',
    description:
      'Click an element on the current page by its ref (e.g. @e5). Use browse_url first to get element refs.',
    input_schema: {
      type: 'object',
      properties: {
        ref: {
          type: 'string',
          description: 'The element ref to click (e.g. @e5)',
        },
      },
      required: ['ref'],
    },
    category: 'web',
  },
  async (input: Record<string, unknown>, _context: ExecutionContext): Promise<ToolCallResult> => {
    const ref = input.ref as string
    const clickResult = runAgentBrowser(['click', ref])
    if (!clickResult.success) {
      return {
        toolUseId: '',
        toolName: 'browse_click',
        input,
        success: false,
        data: null,
        display: clickResult.output,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    }
    const result = runAgentBrowser(['snapshot'])

    return {
      toolUseId: '',
      toolName: 'browse_click',
      input,
      success: result.success,
      data: result.success ? result.output : null,
      display: result.output,
      durationMs: 0,
      timestamp: new Date().toISOString(),
    }
  }
)

// ============================================================
// BROWSE TYPE (agent-browser type + snapshot)
// ============================================================

registerTool(
  {
    name: 'browse_type',
    description:
      'Type text into a form field by its ref. Use browse_url first to get element refs.',
    input_schema: {
      type: 'object',
      properties: {
        ref: {
          type: 'string',
          description: 'The element ref to type into (e.g. @e5)',
        },
        text: {
          type: 'string',
          description: 'The text to type',
        },
      },
      required: ['ref', 'text'],
    },
    category: 'web',
  },
  async (input: Record<string, unknown>, _context: ExecutionContext): Promise<ToolCallResult> => {
    const ref = input.ref as string
    const text = input.text as string
    const typeResult = runAgentBrowser(['type', ref, text])
    if (!typeResult.success) {
      return {
        toolUseId: '',
        toolName: 'browse_type',
        input,
        success: false,
        data: null,
        display: typeResult.output,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    }
    const result = runAgentBrowser(['snapshot'])

    return {
      toolUseId: '',
      toolName: 'browse_type',
      input,
      success: result.success,
      data: result.success ? result.output : null,
      display: result.output,
      durationMs: 0,
      timestamp: new Date().toISOString(),
    }
  }
)

// ============================================================
// BROWSE SCREENSHOT (agent-browser screenshot)
// ============================================================

registerTool(
  {
    name: 'browse_screenshot',
    description:
      'Take a screenshot of the current page and save it to a file.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path to save the screenshot (default: /tmp/blade-screenshot.png)',
        },
      },
      required: [],
    },
    category: 'web',
  },
  async (input: Record<string, unknown>, _context: ExecutionContext): Promise<ToolCallResult> => {
    const filePath = (input.path as string) || '/tmp/blade-screenshot.png'
    const result = runAgentBrowser(['screenshot', '--path', filePath])

    return {
      toolUseId: '',
      toolName: 'browse_screenshot',
      input,
      success: result.success,
      data: result.success ? { path: filePath } : null,
      display: result.success
        ? `Screenshot saved to ${filePath}`
        : result.output,
      durationMs: 0,
      timestamp: new Date().toISOString(),
    }
  }
)

// ============================================================
// ANALYZE IMAGE (AI vision via Anthropic API)
// ============================================================

registerTool(
  {
    name: 'analyze_image',
    description:
      'Analyze an image using AI vision. Can describe screenshots, UI mockups, diagrams, error messages, etc.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute path to the image file',
        },
        question: {
          type: 'string',
          description: 'Question to ask about the image (default: "Describe what you see in this image.")',
        },
      },
      required: ['path'],
    },
    category: 'system',
  },
  async (input: Record<string, unknown>, _context: ExecutionContext): Promise<ToolCallResult> => {
    const filePath = input.path as string
    const question = (input.question as string) || 'Describe what you see in this image.'

    try {
      const { readFileSync, existsSync } = await import('node:fs')
      const { extname } = await import('node:path')

      if (!existsSync(filePath)) {
        return {
          toolUseId: '',
          toolName: 'analyze_image',
          input,
          success: false,
          data: null,
          display: `Image file not found: ${filePath}`,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        }
      }

      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) {
        return {
          toolUseId: '',
          toolName: 'analyze_image',
          input,
          success: false,
          data: null,
          display: 'Missing ANTHROPIC_API_KEY environment variable.',
          durationMs: 0,
          timestamp: new Date().toISOString(),
        }
      }

      const imageBuffer = readFileSync(filePath)
      const base64Data = imageBuffer.toString('base64')

      const ext = extname(filePath).toLowerCase()
      const mediaTypeMap: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
      }
      const mediaType = mediaTypeMap[ext] || 'image/png'

      const Anthropic = (await import('@anthropic-ai/sdk')).default
      const client = new Anthropic({ apiKey })

      const response = await client.messages.create({
        model: 'claude-haiku-4-20250514',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
                  data: base64Data,
                },
              },
              {
                type: 'text',
                text: question,
              },
            ],
          },
        ],
      })

      const textBlock = response.content.find(
        (block: { type: string }) => block.type === 'text'
      ) as { type: 'text'; text: string } | undefined
      const analysis = textBlock?.text ?? 'No analysis returned.'

      return {
        toolUseId: '',
        toolName: 'analyze_image',
        input,
        success: true,
        data: analysis,
        display: analysis,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    } catch (error) {
      return {
        toolUseId: '',
        toolName: 'analyze_image',
        input,
        success: false,
        data: null,
        display: `Image analysis failed: ${stringifyError(error)}`,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    }
  }
)
