import { query } from '@anthropic-ai/claude-agent-sdk'
import type { McpStdioServerConfig, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { logger } from '@blade/shared'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ── Types ────────────────────────────────────────────────────

export interface SdkSessionState {
  sessionId: string | undefined
  totalInputTokens: number
  totalOutputTokens: number
  totalCostUsd: number
  didCompact: boolean
  turnCount: number
}

export interface SdkRunOptions {
  message: string
  sessionId?: string
  cwd?: string
  model?: string
  maxTurns?: number
  maxBudgetUsd?: number
  mcpAllowlist?: string[]
  systemPrompt?: string
  abortController?: AbortController
  onProgress?: (event: { type: string; description: string }) => void
  onStreamText?: (accumulatedText: string) => void
}

export interface SdkRunResult {
  text: string | null
  sessionId: string | undefined
  inputTokens: number
  outputTokens: number
  costUsd: number
  didCompact: boolean
  model: string
}

// ── MCP Server Loading ──────────────────────────────────────

/**
 * Load MCP server configs from user settings (~/.claude/settings.json)
 * and project settings (.claude/settings.json in cwd).
 * Optionally filter by an allowlist.
 */
export function loadMcpServers(
  cwd?: string,
  allowlist?: string[]
): Record<string, McpStdioServerConfig> {
  const merged: Record<string, McpStdioServerConfig> = {}
  const home = process.env.HOME ?? '/tmp'

  const paths = [
    join(home, '.claude', 'settings.json'),
    join(cwd ?? process.cwd(), '.claude', 'settings.json'),
  ]

  for (const file of paths) {
    try {
      const raw = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, unknown>
      const servers = raw['mcpServers']
      if (servers && typeof servers === 'object') {
        for (const [name, config] of Object.entries(servers as Record<string, unknown>)) {
          const cfg = config as Record<string, unknown>
          if (cfg['command'] && typeof cfg['command'] === 'string') {
            merged[name] = {
              command: cfg['command'],
              ...(cfg['args'] ? { args: cfg['args'] as string[] } : {}),
              ...(cfg['env'] ? { env: cfg['env'] as Record<string, string> } : {}),
            }
          }
        }
      }
    } catch {
      // File doesn't exist or invalid — skip
    }
  }

  if (allowlist) {
    const allowed = new Set(allowlist)
    for (const name of Object.keys(merged)) {
      if (!allowed.has(name)) delete merged[name]
    }
  }

  return merged
}

// ── Tool label mapping ─────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  Read: 'Reading file',
  Write: 'Writing file',
  Edit: 'Editing file',
  Bash: 'Running command',
  Grep: 'Searching code',
  Glob: 'Finding files',
  WebSearch: 'Web search',
  WebFetch: 'Fetching page',
  Agent: 'Sub-agent',
}

function toolLabel(toolName: string): string {
  if (TOOL_LABELS[toolName]) return TOOL_LABELS[toolName]
  if (toolName.startsWith('mcp__')) {
    const parts = toolName.split('__')
    return parts.length >= 3 ? `${parts[1]}: ${parts.slice(2).join(' ')}` : toolName
  }
  return toolName
}

// ── Single-turn prompt generator ────────────────────────────

async function* singleTurn(text: string): AsyncGenerator<SDKUserMessage> {
  yield {
    type: 'user',
    message: { role: 'user', content: text },
    parent_tool_use_id: null,
    session_id: '',
  }
}

// ── Event handlers ─────────────────────────────────────────

function handleAssistantEvent(
  ev: Record<string, unknown>,
  onProgress?: (event: { type: string; description: string }) => void
): { lastCallInputTokens: number } {
  let lastCallInputTokens = 0
  const msg = ev['message'] as Record<string, unknown> | undefined
  const msgUsage = msg?.['usage'] as Record<string, number> | undefined
  if (msgUsage?.['input_tokens']) {
    lastCallInputTokens = msgUsage['input_tokens']
  }

  if (onProgress) {
    const content = msg?.['content'] as Array<{ type: string; name?: string }> | undefined
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'tool_use' && block.name) {
          onProgress({ type: 'tool_active', description: toolLabel(block.name) })
        }
      }
    }
  }

  return { lastCallInputTokens }
}

function handleStreamEvent(
  ev: Record<string, unknown>,
  streamedText: string,
  onStreamText?: (text: string) => void
): string {
  if (ev['parent_tool_use_id'] !== null || !onStreamText) return streamedText

  const streamEvent = ev['event'] as Record<string, unknown> | undefined
  if (streamEvent?.['type'] === 'message_start') return ''

  if (streamEvent?.['type'] === 'content_block_delta') {
    const delta = streamEvent['delta'] as Record<string, unknown> | undefined
    if (delta?.['type'] === 'text_delta' && typeof delta['text'] === 'string') {
      const updated = streamedText + delta['text']
      onStreamText(updated)
      return updated
    }
  }

  return streamedText
}

// ── Main execution function ─────────────────────────────────

/**
 * Run a message through Claude Code via the Agent SDK.
 *
 * This spawns the real Claude CLI with access to all MCP servers,
 * skills, and tools. Supports session resumption for persistent context.
 */
export async function runSdkAgent(options: SdkRunOptions): Promise<SdkRunResult> {
  const {
    message,
    sessionId,
    cwd,
    model,
    maxTurns = 30,
    maxBudgetUsd,
    mcpAllowlist,
    abortController,
    onProgress,
    onStreamText,
  } = options

  let newSessionId: string | undefined
  let resultText: string | null = null
  let inputTokens = 0
  let outputTokens = 0
  let costUsd = 0
  let didCompact = false
  let resultModel = model ?? 'claude-sonnet-4-6'
  let streamedText = ''

  const mcpServers = loadMcpServers(cwd, mcpAllowlist)
  const mcpNames = Object.keys(mcpServers)

  logger.info('ClaudeSDK', `Starting query (session=${sessionId ?? 'new'}, mcpServers=[${mcpNames.join(', ')}])`)

  try {
    for await (const event of query({
      prompt: singleTurn(message),
      options: {
        cwd: cwd ?? process.cwd(),
        resume: sessionId,
        settingSources: ['project', 'user'],
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        ...(maxTurns > 0 ? { maxTurns } : {}),
        ...(maxBudgetUsd ? { maxBudgetUsd } : {}),
        ...(mcpNames.length > 0 ? { mcpServers } : {}),
        ...(model ? { model } : {}),
        ...(abortController ? { abortController } : {}),
        includePartialMessages: !!onStreamText,
        env: { ...process.env as Record<string, string>, CLAUDE_AGENT_SDK_CLIENT_APP: 'blade-super-agent/1.0' },
      },
    })) {
      const ev = event as Record<string, unknown>

      if (ev['type'] === 'system' && ev['subtype'] === 'init') {
        newSessionId = ev['session_id'] as string
        logger.debug('ClaudeSDK', `Session initialized: ${newSessionId}`)
      }

      if (ev['type'] === 'system' && ev['subtype'] === 'compact_boundary') {
        didCompact = true
        const meta = ev['compact_metadata'] as { trigger: string; pre_tokens: number } | undefined
        logger.warn('ClaudeSDK', `Context compacted (trigger=${meta?.trigger}, pre_tokens=${meta?.pre_tokens})`)
      }

      if (ev['type'] === 'assistant') {
        handleAssistantEvent(ev, onProgress)
      }

      if (ev['type'] === 'system' && ev['subtype'] === 'task_started' && onProgress) {
        onProgress({ type: 'task_started', description: (ev['description'] as string) ?? 'Sub-agent started' })
      }

      if (ev['type'] === 'system' && ev['subtype'] === 'task_notification' && onProgress) {
        const summary = (ev['summary'] as string) ?? 'Sub-agent finished'
        const status = (ev['status'] as string) ?? 'completed'
        onProgress({ type: 'task_completed', description: status === 'failed' ? `Failed: ${summary}` : summary })
      }

      if (ev['type'] === 'stream_event' && onStreamText) {
        streamedText = handleStreamEvent(ev, streamedText, onStreamText)
      }

      if (ev['type'] === 'result') {
        resultText = (ev['result'] as string | null | undefined) ?? null

        const evUsage = ev['usage'] as Record<string, number> | undefined
        if (evUsage) {
          inputTokens = evUsage['input_tokens'] ?? 0
          outputTokens = evUsage['output_tokens'] ?? 0
          costUsd = (ev['total_cost_usd'] as number) ?? 0
        }

        const modelUsage = ev['model_usage'] as Record<string, unknown> | undefined
        if (modelUsage) {
          const modelKeys = Object.keys(modelUsage)
          if (modelKeys.length > 0) resultModel = modelKeys[0]
        }
      }
    }
  } catch (err) {
    if (abortController?.signal.aborted) {
      logger.info('ClaudeSDK', 'Query aborted')
      return { text: null, sessionId: newSessionId, inputTokens, outputTokens, costUsd, didCompact, model: resultModel }
    }

    const errMsg = err instanceof Error ? err.message : String(err)
    logger.error('ClaudeSDK', `Query failed: ${errMsg}`)
    throw new Error(`Claude SDK query failed: ${errMsg}`)
  }

  logger.info('ClaudeSDK', `Query complete (tokens=${inputTokens}in/${outputTokens}out, cost=$${costUsd.toFixed(4)}, compacted=${didCompact})`)

  return {
    text: resultText,
    sessionId: newSessionId,
    inputTokens,
    outputTokens,
    costUsd,
    didCompact,
    model: resultModel,
  }
}
