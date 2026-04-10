import { registerTool } from '../tool-registry.js'
import { callModel, resolveModelConfig } from '../model-provider.js'
import type { ToolCallResult, ExecutionContext } from '../types.js'

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Validate that a string looks like a safe owner/repo identifier.
 * Rejects anything that could be used for shell injection.
 */
function validateRepo(repo: string): string {
  if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(repo)) {
    throw new Error(`Invalid repository format: "${repo}". Expected owner/repo (e.g. "octocat/Hello-World")`)
  }
  return repo
}

/**
 * Validate that a string is a numeric issue/PR number.
 */
function validateNumber(num: string): string {
  if (!/^\d+$/.test(num)) {
    throw new Error(`Invalid issue/PR number: "${num}". Expected a numeric value.`)
  }
  return num
}

/**
 * Validate that a path is safe (no shell metacharacters).
 */
function validatePath(path: string): string {
  if (/[;&|`$(){}!<>]/.test(path)) {
    throw new Error(`Invalid path: "${path}". Path contains disallowed characters.`)
  }
  return path
}

function makeResult(
  toolName: string,
  input: Record<string, unknown>,
  success: boolean,
  data: unknown,
  display: string
): ToolCallResult {
  return {
    toolUseId: '',
    toolName,
    input,
    success,
    data,
    display,
    durationMs: 0,
    timestamp: new Date().toISOString(),
  }
}

// ============================================================
// GITHUB LIST ISSUES
// ============================================================

registerTool(
  {
    name: 'github_list_issues',
    description: 'List open issues from a GitHub repository.',
    input_schema: {
      type: 'object',
      properties: {
        repo: {
          type: 'string',
          description: 'GitHub repository in owner/repo format (e.g. "octocat/Hello-World")',
        },
        label: {
          type: 'string',
          description: 'Filter issues by label (optional)',
        },
        limit: {
          type: 'string',
          description: 'Maximum number of issues to return (default: 20)',
          default: '20',
        },
      },
      required: ['repo'],
    },
    category: 'system',
  },
  async (input: Record<string, unknown>, _context: ExecutionContext): Promise<ToolCallResult> => {
    const { execFileSync } = await import('node:child_process')

    const repo = validateRepo(input.repo as string)
    const label = input.label as string | undefined
    const limit = (input.limit as string) ?? '20'

    try {
      const args = ['issue', 'list', '--repo', repo, '--state', 'open', '--limit', limit, '--json', 'number,title,labels,assignees,createdAt']
      if (label) {
        args.push('--label', label)
      }

      const output = execFileSync('gh', args, {
        encoding: 'utf-8',
        timeout: 30_000,
      })

      const issues = JSON.parse(output) as Array<{
        number: number
        title: string
        labels: Array<{ name: string }>
        assignees: Array<{ login: string }>
        createdAt: string
      }>

      if (issues.length === 0) {
        return makeResult('github_list_issues', input, true, issues, `No open issues found in ${repo}.`)
      }

      const display = issues
        .map((issue) => {
          const labels = issue.labels.map((l) => l.name).join(', ')
          const assignees = issue.assignees.map((a) => a.login).join(', ')
          return `#${issue.number} ${issue.title}${labels ? ` [${labels}]` : ''}${assignees ? ` (${assignees})` : ''}`
        })
        .join('\n')

      return makeResult(
        'github_list_issues',
        input,
        true,
        issues,
        `Found ${issues.length} open issues in ${repo}:\n${display}`
      )
    } catch (error) {
      return makeResult('github_list_issues', input, false, null, `Failed to list issues: ${stringifyError(error)}`)
    }
  }
)

// ============================================================
// GITHUB READ ISSUE
// ============================================================

registerTool(
  {
    name: 'github_read_issue',
    description: 'Read a specific GitHub issue including comments.',
    input_schema: {
      type: 'object',
      properties: {
        repo: {
          type: 'string',
          description: 'GitHub repository in owner/repo format',
        },
        number: {
          type: 'string',
          description: 'Issue number',
        },
      },
      required: ['repo', 'number'],
    },
    category: 'system',
  },
  async (input: Record<string, unknown>, _context: ExecutionContext): Promise<ToolCallResult> => {
    const { execFileSync } = await import('node:child_process')

    const repo = validateRepo(input.repo as string)
    const number = validateNumber(input.number as string)

    try {
      const output = execFileSync('gh', ['issue', 'view', number, '--repo', repo, '--json', 'title,body,comments,labels,state'], {
        encoding: 'utf-8',
        timeout: 30_000,
      })

      const issue = JSON.parse(output) as {
        title: string
        body: string
        state: string
        labels: Array<{ name: string }>
        comments: Array<{ author: { login: string }; body: string; createdAt: string }>
      }

      const labels = issue.labels.map((l) => l.name).join(', ')
      const commentsDisplay = issue.comments.length > 0
        ? issue.comments
            .map((c) => `  @${c.author.login} (${c.createdAt}):\n  ${c.body}`)
            .join('\n\n')
        : '  No comments.'

      const display = [
        `#${number} ${issue.title} [${issue.state}]`,
        labels ? `Labels: ${labels}` : '',
        '',
        issue.body ?? '(no description)',
        '',
        `Comments (${issue.comments.length}):`,
        commentsDisplay,
      ]
        .filter(Boolean)
        .join('\n')

      return makeResult('github_read_issue', input, true, issue, display)
    } catch (error) {
      return makeResult('github_read_issue', input, false, null, `Failed to read issue: ${stringifyError(error)}`)
    }
  }
)

// ============================================================
// GITHUB CREATE ISSUE
// ============================================================

registerTool(
  {
    name: 'github_create_issue',
    description: 'Create a new GitHub issue.',
    input_schema: {
      type: 'object',
      properties: {
        repo: {
          type: 'string',
          description: 'GitHub repository in owner/repo format',
        },
        title: {
          type: 'string',
          description: 'Issue title',
        },
        body: {
          type: 'string',
          description: 'Issue body/description (Markdown supported)',
        },
        labels: {
          type: 'string',
          description: 'Comma-separated labels to apply (optional)',
        },
      },
      required: ['repo', 'title', 'body'],
    },
    category: 'system',
  },
  async (input: Record<string, unknown>, _context: ExecutionContext): Promise<ToolCallResult> => {
    const { execFileSync } = await import('node:child_process')

    const repo = validateRepo(input.repo as string)
    const title = input.title as string
    const body = input.body as string
    const labels = input.labels as string | undefined

    try {
      const args = ['issue', 'create', '--repo', repo, '--title', title, '--body', body]
      if (labels) {
        for (const label of labels.split(',')) {
          args.push('--label', label.trim())
        }
      }

      const output = execFileSync('gh', args, {
        encoding: 'utf-8',
        timeout: 30_000,
      })

      return makeResult(
        'github_create_issue',
        input,
        true,
        { url: output.trim() },
        `Created issue: ${output.trim()}`
      )
    } catch (error) {
      return makeResult('github_create_issue', input, false, null, `Failed to create issue: ${stringifyError(error)}`)
    }
  }
)

// ============================================================
// GITHUB COMMENT ISSUE
// ============================================================

registerTool(
  {
    name: 'github_comment_issue',
    description: 'Add a comment to a GitHub issue.',
    input_schema: {
      type: 'object',
      properties: {
        repo: {
          type: 'string',
          description: 'GitHub repository in owner/repo format',
        },
        number: {
          type: 'string',
          description: 'Issue number',
        },
        body: {
          type: 'string',
          description: 'Comment body (Markdown supported)',
        },
      },
      required: ['repo', 'number', 'body'],
    },
    category: 'system',
  },
  async (input: Record<string, unknown>, _context: ExecutionContext): Promise<ToolCallResult> => {
    const { execFileSync } = await import('node:child_process')

    const repo = validateRepo(input.repo as string)
    const number = validateNumber(input.number as string)
    const body = input.body as string

    try {
      execFileSync('gh', ['issue', 'comment', number, '--repo', repo, '--body', body], {
        encoding: 'utf-8',
        timeout: 30_000,
      })

      return makeResult(
        'github_comment_issue',
        input,
        true,
        { repo, number },
        `Added comment to issue #${number} in ${repo}.`
      )
    } catch (error) {
      return makeResult('github_comment_issue', input, false, null, `Failed to comment on issue: ${stringifyError(error)}`)
    }
  }
)

// ============================================================
// GITHUB CLOSE ISSUE
// ============================================================

registerTool(
  {
    name: 'github_close_issue',
    description: 'Close a GitHub issue with an optional comment.',
    input_schema: {
      type: 'object',
      properties: {
        repo: {
          type: 'string',
          description: 'GitHub repository in owner/repo format',
        },
        number: {
          type: 'string',
          description: 'Issue number',
        },
        comment: {
          type: 'string',
          description: 'Optional comment to add before closing',
        },
      },
      required: ['repo', 'number'],
    },
    category: 'system',
  },
  async (input: Record<string, unknown>, _context: ExecutionContext): Promise<ToolCallResult> => {
    const { execFileSync } = await import('node:child_process')

    const repo = validateRepo(input.repo as string)
    const number = validateNumber(input.number as string)
    const comment = input.comment as string | undefined

    try {
      if (comment) {
        execFileSync('gh', ['issue', 'comment', number, '--repo', repo, '--body', comment], {
          encoding: 'utf-8',
          timeout: 30_000,
        })
      }

      execFileSync('gh', ['issue', 'close', number, '--repo', repo], {
        encoding: 'utf-8',
        timeout: 30_000,
      })

      return makeResult(
        'github_close_issue',
        input,
        true,
        { repo, number },
        `Closed issue #${number} in ${repo}.${comment ? ' Comment added.' : ''}`
      )
    } catch (error) {
      return makeResult('github_close_issue', input, false, null, `Failed to close issue: ${stringifyError(error)}`)
    }
  }
)

// ============================================================
// DEPLOY VERCEL
// ============================================================

registerTool(
  {
    name: 'deploy_vercel',
    description: 'Deploy the current project or a specified directory to Vercel. Returns the deployment URL.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory to deploy (default: current directory)',
        },
        prod: {
          type: 'string',
          description: 'Set to "true" to deploy to production (default: preview)',
        },
      },
      required: [],
    },
    category: 'system',
  },
  async (input: Record<string, unknown>, _context: ExecutionContext): Promise<ToolCallResult> => {
    const { execFileSync } = await import('node:child_process')

    const path = validatePath((input.path as string) || '.')
    const prod = (input.prod as string) === 'true'

    try {
      // Check if vercel CLI is installed
      try {
        execFileSync('which', ['vercel'], { encoding: 'utf-8', timeout: 5000 })
      } catch {
        return makeResult(
          'deploy_vercel',
          input,
          false,
          null,
          'Vercel CLI is not installed. Install it with: npm i -g vercel'
        )
      }

      const args = ['deploy', path, '--yes']
      if (prod) {
        args.push('--prod')
      }

      const output = execFileSync('vercel', args, {
        encoding: 'utf-8',
        timeout: 300_000,
        maxBuffer: 5 * 1024 * 1024,
      })

      // The deployment URL is typically the last line of output
      const lines = output.trim().split('\n')
      const url = lines[lines.length - 1].trim()

      return makeResult(
        'deploy_vercel',
        input,
        true,
        { url, output: output.trim() },
        `Deployed${prod ? ' to production' : ' (preview)'}:\n${url}`
      )
    } catch (error) {
      return makeResult('deploy_vercel', input, false, null, `Deployment failed: ${stringifyError(error)}`)
    }
  }
)

// ============================================================
// REVIEW PULL REQUEST
// ============================================================

registerTool(
  {
    name: 'review_pull_request',
    description: 'Review a GitHub pull request: analyze the diff for bugs, security issues, performance problems, and style.',
    input_schema: {
      type: 'object',
      properties: {
        repo: {
          type: 'string',
          description: 'GitHub repository in owner/repo format',
        },
        number: {
          type: 'string',
          description: 'Pull request number',
        },
      },
      required: ['repo', 'number'],
    },
    category: 'system',
  },
  async (input: Record<string, unknown>, context: ExecutionContext): Promise<ToolCallResult> => {
    const { execFileSync } = await import('node:child_process')

    const repo = validateRepo(input.repo as string)
    const number = validateNumber(input.number as string)

    try {
      // 1. Get PR metadata
      const metaOutput = execFileSync('gh', ['pr', 'view', number, '--repo', repo, '--json', 'title,body,additions,deletions,changedFiles'], {
        encoding: 'utf-8',
        timeout: 30_000,
      })

      const meta = JSON.parse(metaOutput) as {
        title: string
        body: string
        additions: number
        deletions: number
        changedFiles: number
      }

      // 2. Get the diff
      const diff = execFileSync('gh', ['pr', 'diff', number, '--repo', repo], {
        encoding: 'utf-8',
        timeout: 60_000,
        maxBuffer: 5 * 1024 * 1024,
      })

      // Truncate diff if too large for model context
      const maxDiffLength = 50_000
      const truncatedDiff = diff.length > maxDiffLength
        ? diff.slice(0, maxDiffLength) + '\n\n... (diff truncated due to size)'
        : diff

      // 3. Call model to review
      const config = resolveModelConfig(context.modelId)

      const systemPrompt = `You are a senior code reviewer. Analyze the following pull request diff and provide a thorough review covering:

1. **Bugs**: Logic errors, edge cases, null/undefined risks
2. **Security**: Injection, XSS, secrets exposure, auth issues
3. **Performance**: N+1 queries, unnecessary re-renders, memory leaks
4. **Style**: Naming, readability, code organization
5. **Missing Tests**: Areas that should have test coverage

Format your review with clear sections and severity levels (CRITICAL, HIGH, MEDIUM, LOW).
Be specific — reference file names and line numbers from the diff.
If the PR looks good, say so briefly and note any minor suggestions.`

      const userMessage = `## PR: ${meta.title}

**Stats**: +${meta.additions} / -${meta.deletions} across ${meta.changedFiles} files

**Description**:
${meta.body ?? '(no description)'}

**Diff**:
\`\`\`diff
${truncatedDiff}
\`\`\``

      const response = await callModel(
        config,
        systemPrompt,
        [{ role: 'user', content: userMessage }],
        [],
        4096
      )

      const reviewText = response.content
        .filter((block) => block.type === 'text')
        .map((block) => (block as { type: 'text'; text: string }).text)
        .join('\n')

      const display = [
        `PR Review: ${meta.title} (#${number})`,
        `+${meta.additions} / -${meta.deletions} across ${meta.changedFiles} files`,
        '',
        reviewText,
      ].join('\n')

      return makeResult(
        'review_pull_request',
        input,
        true,
        { meta, review: reviewText },
        display
      )
    } catch (error) {
      return makeResult('review_pull_request', input, false, null, `Failed to review PR: ${stringifyError(error)}`)
    }
  }
)

// ============================================================
// SLACK TOOLS
// ============================================================

async function slackAPI(method: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const token = process.env.SLACK_ACCESS_TOKEN
  if (!token) {
    throw new Error('SLACK_ACCESS_TOKEN not configured. Set it in your .env file.')
  }

  const response = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  })

  if (!response.ok) {
    throw new Error(`Slack API HTTP ${response.status}: ${response.statusText}`)
  }

  const data = await response.json() as Record<string, unknown>
  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error ?? 'unknown error'}`)
  }

  return data
}

registerTool(
  {
    name: 'slack_send_message',
    description: 'Send a message to a Slack channel. Use channel name (e.g. "general") or channel ID.',
    input_schema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name or ID (e.g. "general", "C0123456789")' },
        text: { type: 'string', description: 'Message text to send' },
        thread_ts: { type: 'string', description: 'Optional thread timestamp to reply in a thread' },
      },
      required: ['channel', 'text'],
    },
    category: 'web',
  },
  async (input: Record<string, unknown>): Promise<ToolCallResult> => {
    const channel = input.channel as string
    const text = input.text as string
    const threadTs = input.thread_ts as string | undefined

    try {
      const body: Record<string, unknown> = { channel, text }
      if (threadTs) body.thread_ts = threadTs

      const data = await slackAPI('chat.postMessage', body)
      const ts = (data.ts as string) ?? ''
      const ch = (data.channel as string) ?? channel

      return makeResult('slack_send_message', input, true, { channel: ch, ts }, `Message sent to ${ch}`)
    } catch (error) {
      return makeResult('slack_send_message', input, false, null, `Failed to send Slack message: ${stringifyError(error)}`)
    }
  }
)

registerTool(
  {
    name: 'slack_list_channels',
    description: 'List Slack channels the bot has access to.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max channels to return (default 20)' },
      },
      required: [],
    },
    category: 'web',
  },
  async (input: Record<string, unknown>): Promise<ToolCallResult> => {
    const limit = (input.limit as number) ?? 20

    try {
      const data = await slackAPI('conversations.list', {
        types: 'public_channel,private_channel',
        exclude_archived: true,
        limit,
      })

      const channels = (data.channels as Array<{ id: string; name: string; is_member: boolean; num_members: number }>) ?? []
      const list = channels.map(c => `#${c.name} (${c.id}) ${c.is_member ? '✓ joined' : '○ not joined'} — ${c.num_members} members`)
      const display = list.length > 0 ? list.join('\n') : 'No channels found.'

      return makeResult('slack_list_channels', input, true, channels, display)
    } catch (error) {
      return makeResult('slack_list_channels', input, false, null, `Failed to list channels: ${stringifyError(error)}`)
    }
  }
)

registerTool(
  {
    name: 'slack_read_messages',
    description: 'Read recent messages from a Slack channel.',
    input_schema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name or ID' },
        limit: { type: 'number', description: 'Number of messages to fetch (default 10)' },
      },
      required: ['channel'],
    },
    category: 'web',
  },
  async (input: Record<string, unknown>): Promise<ToolCallResult> => {
    const channel = input.channel as string
    const limit = (input.limit as number) ?? 10

    try {
      const data = await slackAPI('conversations.history', { channel, limit })
      const messages = (data.messages as Array<{ user?: string; text: string; ts: string }>) ?? []
      const display = messages
        .map(m => `[${m.user ?? 'bot'}] ${m.text.slice(0, 200)}`)
        .join('\n')

      return makeResult('slack_read_messages', input, true, messages, display || 'No messages found.')
    } catch (error) {
      return makeResult('slack_read_messages', input, false, null, `Failed to read messages: ${stringifyError(error)}`)
    }
  }
)
