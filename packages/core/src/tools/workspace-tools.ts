/**
 * Workspace Tools — Persistent project environments for Telegram-based development.
 *
 * These tools let users clone repos, run commands, edit files, and push changes
 * from any chat interface. Workspaces persist between messages.
 */

import { registerTool } from '../tool-registry.js'
import { workspaces, activityEvents } from '@blade/db'
import type { ToolCallResult, ExecutionContext } from '../types.js'
import { logger } from '@blade/shared'

const WORKSPACE_BASE = '/tmp/blade-workspaces'

function ok(toolName: string, input: Record<string, unknown>, data: unknown, display: string): ToolCallResult {
  return { toolUseId: '', toolName, input, success: true, data, display, durationMs: 0, timestamp: new Date().toISOString() }
}

function fail(toolName: string, input: Record<string, unknown>, message: string): ToolCallResult {
  return { toolUseId: '', toolName, input, success: false, data: null, display: message, durationMs: 0, timestamp: new Date().toISOString() }
}

async function exec(command: string, cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const { execFileSync } = await import('node:child_process')
  try {
    const stdout = execFileSync('/bin/sh', ['-c', command], {
      cwd,
      encoding: 'utf-8',
      timeout: 120_000,
      maxBuffer: 2 * 1024 * 1024,
    })
    return { stdout: stdout.trim(), stderr: '', exitCode: 0 }
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number }
    return {
      stdout: (e.stdout ?? '').toString().trim(),
      stderr: (e.stderr ?? '').toString().trim(),
      exitCode: e.status ?? 1,
    }
  }
}

// ============================================================
// OPEN PROJECT — Clone or reuse a workspace
// ============================================================

registerTool(
  {
    name: 'open_project',
    description: 'Open a GitHub project for development. Clones the repo if not already cloned, or reuses an existing workspace. Sets it as the active project for this conversation. Use this before running commands or editing files.',
    input_schema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'GitHub repo in owner/name format (e.g., "drleadflow/Ceolandingpages") or full URL' },
        branch: { type: 'string', description: 'Branch to checkout (default: main)' },
      },
      required: ['repo'],
    },
    category: 'system',
  },
  async (input, context) => {
    const { mkdirSync, existsSync } = await import('node:fs')
    const { join } = await import('node:path')

    let repoInput = input.repo as string
    const branch = (input.branch as string) ?? 'main'

    // Normalize repo input
    if (repoInput.includes('github.com')) {
      const match = repoInput.match(/github\.com\/([^/]+\/[^/.]+)/)
      if (match) repoInput = match[1]
    }
    const repoUrl = `https://github.com/${repoInput}.git`
    const repoName = repoInput.split('/').pop() ?? repoInput

    // Check for existing workspace
    const chatId = context.conversationId
    const existing = workspaces.findByRepo(repoUrl)

    if (existing && existing.status === 'ready') {
      // Reuse existing workspace — pull latest
      try {
        await exec(`git fetch origin && git checkout ${branch} && git pull origin ${branch}`, existing.localPath)
        workspaces.setActive(chatId, existing.id)
        workspaces.recordCommand(existing.id, `open_project (reuse) → ${branch}`)

        return ok('open_project', input, { workspaceId: existing.id, path: existing.localPath, reused: true },
          `Reopened ${repoName} (${branch}). Pulled latest changes. Workspace is ready — run commands, edit files, or ask me to code something.`)
      } catch {
        // Pull failed — re-clone
        logger.warn('Workspace', `Pull failed for ${existing.id}, re-cloning`)
      }
    }

    // Clone fresh
    mkdirSync(WORKSPACE_BASE, { recursive: true })
    const localPath = join(WORKSPACE_BASE, `${repoName}-${Date.now()}`)

    const { id } = workspaces.create({
      name: repoName,
      repoUrl,
      branch,
      localPath,
      ownerChatId: chatId,
    })

    try {
      const githubToken = process.env.GITHUB_TOKEN
      const cloneUrl = githubToken
        ? `https://${githubToken}@github.com/${repoInput}.git`
        : repoUrl

      const cloneResult = await exec(`git clone --depth 50 -b ${branch} ${cloneUrl} ${localPath}`, WORKSPACE_BASE)
      if (cloneResult.exitCode !== 0) {
        workspaces.updateStatus(id, 'error', cloneResult.stderr)
        return fail('open_project', input, `Clone failed: ${cloneResult.stderr.slice(0, 500)}`)
      }

      // Set git config for commits
      await exec('git config user.name "Blade Agent" && git config user.email "blade@blade-agent.com"', localPath)

      workspaces.updateStatus(id, 'ready')
      workspaces.setActive(chatId, id)
      workspaces.recordCommand(id, `open_project (clone) → ${branch}`)

      // List top-level files for orientation
      const lsResult = await exec('ls -la', localPath)
      const fileCount = await exec('find . -type f -not -path "*/node_modules/*" -not -path "*/.git/*" | wc -l', localPath)

      activityEvents.emit({
        eventType: 'workspace.opened',
        actorType: 'system',
        actorId: 'workspace',
        summary: `Workspace opened: ${repoName} (${branch})`,
        targetType: 'workspace',
        targetId: id,
        conversationId: context.conversationId,
      })

      return ok('open_project', input, { workspaceId: id, path: localPath },
        `Cloned ${repoName} (${branch}). ${fileCount.stdout.trim()} files.\n\n${lsResult.stdout}\n\nWorkspace is ready. You can:\n- "Run npm install"\n- "Show me src/App.tsx"\n- "Fix the login page"\n- "Push and open a PR"`)
    } catch (err) {
      workspaces.updateStatus(id, 'error', err instanceof Error ? err.message : String(err))
      return fail('open_project', input, `Failed to open project: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
)

// ============================================================
// RUN IN PROJECT — Execute command in active workspace
// ============================================================

registerTool(
  {
    name: 'run_in_project',
    description: 'Run a shell command in the active project workspace. Use for: npm install, npm test, npm run build, git status, etc. The command runs in the cloned repo directory.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
      },
      required: ['command'],
    },
    category: 'system',
  },
  async (input, context) => {
    const command = input.command as string
    const chatId = context.conversationId

    // Get active workspace
    const workspaceId = workspaces.getActive(chatId)
    if (!workspaceId) {
      return fail('run_in_project', input, 'No active project. Use open_project first to clone a repo.')
    }

    const ws = workspaces.get(workspaceId)
    if (!ws || ws.status !== 'ready') {
      return fail('run_in_project', input, 'Workspace is not ready. Try opening the project again.')
    }

    // Safety: block destructive commands
    const BLOCKED = ['rm -rf /', 'rm -rf ~', 'sudo ', 'mkfs', 'dd if=', '> /dev/', 'chmod 777 /']
    const lower = command.toLowerCase()
    for (const pattern of BLOCKED) {
      if (lower.includes(pattern)) {
        return fail('run_in_project', input, `Command blocked: contains dangerous pattern "${pattern}"`)
      }
    }

    const result = await exec(command, ws.localPath)
    workspaces.recordCommand(workspaceId, command)

    const output = [result.stdout, result.stderr].filter(Boolean).join('\n')
    const truncated = output.length > 3000 ? output.slice(0, 3000) + '\n... (truncated)' : output

    return ok('run_in_project', input,
      { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr },
      result.exitCode === 0
        ? truncated || '(command completed with no output)'
        : `Command failed (exit ${result.exitCode}):\n${truncated}`)
  }
)

// ============================================================
// READ PROJECT FILE
// ============================================================

registerTool(
  {
    name: 'read_project_file',
    description: 'Read a file from the active project workspace.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to project root' },
      },
      required: ['path'],
    },
    category: 'system',
  },
  async (input, context) => {
    const { readFileSync } = await import('node:fs')
    const { join, resolve } = await import('node:path')

    const filePath = input.path as string
    const chatId = context.conversationId

    const workspaceId = workspaces.getActive(chatId)
    if (!workspaceId) return fail('read_project_file', input, 'No active project. Use open_project first.')

    const ws = workspaces.get(workspaceId)
    if (!ws) return fail('read_project_file', input, 'Workspace not found.')

    // Path traversal protection
    const resolved = resolve(ws.localPath, filePath)
    if (!resolved.startsWith(resolve(ws.localPath))) {
      return fail('read_project_file', input, 'Path traversal blocked.')
    }

    try {
      const content = readFileSync(resolved, 'utf-8')
      const truncated = content.length > 4000 ? content.slice(0, 4000) + '\n... (truncated, full file is ' + content.length + ' chars)' : content
      return ok('read_project_file', input, content, truncated)
    } catch (err) {
      return fail('read_project_file', input, `Failed to read file: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
)

// ============================================================
// WRITE PROJECT FILE
// ============================================================

registerTool(
  {
    name: 'write_project_file',
    description: 'Write or create a file in the active project workspace.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to project root' },
        content: { type: 'string', description: 'Full file content to write' },
      },
      required: ['path', 'content'],
    },
    category: 'system',
  },
  async (input, context) => {
    const { writeFileSync, mkdirSync } = await import('node:fs')
    const { join, resolve, dirname } = await import('node:path')

    const filePath = input.path as string
    const content = input.content as string
    const chatId = context.conversationId

    const workspaceId = workspaces.getActive(chatId)
    if (!workspaceId) return fail('write_project_file', input, 'No active project. Use open_project first.')

    const ws = workspaces.get(workspaceId)
    if (!ws) return fail('write_project_file', input, 'Workspace not found.')

    const resolved = resolve(ws.localPath, filePath)
    if (!resolved.startsWith(resolve(ws.localPath))) {
      return fail('write_project_file', input, 'Path traversal blocked.')
    }

    try {
      mkdirSync(dirname(resolved), { recursive: true })
      writeFileSync(resolved, content, 'utf-8')
      return ok('write_project_file', input, { path: filePath, bytes: content.length },
        `Wrote ${content.length} chars to ${filePath}`)
    } catch (err) {
      return fail('write_project_file', input, `Failed to write file: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
)

// ============================================================
// PUSH AND PR — Commit, push, and open a pull request
// ============================================================

registerTool(
  {
    name: 'push_and_pr',
    description: 'Commit all changes in the active project, push to a new branch, and open a pull request on GitHub. Use after making code changes.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'PR title' },
        description: { type: 'string', description: 'PR description (what changed and why)' },
        branch_name: { type: 'string', description: 'Branch name (auto-generated if not provided)' },
      },
      required: ['title'],
    },
    category: 'system',
  },
  async (input, context) => {
    const chatId = context.conversationId
    const title = input.title as string
    const description = (input.description as string) ?? ''
    const branchName = (input.branch_name as string) ?? `blade/${Date.now()}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}`

    const workspaceId = workspaces.getActive(chatId)
    if (!workspaceId) return fail('push_and_pr', input, 'No active project. Use open_project first.')

    const ws = workspaces.get(workspaceId)
    if (!ws) return fail('push_and_pr', input, 'Workspace not found.')

    const githubToken = process.env.GITHUB_TOKEN
    if (!githubToken) return fail('push_and_pr', input, 'GITHUB_TOKEN not configured.')

    const cwd = ws.localPath

    try {
      // Check for changes
      const status = await exec('git status --porcelain', cwd)
      if (!status.stdout.trim()) {
        return fail('push_and_pr', input, 'No changes to commit. Make some edits first.')
      }

      // Create branch, add, commit
      await exec(`git checkout -b ${branchName}`, cwd)
      await exec('git add -A', cwd)
      const commitResult = await exec(`git commit -m "${title.replace(/"/g, '\\"')}"`, cwd)
      if (commitResult.exitCode !== 0) {
        return fail('push_and_pr', input, `Commit failed: ${commitResult.stderr}`)
      }

      // Push with token
      const repoMatch = ws.repoUrl.match(/github\.com\/(.+?)(?:\.git)?$/)
      if (!repoMatch) return fail('push_and_pr', input, `Cannot parse repo URL: ${ws.repoUrl}`)
      const repoPath = repoMatch[1]

      const pushUrl = `https://${githubToken}@github.com/${repoPath}.git`
      await exec(`git remote set-url origin ${pushUrl}`, cwd)
      const pushResult = await exec(`git push -u origin ${branchName}`, cwd)
      // Reset remote to non-token URL
      await exec(`git remote set-url origin ${ws.repoUrl}`, cwd)

      if (pushResult.exitCode !== 0) {
        return fail('push_and_pr', input, `Push failed: ${pushResult.stderr.slice(0, 500)}`)
      }

      // Create PR via GitHub API
      const [owner, repo] = repoPath.split('/')
      const prBody = `${description}\n\n---\n_Shipped from Telegram via Blade Agent_`

      const prRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
        method: 'POST',
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: `[Blade] ${title}`,
          body: prBody,
          head: branchName,
          base: ws.branch,
        }),
      })

      if (!prRes.ok) {
        const errText = await prRes.text()
        return fail('push_and_pr', input, `PR creation failed (${prRes.status}): ${errText.slice(0, 300)}`)
      }

      const prData = await prRes.json() as { html_url: string; number: number }

      workspaces.recordCommit(workspaceId)
      workspaces.recordPr(workspaceId)
      workspaces.recordCommand(workspaceId, `push_and_pr → ${prData.html_url}`)

      activityEvents.emit({
        eventType: 'workspace.pr_created',
        actorType: 'system',
        actorId: 'workspace',
        summary: `PR opened: ${title} → ${prData.html_url}`,
        targetType: 'workspace',
        targetId: workspaceId,
        conversationId: context.conversationId,
      })

      // Switch back to main branch for next edits
      await exec(`git checkout ${ws.branch}`, cwd)

      return ok('push_and_pr', input, { prUrl: prData.html_url, prNumber: prData.number, branch: branchName },
        `PR opened: ${prData.html_url}\n\nBranch: ${branchName}\nChanges pushed and ready for review.`)
    } catch (err) {
      return fail('push_and_pr', input, `Failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
)

// ============================================================
// LIST PROJECTS — Show all workspaces
// ============================================================

registerTool(
  {
    name: 'list_projects',
    description: 'List all open project workspaces. Shows which repos are cloned and ready for development.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
    category: 'system',
  },
  async (input, context) => {
    const chatId = context.conversationId
    const all = workspaces.list()
    const activeId = workspaces.getActive(chatId)

    if (all.length === 0) {
      return ok('list_projects', input, [], 'No project workspaces open. Use open_project to clone a repo.')
    }

    const summary = all.map(ws => {
      const active = ws.id === activeId ? ' (ACTIVE)' : ''
      return `${ws.name}${active} — ${ws.status} | ${ws.branch} | ${ws.totalCommands} commands | ${ws.repoUrl}`
    }).join('\n')

    return ok('list_projects', input, all, `${all.length} workspace(s):\n${summary}`)
  }
)

logger.debug('Tools', 'Workspace tools registered (open_project, run_in_project, read/write files, push_and_pr, list_projects)')
