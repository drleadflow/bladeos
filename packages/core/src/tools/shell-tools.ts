import { registerTool } from '../tool-registry.js'
import type { ToolCallResult, ExecutionContext } from '../types.js'
import { stringifyError } from './web-search.js'

// ============================================================
// SHARED COMMAND VALIDATION (allowlist-based)
// ============================================================

const ALLOWED_COMMAND_PREFIXES = [
  'npm', 'npx', 'node ', 'git ', 'ls', 'cat ', 'grep ', 'find ', 'echo ',
  'mkdir ', 'cd ', 'pwd', 'touch ', 'cp ', 'mv ', 'rm ', 'make', 'cargo ',
  'go ', 'python -m', 'python3 -m', 'pip ', 'pip3 ', 'yarn ', 'pnpm ',
  'tsc', 'eslint', 'prettier', 'jest', 'vitest', 'mocha', 'pytest',
  'rustc', 'gcc', 'g++', 'javac', 'java ', 'mvn ', 'gradle ',
  'docker ', 'curl ', 'wget ', 'tar ', 'unzip ', 'zip ',
  'head ', 'tail ', 'wc ', 'sort ', 'uniq ', 'diff ', 'patch ',
  'chmod ', 'chown ', 'which ', 'env ', 'test ', 'true', 'false',
  'sed ', 'awk ', 'xargs ', 'tr ', 'cut ',
]

const ALWAYS_BLOCKED = [
  'printenv', '/proc/', '/dev/tcp', '/dev/udp',
  'python -c', 'python3 -c', 'node -e', 'ruby -e', 'perl -e',
  '| bash', '| sh', '| zsh', '|bash', '|sh', '|zsh',
  'sh -c', 'bash -c', 'zsh -c',
  'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GITHUB_TOKEN',
  'API_KEY', 'SECRET', 'TOKEN', 'PASSWORD',
]

const DANGEROUS_PATTERNS = [
  'rm -rf /', 'rm -rf ~', 'rm -rf *',
  'sudo ', 'su ',
  'mkfs', 'dd if=', 'fdisk',
  'chmod 777 /', 'chown -R',
  '> /dev/', '> /etc/',
  'eval ', 'exec ',
  '; rm', '&& rm', '|| rm',
  'export ',
  '/etc/passwd', '/etc/shadow',
  "$'",
  '\\x',
  'curl.*|.*sh', 'wget.*|.*sh',
]

/**
 * Validates a shell command against the allowlist and blocklists.
 * Returns null if the command is permitted, or an error string if it should be blocked.
 */
export function validateShellCommand(command: string): string | null {
  // Step 1: check ALWAYS_BLOCKED
  for (const pattern of ALWAYS_BLOCKED) {
    if (command.includes(pattern)) {
      return 'Command not allowed. Only standard development commands are permitted.'
    }
  }

  // Step 2: command substitution checks
  if (command.includes('`') || command.includes('$(') || command.includes('${')) {
    return 'Command not allowed. Only standard development commands are permitted.'
  }

  // Step 3: allowlist check
  const trimmedCommand = command.trimStart()
  const isAllowed = ALLOWED_COMMAND_PREFIXES.some(prefix => trimmedCommand.startsWith(prefix))
  if (!isAllowed) {
    return 'Command not allowed. Only standard development commands are permitted.'
  }

  // Step 4: secondary DANGEROUS_PATTERNS safety net
  const lowerCommand = command.toLowerCase()
  for (const pattern of DANGEROUS_PATTERNS) {
    if (lowerCommand.includes(pattern.toLowerCase())) {
      return 'Command not allowed. Only standard development commands are permitted.'
    }
  }

  return null
}

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

    const validationError = validateShellCommand(command)
    if (validationError !== null) {
      return {
        toolUseId: '',
        toolName: 'run_command',
        input,
        success: false,
        data: null,
        display: validationError,
        durationMs: 0,
        timestamp: new Date().toISOString(),
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
    const { resolve, sep, join: pathJoin } = await import('node:path')

    const SAFE_BASE_DIRS_SHELL: string[] = [
      process.cwd(),
      process.env.HOME ? pathJoin(process.env.HOME, '.blade') : '',
      '/tmp/blade',
      // Allow additional directories via BLADE_ALLOWED_DIRS (comma-separated)
      ...(process.env.BLADE_ALLOWED_DIRS ?? '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .map(d => resolve(d)),
    ].filter(Boolean)

    const rawSearchPath = (input.path as string) || process.cwd()
    const rootPath = resolve(rawSearchPath)
    const allowed = SAFE_BASE_DIRS_SHELL.some(base => rootPath === base || rootPath.startsWith(base + sep))
    if (!allowed) {
      return {
        toolUseId: '',
        toolName: 'search_code',
        input,
        success: false,
        data: null,
        display: `Access denied: path "${rootPath}" is outside allowed directories. Set BLADE_ALLOWED_DIRS to add extra directories.`,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
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
