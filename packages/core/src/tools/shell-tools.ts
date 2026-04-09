import { registerTool } from '../tool-registry.js'
import type { ToolCallResult, ExecutionContext } from '../types.js'
import { stringifyError } from './web-search.js'

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
      '| sh', '| bash',
      'eval ', 'exec ',
      '$(', '`',  // command substitution
      '; rm', '&& rm', '|| rm',  // chained destructive
      'env ', 'export ',  // env manipulation
      '/etc/passwd', '/etc/shadow',  // sensitive files
      "$'",  // bash ANSI-C quoting for hex escapes
      '${',  // parameter expansion
      '\\x',  // hex escapes
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
    const maxResults = parseInt(input.max_results as string ?? '50', 10)

    // Inline path validation (shell-tools.ts doesn't import validatePath from filesystem-tools)
    const SAFE_BASE_DIRS_SHELL: string[] = [
      process.cwd(),
      process.env.HOME ? (await import('node:path')).join(process.env.HOME, '.blade') : '',
      '/tmp/blade',
    ].filter(Boolean)

    const rawSearchPath = (input.path as string) || process.cwd()
    let rootPath: string
    if (process.env.BLADE_UNSAFE_FS !== '1') {
      const { resolve, sep } = await import('node:path')
      const resolved = resolve(rawSearchPath)
      const allowed = SAFE_BASE_DIRS_SHELL.some(base => resolved === base || resolved.startsWith(base + sep))
      if (!allowed) {
        return {
          toolUseId: '',
          toolName: 'search_code',
          input,
          success: false,
          data: null,
          display: `Access denied: path "${resolved}" is outside allowed directories.`,
          durationMs: 0,
          timestamp: new Date().toISOString(),
        }
      }
      rootPath = resolved
    } else {
      rootPath = rawSearchPath
    }

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
