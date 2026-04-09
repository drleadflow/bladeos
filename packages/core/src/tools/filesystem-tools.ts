import { registerTool } from '../tool-registry.js'
import type { ToolCallResult, ExecutionContext } from '../types.js'
import { stringifyError } from './web-search.js'
import nodePath from 'node:path'

// ============================================================
// FILESYSTEM PATH SECURITY
// ============================================================

const SAFE_BASE_DIRS: string[] = [
  process.cwd(),
  process.env.HOME ? nodePath.join(process.env.HOME, '.blade') : '',
  '/tmp/blade',
].filter(Boolean)

function validatePath(inputPath: string): string {
  // Power-user escape hatch
  if (process.env.BLADE_UNSAFE_FS === '1') {
    return nodePath.resolve(inputPath)
  }

  const resolved = nodePath.resolve(inputPath)

  const isAllowed = SAFE_BASE_DIRS.some(base => {
    // Ensure resolved path is within a safe base dir (with trailing sep to prevent partial matches)
    return resolved === base || resolved.startsWith(base + nodePath.sep)
  })

  if (!isAllowed) {
    throw new Error(
      `Path "${resolved}" is outside allowed directories. ` +
      `Allowed bases: ${SAFE_BASE_DIRS.join(', ')}. ` +
      `Set BLADE_UNSAFE_FS=1 to bypass (power users only).`
    )
  }

  return resolved
}

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
    const rawPath = input.path as string

    let path: string
    try {
      path = validatePath(rawPath)
    } catch (err) {
      return {
        toolUseId: '',
        toolName: 'read_file',
        input,
        success: false,
        data: null,
        display: `Access denied: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    }

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

    const rawPath = input.path as string
    const content = input.content as string

    let path: string
    try {
      path = validatePath(rawPath)
    } catch (err) {
      return {
        toolUseId: '',
        toolName: 'write_file',
        input,
        success: false,
        data: null,
        display: `Access denied: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    }

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

    let rootPath: string
    try {
      rootPath = validatePath(input.path as string)
    } catch (err) {
      return {
        toolUseId: '',
        toolName: 'get_file_tree',
        input,
        success: false,
        data: null,
        display: `Access denied: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    }
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

    let rootPath: string
    try {
      rootPath = validatePath((input.path as string) || process.cwd())
    } catch (err) {
      return {
        toolUseId: '',
        toolName: 'list_files',
        input,
        success: false,
        data: null,
        display: `Access denied: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    }

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
