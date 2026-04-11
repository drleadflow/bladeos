import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, readdirSync, statSync, rmSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import {
  cloneRepo,
  createBranch,
  commitAndPush,
  commitIncremental,
  createPullRequest,
  commentOnPR,
  parseRepoUrl,
  isDockerAvailable,
  createContainer,
  startContainer,
  execInContainer,
  stopContainer,
  removeContainer,
} from '@blade/docker-runner'
import { jobs, jobLogs, workerSessions, jobEvals } from '@blade/db'
import { logger } from '@blade/shared'
import { runAgentLoop } from '../agent-loop.js'
import { registerTool, getAllToolDefinitions, createToolScope, registerScopedTool, getScopedToolDefinitions, destroyToolScope } from '../tool-registry.js'
import { validateShellCommand } from '../tools/shell-tools.js'
import type {
  ToolDefinition,
  ToolHandler,
  ToolCallResult,
  ExecutionContext,
  AgentMessage,
  AgentLoopResult,
} from '../types.js'

// ============================================================
// Helpers
// ============================================================

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

function updateStatus(
  jobId: string,
  status: string,
  message: string,
  extra?: Record<string, unknown>,
  onStatus?: (status: string, message: string) => void,
): void {
  jobs.updateStatus(jobId, status, extra)
  jobLogs.add(jobId, 'info', message)
  syncWorkerSession(jobId, status, message, extra)
  onStatus?.(status, message)
  logger.info('Pipeline', `[${jobId}] ${status}: ${message}`)
}

function mapJobStatusToWorkerStatus(status: string): string {
  if (status === 'queued') return 'queued'
  if (['cloning', 'branching', 'container_starting'].includes(status)) return 'booting'
  if (['coding', 'testing', 'pr_creating'].includes(status)) return 'active'
  if (status === 'completed') return 'completed'
  if (status === 'stopped') return 'stopped'
  if (status === 'failed') return 'failed'
  return 'active'
}

function syncWorkerSession(
  jobId: string,
  status: string,
  message: string,
  extra?: Record<string, unknown>,
): void {
  const runtime =
    typeof extra?.containerName === 'string'
      ? 'docker'
      : typeof extra?.runtime === 'string'
        ? String(extra.runtime)
        : undefined

  workerSessions.update(jobId, {
    status: mapJobStatusToWorkerStatus(status),
    runtime,
    containerName:
      typeof extra?.containerName === 'string'
        ? String(extra.containerName)
        : undefined,
    latestSummary: message,
    lastSeenAt: new Date().toISOString(),
    completedAt:
      status === 'completed' || status === 'failed' || status === 'stopped'
        ? new Date().toISOString()
        : undefined,
  })
}

class WorkerStopRequestedError extends Error {
  constructor(message = 'Stopped by operator') {
    super(message)
    this.name = 'WorkerStopRequestedError'
  }
}

function isStopRequested(jobId: string): boolean {
  const session = workerSessions.get(jobId)
  if (!session?.metadataJson) return false

  try {
    const metadata = JSON.parse(session.metadataJson) as { control?: { requestedAction?: string } }
    return metadata.control?.requestedAction === 'stop'
  } catch {
    return false
  }
}

function throwIfStopRequested(jobId: string, onStatus?: (status: string, message: string) => void): void {
  if (!isStopRequested(jobId)) return

  workerSessions.clearRequestedAction(jobId)
  updateStatus(jobId, 'stopped', 'Stopped by operator', {
    error: 'Stopped by operator',
    completedAt: new Date().toISOString(),
  }, onStatus)
  throw new WorkerStopRequestedError()
}

function runLocal(cmd: string, cwd: string): { stdout: string; stderr: string; exitCode: number } {
  const validationError = validateShellCommand(cmd)
  if (validationError !== null) {
    return { stdout: '', stderr: validationError, exitCode: 1 }
  }
  try {
    const stdout = execFileSync('/bin/sh', ['-c', cmd], { cwd, encoding: 'utf-8', timeout: 120_000, stdio: ['pipe', 'pipe', 'pipe'] }).trim()
    return { stdout, stderr: '', exitCode: 0 }
  } catch (err: unknown) {
    const execErr = err as { stdout?: string; stderr?: string; status?: number }
    return {
      stdout: (execErr.stdout ?? '').toString().trim(),
      stderr: (execErr.stderr ?? '').toString().trim(),
      exitCode: execErr.status ?? 1,
    }
  }
}

interface RepoDetection {
  testCommand: string
  installCommand: string | null
  language: 'node' | 'python' | 'go' | 'rust' | 'ruby' | 'elixir' | 'java' | 'unknown'
  packageManager: string | null
}

function detectRepo(repoDir: string): RepoDetection {
  const exists = (file: string): boolean => {
    try { statSync(join(repoDir, file)); return true } catch { return false }
  }
  const readJson = (file: string): Record<string, unknown> | null => {
    try { return JSON.parse(readFileSync(join(repoDir, file), 'utf-8')) } catch { return null }
  }

  // Node.js — detect package manager
  const pkg = readJson('package.json') as { scripts?: Record<string, string> } | null
  if (pkg) {
    const hasTest = pkg.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1'
    let pm: 'pnpm' | 'yarn' | 'bun' | 'npm' = 'npm'
    if (exists('pnpm-lock.yaml')) pm = 'pnpm'
    else if (exists('yarn.lock')) pm = 'yarn'
    else if (exists('bun.lockb')) pm = 'bun'

    return {
      testCommand: hasTest ? `${pm} test` : `${pm} test`,
      installCommand: `${pm} install`,
      language: 'node',
      packageManager: pm,
    }
  }

  // Python
  if (exists('pyproject.toml') || exists('setup.py') || exists('setup.cfg')) {
    const hasRequirements = exists('requirements.txt')
    const hasPipfile = exists('Pipfile')
    const hasPoetry = exists('poetry.lock')
    let install: string | null = null
    let test = 'python -m pytest'

    if (hasPoetry) {
      install = 'poetry install'
      test = 'poetry run pytest'
    } else if (hasPipfile) {
      install = 'pipenv install --dev'
      test = 'pipenv run pytest'
    } else if (hasRequirements) {
      install = 'pip install -r requirements.txt'
    }

    // Check for tox
    if (exists('tox.ini')) test = 'tox'
    // Check for Makefile with test target
    if (exists('Makefile')) {
      try {
        const makefile = readFileSync(join(repoDir, 'Makefile'), 'utf-8')
        if (makefile.includes('test:')) test = 'make test'
      } catch { /* ignore */ }
    }

    return { testCommand: test, installCommand: install, language: 'python', packageManager: null }
  }

  // Go
  if (exists('go.mod')) {
    return {
      testCommand: 'go test ./...',
      installCommand: 'go mod download',
      language: 'go',
      packageManager: null,
    }
  }

  // Rust
  if (exists('Cargo.toml')) {
    return {
      testCommand: 'cargo test',
      installCommand: 'cargo build',
      language: 'rust',
      packageManager: 'cargo',
    }
  }

  // Ruby
  if (exists('Gemfile')) {
    const hasRspec = exists('.rspec') || exists('spec')
    return {
      testCommand: hasRspec ? 'bundle exec rspec' : 'bundle exec rake test',
      installCommand: 'bundle install',
      language: 'ruby',
      packageManager: 'bundler',
    }
  }

  // Elixir
  if (exists('mix.exs')) {
    return {
      testCommand: 'mix test',
      installCommand: 'mix deps.get',
      language: 'elixir',
      packageManager: 'mix',
    }
  }

  // Java / Maven / Gradle
  if (exists('pom.xml')) {
    return { testCommand: 'mvn test', installCommand: 'mvn install -DskipTests', language: 'java', packageManager: 'maven' }
  }
  if (exists('build.gradle') || exists('build.gradle.kts')) {
    return { testCommand: './gradlew test', installCommand: './gradlew build -x test', language: 'java', packageManager: 'gradle' }
  }

  // Makefile fallback
  if (exists('Makefile')) {
    try {
      const makefile = readFileSync(join(repoDir, 'Makefile'), 'utf-8')
      if (makefile.includes('test:')) {
        return { testCommand: 'make test', installCommand: null, language: 'unknown', packageManager: null }
      }
    } catch { /* ignore */ }
  }

  return { testCommand: 'npm test', installCommand: null, language: 'unknown', packageManager: null }
}

/** Smart truncation that preserves error lines from test output */
function smartTruncateTestOutput(output: string, maxLength: number = 20_000): string {
  if (output.length <= maxLength) return output

  // Find error-relevant lines (failures, assertions, stack traces)
  const lines = output.split('\n')
  const errorPatterns = /(?:FAIL|ERROR|error|assert|expect|panic|traceback|exception|✗|✘|×|failed)/i
  const errorLines: string[] = []
  const normalLines: string[] = []

  for (const line of lines) {
    if (errorPatterns.test(line)) {
      errorLines.push(line)
    } else {
      normalLines.push(line)
    }
  }

  // Always include the last 50 lines (summary area) + all error lines
  const tail = lines.slice(-50).join('\n')
  const errors = errorLines.join('\n')

  const budget = maxLength - tail.length - errors.length - 200
  const head = budget > 0 ? lines.slice(0, Math.min(20, lines.length)).join('\n') : ''

  return [
    head,
    `\n... [${lines.length - 70} lines truncated — showing errors and summary] ...\n`,
    errors,
    '\n--- Test Summary ---\n',
    tail,
  ].join('\n').slice(0, maxLength)
}

// ============================================================
// Tool registration for coding tools
// ============================================================

interface ExecAdapter {
  exec(command: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }>
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  listFiles(path: string): Promise<string[]>
}

function safePath(base: string, relative_path: string): string {
  const resolved = resolve(base, relative_path)
  const normalBase = resolve(base)
  if (!resolved.startsWith(normalBase + '/') && resolved !== normalBase) {
    throw new Error(`Path traversal blocked: ${relative_path}`)
  }
  return resolved
}

function createLocalAdapter(workDir: string): ExecAdapter {
  return {
    async exec(command: string[]) {
      const cmd = command.join(' ')
      return runLocal(cmd, workDir)
    },
    async readFile(filePath: string) {
      const resolved = safePath(workDir, filePath)
      return readFileSync(resolved, 'utf-8')
    },
    async writeFile(filePath: string, content: string) {
      const resolved = safePath(workDir, filePath)
      writeFileSync(resolved, content, 'utf-8')
    },
    async listFiles(dirPath: string) {
      const resolved = safePath(workDir, dirPath || '.')
      const results: string[] = []
      const walk = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (entry.name === 'node_modules' || entry.name === '.git') continue
          const full = join(dir, entry.name)
          if (entry.isDirectory()) {
            walk(full)
          } else {
            results.push(relative(workDir, full))
          }
        }
      }
      walk(resolved)
      return results
    },
  }
}

function createDockerAdapter(container: Awaited<ReturnType<typeof createContainer>>): ExecAdapter {
  return {
    async exec(command: string[]) {
      return execInContainer(container, command)
    },
    async readFile(filePath: string) {
      const result = await execInContainer(container, ['cat', filePath])
      if (result.exitCode !== 0) {
        throw new Error(`Failed to read ${filePath}: ${result.stderr}`)
      }
      return result.stdout
    },
    async writeFile(filePath: string, content: string) {
      const escaped = content.replace(/'/g, "'\\''")
      const result = await execInContainer(container, ['sh', '-c', `cat > '${filePath}' << 'BLADE_EOF'\n${escaped}\nBLADE_EOF`])
      if (result.exitCode !== 0) {
        throw new Error(`Failed to write ${filePath}: ${result.stderr}`)
      }
    },
    async listFiles(dirPath: string) {
      const target = dirPath || '.'
      const result = await execInContainer(container, ['find', target, '-type', 'f', '-not', '-path', '*/node_modules/*', '-not', '-path', '*/.git/*'])
      if (result.exitCode !== 0) {
        return []
      }
      return result.stdout.split('\n').filter(Boolean)
    },
  }
}

function registerCodingTools(adapter: ExecAdapter, scopeId?: string): void {
  const register = scopeId
    ? (def: ToolDefinition, handler: ToolHandler) => registerScopedTool(scopeId, def, handler)
    : registerTool

  const readFileDef: ToolDefinition = {
    name: 'read_file',
    description: 'Read the contents of a file at the given path',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to the repository root' },
      },
      required: ['path'],
    },
    category: 'coding',
  }

  const writeFileDef: ToolDefinition = {
    name: 'write_file',
    description: 'Write content to a file at the given path. Creates the file if it does not exist.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to the repository root' },
        content: { type: 'string', description: 'The full content to write to the file' },
      },
      required: ['path', 'content'],
    },
    category: 'coding',
  }

  const runCommandDef: ToolDefinition = {
    name: 'run_command',
    description: 'Run a shell command in the repository directory',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to execute' },
      },
      required: ['command'],
    },
    category: 'coding',
  }

  const listFilesDef: ToolDefinition = {
    name: 'list_files',
    description: 'List all files in a directory (excluding node_modules and .git)',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path relative to the repository root. Empty string or "." for root.' },
      },
      required: [],
    },
    category: 'coding',
  }

  const searchCodeDef: ToolDefinition = {
    name: 'search_code',
    description: 'Search for a pattern in the codebase using grep',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'The search pattern (regex)' },
        path: { type: 'string', description: 'Optional subdirectory to limit the search' },
      },
      required: ['pattern'],
    },
    category: 'coding',
  }

  register(readFileDef, async (input) => {
    const filePath = input.path as string
    try {
      const content = await adapter.readFile(filePath)
      return {
        toolUseId: '',
        toolName: 'read_file',
        input,
        success: true,
        data: content,
        display: content,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    } catch (err) {
      return {
        toolUseId: '',
        toolName: 'read_file',
        input,
        success: false,
        data: null,
        display: `Error reading file: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    }
  })

  register(writeFileDef, async (input) => {
    const filePath = input.path as string
    const content = input.content as string
    try {
      await adapter.writeFile(filePath, content)
      return {
        toolUseId: '',
        toolName: 'write_file',
        input: { path: filePath, content: `[${content.length} chars]` },
        success: true,
        data: { path: filePath, bytesWritten: content.length },
        display: `Wrote ${content.length} chars to ${filePath}`,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    } catch (err) {
      return {
        toolUseId: '',
        toolName: 'write_file',
        input,
        success: false,
        data: null,
        display: `Error writing file: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    }
  })

  register(runCommandDef, async (input) => {
    const command = input.command as string
    try {
      const result = await adapter.exec(['sh', '-c', command])
      const output = [result.stdout, result.stderr].filter(Boolean).join('\n')
      return {
        toolUseId: '',
        toolName: 'run_command',
        input,
        success: result.exitCode === 0,
        data: { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr },
        display: output || `(exit code ${result.exitCode})`,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    } catch (err) {
      return {
        toolUseId: '',
        toolName: 'run_command',
        input,
        success: false,
        data: null,
        display: `Error running command: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    }
  })

  register(listFilesDef, async (input) => {
    const dirPath = (input.path as string) ?? '.'
    try {
      const files = await adapter.listFiles(dirPath)
      return {
        toolUseId: '',
        toolName: 'list_files',
        input,
        success: true,
        data: files,
        display: files.join('\n'),
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    } catch (err) {
      return {
        toolUseId: '',
        toolName: 'list_files',
        input,
        success: false,
        data: null,
        display: `Error listing files: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    }
  })

  register(searchCodeDef, async (input) => {
    const pattern = input.pattern as string
    const searchPath = (input.path as string) ?? '.'
    try {
      const result = await adapter.exec(['grep', '-rn', '--include=*.ts', '--include=*.js', '--include=*.tsx', '--include=*.jsx', '--include=*.json', '--include=*.py', '--include=*.go', pattern, searchPath])
      return {
        toolUseId: '',
        toolName: 'search_code',
        input,
        success: true,
        data: result.stdout,
        display: result.stdout || 'No matches found',
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    } catch {
      return {
        toolUseId: '',
        toolName: 'search_code',
        input,
        success: true,
        data: '',
        display: 'No matches found',
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    }
  })
}

// ============================================================
// System prompt builder
// ============================================================

function buildSystemPrompt(title: string, description: string): string {
  return `You are Blade, an expert coding agent. You are working on a task inside a repository.

## Your Task
**Title:** ${title}
**Description:** ${description}

## Instructions
1. First, read the existing code to understand the project structure, conventions, and patterns.
   - Use list_files to explore the directory structure.
   - Use read_file to examine key files like package.json, README, config files, and source files related to the task.
2. Plan your approach before writing any code.
3. Write tests first when appropriate (TDD approach).
4. Follow the existing code conventions (naming, formatting, patterns).
5. Implement the solution in small, focused steps.
6. Run the existing tests to make sure nothing is broken.
7. When done, provide a summary of what you changed.

## Rules
- Do NOT modify files unrelated to the task.
- Do NOT introduce new dependencies unless absolutely necessary.
- Keep changes minimal and focused.
- Write clean, readable code with proper error handling.
- If tests exist, make sure they pass after your changes.`
}

// ============================================================
// PR body & comment builders
// ============================================================

function buildPRBody(
  repoDir: string,
  title: string,
  result: AgentLoopResult,
  testsPassed: boolean,
): string {
  // Get diff stat for the changes section
  let diffStat = ''
  try {
    const statResult = runLocal('git diff --stat HEAD~1', repoDir)
    if (statResult.exitCode === 0 && statResult.stdout) {
      diffStat = statResult.stdout
    }
  } catch {
    // Fall back to full diff stat from initial commit
    try {
      const statResult = runLocal('git diff --stat', repoDir)
      if (statResult.exitCode === 0) {
        diffStat = statResult.stdout
      }
    } catch { /* ignore */ }
  }

  const summary = result.finalResponse || 'No summary available.'

  const sections = [
    '## Summary',
    summary,
    '',
    '## Changes',
    diffStat ? `\`\`\`\n${diffStat}\n\`\`\`` : '_No diff stat available._',
    '',
    '## Agent Activity',
    `- Tool calls: ${result.totalToolCalls}`,
    `- Iterations: ${result.turns.length}`,
    `- Tests: ${testsPassed ? 'passed' : 'failed'}`,
    `- Cost: $${result.totalCost.toFixed(4)}`,
    '',
    '---',
    '_Generated by [Blade Super Agent](https://github.com/blade-agent/blade-super-agent)_',
  ]

  return sections.join('\n')
}

function buildAgentLogComment(
  jobId: string,
  result: AgentLoopResult,
  fixResults: AgentLoopResult[],
  testOutput: string,
  testsPassed: boolean,
): string {
  const lines: string[] = [
    '## Agent Activity Log',
    '',
    `**Job ID:** \`${jobId}\``,
    '',
    '### Tool Calls',
    '',
  ]

  // Main coding loop tool calls
  for (const turn of result.turns) {
    if (turn.toolCalls) {
      for (const tc of turn.toolCalls) {
        const icon = tc.success ? '  ' : '  '
        lines.push(`${icon} \`${tc.toolName}\` — ${tc.success ? 'success' : 'failed'}`)
      }
    }
  }

  // Fix cycle tool calls
  if (fixResults.length > 0) {
    lines.push('', '### Fix Cycles', '')
    for (let i = 0; i < fixResults.length; i++) {
      lines.push(`**Cycle ${i + 1}:**`)
      for (const turn of fixResults[i].turns) {
        if (turn.toolCalls) {
          for (const tc of turn.toolCalls) {
            const icon = tc.success ? '  ' : '  '
            lines.push(`${icon} \`${tc.toolName}\` — ${tc.success ? 'success' : 'failed'}`)
          }
        }
      }
    }
  }

  // Test output
  lines.push('', '### Test Output', '')
  lines.push(`**Result:** ${testsPassed ? 'Passed' : 'Failed'}`)
  if (testOutput) {
    const truncated = testOutput.length > 3000 ? testOutput.slice(-3000) : testOutput
    lines.push('', '<details><summary>Test output</summary>', '', '```', truncated, '```', '', '</details>')
  }

  lines.push('', '---', '_Generated by [Blade Super Agent](https://github.com/blade-agent/blade-super-agent)_')

  return lines.join('\n')
}

// ============================================================
// Main pipeline
// ============================================================

export async function runCodingPipeline(params: {
  jobId: string
  title: string
  description: string
  repoUrl: string
  baseBranch: string
  agentModel: string
  githubToken: string
  onStatus?: (status: string, message: string) => void
}): Promise<{ prUrl: string; prNumber: number; totalCost: number }> {
  const {
    jobId,
    title,
    description,
    repoUrl,
    baseBranch,
    agentModel,
    githubToken,
    onStatus,
  } = params

  const branchName = `blade/${jobId}-${slugify(title)}`
  const pipelineConversationId = `job-${jobId}`
  let repoDir: string | undefined
  let container: Awaited<ReturnType<typeof createContainer>> | undefined
  let useDocker = false
  let toolScopeId: string | undefined
  const pipelineStartTime = performance.now()
  let codingStartTime = 0
  let codingDurationMs = 0
  let testingStartTime = 0
  let testingDurationMs = 0

  try {
    // ── Step 1: Clone ──────────────────────────────────────────
    updateStatus(jobId, 'cloning', `Cloning ${repoUrl}`, undefined, onStatus)
    throwIfStopRequested(jobId, onStatus)
    repoDir = cloneRepo(repoUrl)
    jobLogs.add(jobId, 'info', `Cloned to ${repoDir}`)
    throwIfStopRequested(jobId, onStatus)

    // ── Step 2: Branch ─────────────────────────────────────────
    updateStatus(jobId, 'branching', `Creating branch ${branchName}`, { branch: branchName }, onStatus)
    throwIfStopRequested(jobId, onStatus)
    createBranch(repoDir, branchName)
    throwIfStopRequested(jobId, onStatus)

    // ── Step 3: Container / Local fallback ─────────────────────
    updateStatus(jobId, 'container_starting', 'Setting up execution environment', undefined, onStatus)
    throwIfStopRequested(jobId, onStatus)

    const dockerAvailable = await isDockerAvailable()
    let adapter: ExecAdapter

    if (dockerAvailable) {
      useDocker = true
      const containerName = `blade-${jobId}`
      container = await createContainer(containerName, repoDir)
      await startContainer(container)
      jobs.updateStatus(jobId, 'container_starting', { containerName })
      workerSessions.update(jobId, {
        runtime: 'docker',
        containerName,
        conversationId: pipelineConversationId,
        lastSeenAt: new Date().toISOString(),
        latestSummary: `Docker sandbox ready: ${containerName}`,
      })
      jobLogs.add(jobId, 'info', `Docker container started: ${containerName}`)
      adapter = createDockerAdapter(container)
    } else {
      jobLogs.add(jobId, 'info', 'Docker not available, using local execution')
      workerSessions.update(jobId, {
        runtime: 'local',
        conversationId: pipelineConversationId,
        lastSeenAt: new Date().toISOString(),
        latestSummary: 'Worker running locally because Docker is unavailable.',
      })
      adapter = createLocalAdapter(repoDir)
    }
    throwIfStopRequested(jobId, onStatus)

    // ── Step 4: Coding with agent loop ─────────────────────────
    updateStatus(jobId, 'coding', 'Agent is coding the solution', undefined, onStatus)
    throwIfStopRequested(jobId, onStatus)
    codingStartTime = performance.now()

    toolScopeId = createToolScope()
    registerCodingTools(adapter, toolScopeId)

    const systemPrompt = buildSystemPrompt(title, description)
    const tools = getScopedToolDefinitions(toolScopeId)

    const context: ExecutionContext = {
      jobId,
      conversationId: pipelineConversationId,
      workingDir: useDocker ? '/workspace' : repoDir,
      containerName: useDocker ? `blade-${jobId}` : undefined,
      repoUrl,
      branch: branchName,
      userId: 'pipeline',
      modelId: agentModel,
      maxIterations: 25,
      costBudget: 5.0,
      toolScopeId,
    }

    const initialMessage: AgentMessage = {
      role: 'user',
      content: `Please implement the following task:\n\n**${title}**\n\n${description}\n\nStart by exploring the codebase to understand the structure, then implement the solution.`,
    }

    const agentResult = await runAgentLoop({
      systemPrompt,
      messages: [initialMessage],
      tools,
      context,
      maxIterations: 25,
      onToolCall: (result: ToolCallResult) => {
        jobLogs.add(jobId, 'debug', `Tool: ${result.toolName}`, {
          success: result.success,
          durationMs: result.durationMs,
        })
        workerSessions.update(jobId, {
          conversationId: pipelineConversationId,
          status: 'active',
          lastSeenAt: new Date().toISOString(),
          latestSummary: result.success
            ? `Tool completed: ${result.toolName}`
            : `Tool failed: ${result.toolName}`,
        })
        throwIfStopRequested(jobId, onStatus)

        // Incremental commit after file writes
        if (result.success && result.toolName === 'write_file' && repoDir) {
          try {
            const path = (result.input as Record<string, unknown>).path as string
            commitIncremental(repoDir, `blade: update ${path}`)
          } catch { /* ignore commit failures */ }
        }
      },
    })

    codingDurationMs = Math.round(performance.now() - codingStartTime)
    jobLogs.add(jobId, 'info', `Agent completed: ${agentResult.totalToolCalls} tool calls, $${agentResult.totalCost.toFixed(4)} cost, ${Math.round(codingDurationMs / 1000)}s`)
    throwIfStopRequested(jobId, onStatus)
    jobs.updateStatus(jobId, 'coding', {
      totalCost: agentResult.totalCost,
      totalToolCalls: agentResult.totalToolCalls,
      totalIterations: agentResult.turns.length,
    })

    // ── Step 5: Testing ────────────────────────────────────────
    updateStatus(jobId, 'testing', 'Running tests', undefined, onStatus)
    throwIfStopRequested(jobId, onStatus)

    testingStartTime = performance.now()
    const repoInfo = detectRepo(repoDir)
    const testCommand = repoInfo.testCommand
    jobLogs.add(jobId, 'info', `Detected ${repoInfo.language} repo (${repoInfo.packageManager ?? 'no package manager'}), test: "${testCommand}"`)

    // Install dependencies before running tests
    if (repoInfo.installCommand) {
      updateStatus(jobId, 'testing', `Installing dependencies: ${repoInfo.installCommand}`, undefined, onStatus)
      const installResult = useDocker && container
        ? await execInContainer(container, ['sh', '-c', repoInfo.installCommand])
        : runLocal(repoInfo.installCommand, repoDir)

      if (installResult.exitCode !== 0) {
        jobLogs.add(jobId, 'warn', `Dependency install failed (exit ${installResult.exitCode}): ${installResult.stderr.slice(0, 1000)}`)
      } else {
        jobLogs.add(jobId, 'info', 'Dependencies installed successfully')
      }
      throwIfStopRequested(jobId, onStatus)
    }

    let testsPassed = false
    const maxFixCycles = 3
    const fixResults: AgentLoopResult[] = []
    let lastTestOutput = ''

    for (let cycle = 0; cycle <= maxFixCycles; cycle++) {
      throwIfStopRequested(jobId, onStatus)
      workerSessions.update(jobId, {
        conversationId: pipelineConversationId,
        status: 'active',
        lastSeenAt: new Date().toISOString(),
        latestSummary: cycle === 0
          ? `Running test suite: ${testCommand}`
          : `Re-running tests after fix cycle ${cycle}`,
      })

      const testResult = useDocker && container
        ? await execInContainer(container, ['sh', '-c', testCommand])
        : runLocal(testCommand, repoDir)
      throwIfStopRequested(jobId, onStatus)

      lastTestOutput = [testResult.stdout, testResult.stderr].filter(Boolean).join('\n')

      if (testResult.exitCode === 0) {
        testsPassed = true
        jobLogs.add(jobId, 'info', `Tests passed${cycle > 0 ? ` (after ${cycle} fix cycle(s))` : ''}`)

        // Commit after tests pass
        try {
          commitIncremental(repoDir, 'blade: tests passing')
        } catch { /* ignore */ }

        break
      }

      if (cycle === maxFixCycles) {
        jobLogs.add(jobId, 'warn', `Tests still failing after ${maxFixCycles} fix cycles, proceeding anyway`)
        break
      }

      // Feed test failures back to the agent for a fix attempt
      jobLogs.add(jobId, 'info', `Tests failed (cycle ${cycle + 1}/${maxFixCycles}), asking agent to fix`)
      workerSessions.update(jobId, {
        conversationId: pipelineConversationId,
        status: 'active',
        lastSeenAt: new Date().toISOString(),
        latestSummary: `Tests failed; starting fix cycle ${cycle + 1}`,
      })
      const errorOutput = smartTruncateTestOutput(lastTestOutput, 20_000)

      const fixMessage: AgentMessage = {
        role: 'user',
        content: `The tests are failing. Here is the output:\n\n\`\`\`\n${errorOutput}\n\`\`\`\n\nPlease fix the failing tests. Read the relevant test and source files, identify the issue, and fix it.`,
      }

      const fixResult = await runAgentLoop({
        systemPrompt,
        messages: [fixMessage],
        tools,
        context,
        maxIterations: 10,
        onToolCall: (result: ToolCallResult) => {
          jobLogs.add(jobId, 'debug', `Fix tool: ${result.toolName}`, {
            success: result.success,
          })
          workerSessions.update(jobId, {
            conversationId: pipelineConversationId,
            status: 'active',
            lastSeenAt: new Date().toISOString(),
            latestSummary: result.success
              ? `Fix cycle tool completed: ${result.toolName}`
              : `Fix cycle tool failed: ${result.toolName}`,
          })
          throwIfStopRequested(jobId, onStatus)

          // Incremental commit after fix file writes
          if (result.success && result.toolName === 'write_file' && repoDir) {
            try {
              const path = (result.input as Record<string, unknown>).path as string
              commitIncremental(repoDir, `blade: fix ${path}`)
            } catch { /* ignore commit failures */ }
          }
        },
      })

      fixResults.push(fixResult)
      throwIfStopRequested(jobId, onStatus)

      jobs.updateStatus(jobId, 'testing', {
        totalCost: agentResult.totalCost + fixResult.totalCost,
        totalToolCalls: agentResult.totalToolCalls + fixResult.totalToolCalls,
      })
    }

    // ── Eval: Record structured job metrics ─────────────────────
    testingDurationMs = Math.round(performance.now() - testingStartTime)
    const totalPipelineDurationMs = Math.round(performance.now() - pipelineStartTime)

    // Count changed files and diff stats
    let filesChanged = 0
    let linesAdded = 0
    let linesRemoved = 0
    try {
      const diffResult = runLocal('git diff --numstat HEAD~1 2>/dev/null || git diff --numstat', repoDir)
      if (diffResult.exitCode === 0 && diffResult.stdout) {
        for (const line of diffResult.stdout.split('\n').filter(Boolean)) {
          const [added, removed] = line.split('\t')
          filesChanged++
          linesAdded += parseInt(added, 10) || 0
          linesRemoved += parseInt(removed, 10) || 0
        }
      }
    } catch { /* ignore */ }

    // Calculate total cost including fix cycles
    const totalFixCost = fixResults.reduce((sum, r) => sum + r.totalCost, 0)
    const totalFixToolCalls = fixResults.reduce((sum, r) => sum + r.totalToolCalls, 0)
    const totalFixTokensIn = fixResults.reduce((sum, r) => sum + r.totalInputTokens, 0)
    const totalFixTokensOut = fixResults.reduce((sum, r) => sum + r.totalOutputTokens, 0)

    try {
      jobEvals.record({
        jobId,
        status: testsPassed ? 'passed' : (fixResults.length > 0 ? 'partial' : 'failed'),
        fixCyclesUsed: fixResults.length,
        maxFixCycles,
        filesChanged,
        linesAdded,
        linesRemoved,
        totalCostUsd: agentResult.totalCost + totalFixCost,
        totalInputTokens: agentResult.totalInputTokens + totalFixTokensIn,
        totalOutputTokens: agentResult.totalOutputTokens + totalFixTokensOut,
        totalToolCalls: agentResult.totalToolCalls + totalFixToolCalls,
        totalIterations: agentResult.turns.length + fixResults.reduce((sum, r) => sum + r.turns.length, 0),
        durationMs: totalPipelineDurationMs,
        codingDurationMs,
        testingDurationMs,
        language: repoInfo.language,
        repoUrl,
        agentModel,
        stopReason: agentResult.stopReason,
        details: {
          testOutput: lastTestOutput.slice(0, 2000),
          testCommand,
          packageManager: repoInfo.packageManager,
        },
      })
      jobLogs.add(jobId, 'info', `Eval recorded: ${testsPassed ? 'PASSED' : 'FAILED'} | ${filesChanged} files | ${fixResults.length} fix cycles | $${(agentResult.totalCost + totalFixCost).toFixed(4)}`)
    } catch (evalErr) {
      logger.debug('Pipeline', `Failed to record eval: ${evalErr instanceof Error ? evalErr.message : String(evalErr)}`)
    }

    // ── Step 6: Create PR ──────────────────────────────────────
    updateStatus(jobId, 'pr_creating', 'Committing changes and creating PR', undefined, onStatus)
    throwIfStopRequested(jobId, onStatus)

    const commitMessage = `feat: ${title}\n\nImplemented by Blade Super Agent.\n\n${description}`
    commitAndPush(repoDir, commitMessage, branchName, githubToken)
    throwIfStopRequested(jobId, onStatus)

    const { owner, repo } = parseRepoUrl(repoUrl)
    const prBody = buildPRBody(repoDir, title, agentResult, testsPassed)

    const pr = await createPullRequest({
      owner,
      repo,
      title: `[Blade] ${title}`,
      body: prBody,
      head: branchName,
      base: baseBranch,
      githubToken,
    })
    throwIfStopRequested(jobId, onStatus)

    // Post detailed agent log as a PR comment
    try {
      const logComment = buildAgentLogComment(
        jobId,
        agentResult,
        fixResults,
        lastTestOutput,
        testsPassed,
      )
      await commentOnPR({
        owner,
        repo,
        prNumber: pr.prNumber,
        body: logComment,
        githubToken,
      })
    } catch (commentErr) {
      logger.debug('Pipeline', `Failed to post PR comment: ${commentErr instanceof Error ? commentErr.message : String(commentErr)}`)
    }

    // ── Step 7: Complete ───────────────────────────────────────
    updateStatus(jobId, 'completed', `PR created: ${pr.prUrl}`, {
      prUrl: pr.prUrl,
      prNumber: pr.prNumber,
      completedAt: new Date().toISOString(),
    }, onStatus)

    return {
      prUrl: pr.prUrl,
      prNumber: pr.prNumber,
      totalCost: agentResult.totalCost + totalFixCost,
    }
  } catch (err) {
    if (err instanceof WorkerStopRequestedError) {
      return {
        prUrl: '',
        prNumber: 0,
        totalCost: 0,
      }
    }
    const errorMessage = err instanceof Error ? err.message : String(err)
    updateStatus(jobId, 'failed', errorMessage, { error: errorMessage }, onStatus)
    throw err
  } finally {
    // Cleanup tool scope
    if (toolScopeId) {
      destroyToolScope(toolScopeId)
    }
    if (container && useDocker) {
      try {
        await stopContainer(container)
        await removeContainer(container)
      } catch (cleanupErr) {
        logger.debug('Pipeline', `Cleanup error: ${cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)}`)
      }
    }
    if (repoDir) {
      try {
        rmSync(repoDir, { recursive: true, force: true })
      } catch {
        // Best-effort cleanup
      }
    }
  }
}
