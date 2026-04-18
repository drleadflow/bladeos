import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { execSync as nodeExecSync, spawnSync as nodeSpawnSync } from 'node:child_process'
import { writeFileSync as nodeWriteFileSync, unlinkSync as nodeUnlinkSync, mkdtempSync as nodeMkdtempSync } from 'node:fs'
import { join as nodeJoin } from 'node:path'
import { tmpdir as nodeTmpdir } from 'node:os'
import type { ToolDefinition, ModelConfig, ModelResponse, ContentBlock } from './types.js'
import type { AgentMessage } from './types.js'
import { logger } from '@blade/shared'

// ============================================================
// ANTHROPIC PROVIDER
// ============================================================

const MODEL_TIMEOUT_MS = 60_000 // 60s timeout on all model HTTP calls

function createAnthropicClient(config: ModelConfig): Anthropic {
  return new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    timeout: MODEL_TIMEOUT_MS,
  })
}

// Client cache to reuse HTTP connections
const anthropicClients = new Map<string, Anthropic>()
const openaiClients = new Map<string, OpenAI>()

function getAnthropicClient(config: ModelConfig): Anthropic {
  const key = `${config.apiKey}:${config.baseUrl ?? 'default'}`
  let client = anthropicClients.get(key)
  if (!client) {
    client = createAnthropicClient(config)
    anthropicClients.set(key, client)
  }
  return client
}

function getOpenAIClient(config: ModelConfig): OpenAI {
  const key = `${config.apiKey}:${config.baseUrl ?? 'default'}`
  let client = openaiClients.get(key)
  if (!client) {
    client = createOpenAIClient(config)
    openaiClients.set(key, client)
  }
  return client
}

function toAnthropicTools(tools: ToolDefinition[]): Anthropic.Messages.Tool[] {
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as unknown as Anthropic.Messages.Tool.InputSchema,
  }))
}

function toAnthropicMessages(msgs: AgentMessage[]): Anthropic.Messages.MessageParam[] {
  return msgs.map(m => ({
    role: m.role,
    content: m.content as string | Anthropic.Messages.ContentBlockParam[],
  }))
}

function fromAnthropicResponse(response: Anthropic.Messages.Message): ModelResponse {
  const content: ContentBlock[] = response.content.map(block => {
    if (block.type === 'text') {
      return { type: 'text' as const, text: block.text }
    }
    if (block.type === 'tool_use') {
      return {
        type: 'tool_use' as const,
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      }
    }
    return { type: 'text' as const, text: '' }
  })

  return {
    content,
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    stopReason: response.stop_reason ?? 'end_turn',
  }
}

// ============================================================
// OPENAI PROVIDER
// ============================================================

function createOpenAIClient(config: ModelConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    timeout: MODEL_TIMEOUT_MS,
  })
}

function toOpenAITools(tools: ToolDefinition[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema as unknown as Record<string, unknown>,
    },
  }))
}

function toOpenAIMessages(
  systemPrompt: string,
  msgs: AgentMessage[]
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const result: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
  ]

  for (const m of msgs) {
    if (m.role === 'user') {
      if (typeof m.content === 'string') {
        result.push({ role: 'user', content: m.content })
      } else {
        // Handle content blocks from user side (tool results)
        const toolResults = m.content.filter(b => b.type === 'tool_result')
        for (const block of toolResults) {
          if (block.type === 'tool_result') {
            result.push({
              role: 'tool',
              tool_call_id: block.tool_use_id,
              content: block.content,
            })
          }
        }
        const textBlocks = m.content.filter(b => b.type === 'text')
        if (textBlocks.length > 0) {
          const text = textBlocks.map(b => b.type === 'text' ? b.text : '').join('\n')
          if (text.trim()) {
            result.push({ role: 'user', content: text })
          }
        }
      }
    } else if (m.role === 'assistant') {
      if (typeof m.content === 'string') {
        result.push({ role: 'assistant', content: m.content })
      } else {
        const textParts = m.content.filter(b => b.type === 'text')
        const toolUseParts = m.content.filter(b => b.type === 'tool_use')

        const toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] = toolUseParts
          .filter(b => b.type === 'tool_use')
          .map(b => {
            if (b.type !== 'tool_use') throw new Error('unreachable')
            return {
              id: b.id,
              type: 'function' as const,
              function: {
                name: b.name,
                arguments: JSON.stringify(b.input),
              },
            }
          })

        const textContent = textParts.map(b => b.type === 'text' ? b.text : '').join('\n') || null

        result.push({
          role: 'assistant',
          content: textContent,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        })
      }
    }
  }

  return result
}

function mapOpenAIStopReason(finishReason: string | null): string {
  switch (finishReason) {
    case 'stop': return 'end_turn'
    case 'tool_calls': return 'tool_use'
    case 'length': return 'end_turn'
    case 'content_filter': return 'end_turn'
    default: return 'end_turn'
  }
}

function fromOpenAIResponse(response: OpenAI.Chat.Completions.ChatCompletion): ModelResponse {
  const choice = response.choices[0]
  if (!choice) {
    return {
      content: [{ type: 'text', text: '' }],
      model: response.model,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      stopReason: 'end_turn',
    }
  }

  const content: ContentBlock[] = []

  if (choice.message.content) {
    content.push({ type: 'text' as const, text: choice.message.content })
  }

  if (choice.message.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      let parsedArgs: Record<string, unknown> = {}
      try {
        parsedArgs = JSON.parse(tc.function.arguments)
      } catch (parseErr) {
        // Return error as text so the model knows the parse failed and can retry
        logger.warn('ModelProvider', `Failed to parse tool arguments for "${tc.function.name}": ${tc.function.arguments}`)
        content.push({
          type: 'text' as const,
          text: `[Tool call error] Failed to parse arguments for "${tc.function.name}": invalid JSON. Please retry with valid JSON arguments.`,
        })
        continue
      }
      content.push({
        type: 'tool_use' as const,
        id: tc.id,
        name: tc.function.name,
        input: parsedArgs,
      })
    }
  }

  if (content.length === 0) {
    content.push({ type: 'text' as const, text: '' })
  }

  return {
    content,
    model: response.model,
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
    stopReason: mapOpenAIStopReason(choice.finish_reason),
  }
}

function isReasoningModel(modelId: string): boolean {
  return modelId.startsWith('o3') || modelId.startsWith('o1')
}

async function callOpenAI(
  config: ModelConfig,
  systemPrompt: string,
  messages: AgentMessage[],
  tools: ToolDefinition[],
  maxTokens?: number
): Promise<ModelResponse> {
  const client = getOpenAIClient(config)

  logger.debug('ModelProvider', `Calling OpenAI ${config.modelId} with ${messages.length} messages and ${tools.length} tools`)

  const openaiMessages = toOpenAIMessages(systemPrompt, messages)

  const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
    model: config.modelId,
    messages: openaiMessages,
    ...(tools.length > 0 ? { tools: toOpenAITools(tools) } : {}),
  }

  // Reasoning models (o1, o3) use max_completion_tokens instead of max_tokens
  if (isReasoningModel(config.modelId)) {
    params.max_completion_tokens = maxTokens ?? 8192
  } else {
    params.max_tokens = maxTokens ?? 8192
  }

  const response = await client.chat.completions.create(params)

  return fromOpenAIResponse(response)
}

export async function callModel(
  config: ModelConfig,
  systemPrompt: string,
  messages: AgentMessage[],
  tools: ToolDefinition[],
  maxTokens?: number
): Promise<ModelResponse> {
  if (config.provider === 'gemini-cli') {
    return callGeminiCli(systemPrompt, messages, tools, maxTokens)
  }

  if (config.provider === 'claude-cli') {
    return callClaudeCli(systemPrompt, messages, tools, maxTokens)
  }

  if (config.provider === 'anthropic') {
    const client = getAnthropicClient(config)

    logger.debug('ModelProvider', `Calling ${config.modelId} with ${messages.length} messages and ${tools.length} tools`)

    const response = await client.messages.create({
      model: config.modelId,
      max_tokens: maxTokens ?? 8192,
      system: systemPrompt,
      messages: toAnthropicMessages(messages),
      tools: tools.length > 0 ? toAnthropicTools(tools) : undefined,
    })

    return fromAnthropicResponse(response)
  }

  if (config.provider === 'openai' || config.provider === 'openrouter') {
    return callOpenAI(config, systemPrompt, messages, tools, maxTokens)
  }

  throw new Error(`Provider "${config.provider}" not yet supported. Use "anthropic", "openai", "openrouter", "claude-cli", or "gemini-cli".`)
}

// ============================================================
// STREAMING (for future web UI)
// ============================================================

export async function* streamModel(
  config: ModelConfig,
  systemPrompt: string,
  messages: AgentMessage[],
  tools: ToolDefinition[],
  maxTokens?: number
): AsyncGenerator<{ type: 'text_delta'; text: string } | { type: 'content_block_stop'; block: ContentBlock } | { type: 'message_done'; response: ModelResponse }> {
  if (config.provider === 'openai' || config.provider === 'openrouter') {
    yield* streamOpenAI(config, systemPrompt, messages, tools, maxTokens)
    return
  }

  if (config.provider !== 'anthropic') {
    throw new Error(`Streaming not supported for provider "${config.provider}"`)
  }

  const client = getAnthropicClient(config)

  const stream = client.messages.stream({
    model: config.modelId,
    max_tokens: maxTokens ?? 8192,
    system: systemPrompt,
    messages: toAnthropicMessages(messages),
    tools: tools.length > 0 ? toAnthropicTools(tools) : undefined,
  })

  for await (const event of stream) {
    if (event.type === 'content_block_delta') {
      const delta = event.delta as unknown as Record<string, unknown>
      if (delta.type === 'text_delta' && typeof delta.text === 'string') {
        yield { type: 'text_delta', text: delta.text }
      }
    }
  }

  const finalMessage = await stream.finalMessage()
  yield { type: 'message_done', response: fromAnthropicResponse(finalMessage) }
}

async function* streamOpenAI(
  config: ModelConfig,
  systemPrompt: string,
  messages: AgentMessage[],
  tools: ToolDefinition[],
  maxTokens?: number
): AsyncGenerator<{ type: 'text_delta'; text: string } | { type: 'content_block_stop'; block: ContentBlock } | { type: 'message_done'; response: ModelResponse }> {
  const client = getOpenAIClient(config)
  const openaiMessages = toOpenAIMessages(systemPrompt, messages)

  const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
    model: config.modelId,
    messages: openaiMessages,
    stream: true,
    ...(tools.length > 0 ? { tools: toOpenAITools(tools) } : {}),
  }

  if (isReasoningModel(config.modelId)) {
    params.max_completion_tokens = maxTokens ?? 8192
  } else {
    params.max_tokens = maxTokens ?? 8192
  }

  const stream = await client.chat.completions.create(params)

  let fullContent = ''
  const toolCallAccumulator: Record<number, { id: string; name: string; arguments: string }> = {}
  let finishReason: string | null = null
  let promptTokens = 0
  let completionTokens = 0

  for await (const chunk of stream) {
    const choice = chunk.choices[0]
    if (!choice) continue

    if (choice.finish_reason) {
      finishReason = choice.finish_reason
    }

    if (choice.delta.content) {
      fullContent += choice.delta.content
      yield { type: 'text_delta', text: choice.delta.content }
    }

    if (choice.delta.tool_calls) {
      for (const tc of choice.delta.tool_calls) {
        const idx = tc.index
        if (!toolCallAccumulator[idx]) {
          toolCallAccumulator[idx] = { id: tc.id ?? '', name: tc.function?.name ?? '', arguments: '' }
        }
        if (tc.id) {
          toolCallAccumulator[idx].id = tc.id
        }
        if (tc.function?.name) {
          toolCallAccumulator[idx].name = tc.function.name
        }
        if (tc.function?.arguments) {
          toolCallAccumulator[idx].arguments += tc.function.arguments
        }
      }
    }

    if (chunk.usage) {
      promptTokens = chunk.usage.prompt_tokens
      completionTokens = chunk.usage.completion_tokens
    }
  }

  // Build final response
  const content: ContentBlock[] = []
  if (fullContent) {
    content.push({ type: 'text' as const, text: fullContent })
  }

  for (const idx of Object.keys(toolCallAccumulator).map(Number).sort((a, b) => a - b)) {
    const tc = toolCallAccumulator[idx]
    let parsedArgs: Record<string, unknown> = {}
    try {
      parsedArgs = JSON.parse(tc.arguments)
    } catch {
      logger.warn('ModelProvider', `Failed to parse streamed tool arguments for "${tc.name}": ${tc.arguments.slice(0, 200)}`)
      content.push({
        type: 'text' as const,
        text: `[Tool call error] Failed to parse arguments for "${tc.name}": invalid JSON. Please retry with valid JSON arguments.`,
      })
      continue
    }
    content.push({
      type: 'tool_use' as const,
      id: tc.id,
      name: tc.name,
      input: parsedArgs,
    })
  }

  if (content.length === 0) {
    content.push({ type: 'text' as const, text: '' })
  }

  yield {
    type: 'message_done',
    response: {
      content,
      model: config.modelId,
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      stopReason: mapOpenAIStopReason(finishReason),
    },
  }
}

// ============================================================
// CLAUDE CLI PROVIDER (for OAuth subscription tokens)
// ============================================================

async function callClaudeCli(
  systemPrompt: string,
  messages: AgentMessage[],
  tools: ToolDefinition[],
  _maxTokens?: number
): Promise<ModelResponse> {
  const writeFileSync = nodeWriteFileSync
  const unlinkSync = nodeUnlinkSync
  const mkdtempSync = nodeMkdtempSync
  const join = nodeJoin
  const tmpdir = nodeTmpdir

  // Build the user prompt from messages
  const parts: string[] = []
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      parts.push(msg.content)
    } else {
      for (const block of msg.content) {
        if (block.type === 'text') {
          parts.push((block as { type: 'text'; text: string }).text)
        } else if (block.type === 'tool_result') {
          const tr = block as { type: 'tool_result'; tool_use_id: string; content: string }
          parts.push(`[Tool result]: ${tr.content}`)
        }
      }
    }
  }
  const userPrompt = parts.join('\n\n')

  // Build tool descriptions into system prompt
  let augmentedSystemPrompt = systemPrompt
  if (tools.length > 0) {
    augmentedSystemPrompt += '\n\n## Available Tools\n'
    augmentedSystemPrompt += 'You have these tools available. To use a tool, respond ONLY with a JSON block like: {"tool": "tool_name", "input": {...}}\n\n'
    for (const tool of tools) {
      augmentedSystemPrompt += `### ${tool.name}\n${tool.description}\nParameters: ${JSON.stringify(tool.input_schema.properties)}\n\n`
    }
  }

  // Write system prompt to a temp file to avoid shell escaping issues
  const tmpDir = mkdtempSync(join(tmpdir(), 'blade-cli-'))
  const systemFile = join(tmpDir, 'system.txt')
  writeFileSync(systemFile, augmentedSystemPrompt, 'utf-8')

  logger.debug('ModelProvider', `Calling Claude CLI with ${messages.length} messages`)

  try {
    // Write prompt to a file too, then pipe it via shell
    const promptFile = join(tmpDir, 'prompt.txt')
    writeFileSync(promptFile, userPrompt, 'utf-8')

    // Resolve claude CLI path
    let claudePath = 'claude'
    try {
      claudePath = nodeExecSync('which claude', { encoding: 'utf-8', timeout: 5000 }).trim() || 'claude'
    } catch { /* use default */ }

    // Use spawnSync — strip ANTHROPIC_API_KEY so CLI uses its own OAuth keychain
    const cliEnv = { ...process.env }
    delete cliEnv.ANTHROPIC_API_KEY

    const spawnResult = nodeSpawnSync(claudePath, [
      '-p',
      '--output-format', 'json',
      '--system-prompt-file', systemFile,
      '--max-turns', '3',
    ], {
      input: userPrompt,
      encoding: 'utf-8',
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
      env: cliEnv,
    })

    if (spawnResult.error) {
      throw spawnResult.error
    }

    const result = spawnResult.stdout

    // Clean up temp files
    try { unlinkSync(systemFile) } catch { /* ignore */ }
    try { unlinkSync(promptFile) } catch { /* ignore */ }

    const parsed = JSON.parse(result.trim())
    const resultText: string = parsed.result ?? ''
    const content: ContentBlock[] = []

    // Find all tool call JSON objects in the response
    const toolCallRegex = /\{"tool":\s*"([^"]+)",\s*"input":\s*(\{[^}]*\})\s*\}/g
    let match: RegExpExecArray | null
    const toolCalls: Array<{ name: string; input: Record<string, unknown>; index: number }> = []

    while ((match = toolCallRegex.exec(resultText)) !== null) {
      try {
        const parsed2 = JSON.parse(match[2])
        toolCalls.push({ name: match[1], input: parsed2, index: match.index })
      } catch {
        // Skip malformed tool calls
      }
    }

    if (toolCalls.length > 0) {
      const textBefore = resultText.slice(0, toolCalls[0].index).trim()
      if (textBefore) {
        content.push({ type: 'text' as const, text: textBefore })
      }
      for (const tc of toolCalls) {
        content.push({
          type: 'tool_use' as const,
          id: `cli-${crypto.randomUUID().slice(0, 8)}`,
          name: tc.name,
          input: tc.input,
        })
      }
    } else {
      content.push({ type: 'text' as const, text: resultText })
    }

    const usage = parsed.usage ?? {}
    const inputTokens = (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)
    const outputTokens = usage.output_tokens ?? 0

    return {
      content,
      model: Object.keys(parsed.modelUsage ?? {})[0] ?? 'claude-cli',
      inputTokens,
      outputTokens,
      stopReason: parsed.stop_reason ?? 'end_turn',
    }
  } catch (err) {
    // Clean up temp files on error too
    try { unlinkSync(systemFile) } catch { /* ignore */ }
    try { unlinkSync(join(tmpDir, 'prompt.txt')) } catch { /* ignore */ }
    const stderr = (err as { stderr?: string }).stderr ?? ''
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Claude CLI failed: ${stderr || message}`)
  }
}

// ============================================================
// GEMINI CLI PROVIDER (1M context window for large codebase analysis)
// ============================================================

async function callGeminiCli(
  systemPrompt: string,
  messages: AgentMessage[],
  tools: ToolDefinition[],
  _maxTokens?: number
): Promise<ModelResponse> {
  const writeFileSync = nodeWriteFileSync
  const unlinkSync = nodeUnlinkSync
  const mkdtempSync = nodeMkdtempSync
  const join = nodeJoin
  const tmpdir = nodeTmpdir

  // Build the user prompt from messages
  const parts: string[] = []
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      parts.push(msg.content)
    } else {
      for (const block of msg.content) {
        if (block.type === 'text') {
          parts.push((block as { type: 'text'; text: string }).text)
        } else if (block.type === 'tool_result') {
          const tr = block as { type: 'tool_result'; tool_use_id: string; content: string }
          parts.push(`[Tool result]: ${tr.content}`)
        }
      }
    }
  }

  // Prepend system prompt to user prompt (Gemini CLI uses GEMINI.md for system context,
  // but for programmatic use we inject it inline)
  let fullPrompt = ''
  if (systemPrompt) {
    fullPrompt += `<system>\n${systemPrompt}\n</system>\n\n`
  }

  // Inject tool descriptions if any
  if (tools.length > 0) {
    fullPrompt += '## Available Tools\n'
    fullPrompt += 'You have these tools available. To use a tool, respond ONLY with a JSON block like: {"tool": "tool_name", "input": {...}}\n\n'
    for (const tool of tools) {
      fullPrompt += `### ${tool.name}\n${tool.description}\nParameters: ${JSON.stringify(tool.input_schema.properties)}\n\n`
    }
  }

  fullPrompt += parts.join('\n\n')

  // Write prompt to temp file to handle large payloads
  const tmpDir = mkdtempSync(join(tmpdir(), 'blade-gemini-'))
  const promptFile = join(tmpDir, 'prompt.txt')
  writeFileSync(promptFile, fullPrompt, 'utf-8')

  logger.debug('ModelProvider', `Calling Gemini CLI with ${messages.length} messages and ${tools.length} tools`)

  try {
    // Resolve gemini CLI path
    let geminiPath = 'gemini'
    try {
      geminiPath = nodeExecSync('which gemini', { encoding: 'utf-8', timeout: 5000 }).trim() || 'gemini'
    } catch { /* use default */ }

    const cliEnv = { ...process.env }
    // Ensure GEMINI_API_KEY is set
    if (!cliEnv.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not configured. Set it in your .env file.')
    }

    const spawnResult = nodeSpawnSync(geminiPath, [
      '-p',
      fullPrompt,
      '--output-format', 'json',
    ], {
      encoding: 'utf-8',
      timeout: 180_000, // 3 min — Gemini handles large contexts
      maxBuffer: 20 * 1024 * 1024, // 20MB — large context responses
      env: cliEnv,
    })

    if (spawnResult.error) {
      throw spawnResult.error
    }

    const rawOutput = spawnResult.stdout

    // Clean up temp files
    try { unlinkSync(promptFile) } catch { /* ignore */ }

    // Parse JSON response from Gemini CLI
    let resultText = ''
    let inputTokens = 0
    let outputTokens = 0
    let modelName = 'gemini-2.5-flash'

    try {
      const parsed = JSON.parse(rawOutput.trim())
      // Gemini CLI JSON format: { response: string, stats: { models: { ... } } }
      resultText = parsed.result ?? parsed.response ?? parsed.text ?? ''

      // Extract token usage from stats.models
      if (parsed.stats?.models) {
        const modelEntries = Object.entries(parsed.stats.models) as [string, { tokens?: { prompt?: number; candidates?: number } }][]
        for (const [name, data] of modelEntries) {
          modelName = name
          if (data.tokens) {
            inputTokens += data.tokens.prompt ?? 0
            outputTokens += data.tokens.candidates ?? 0
          }
        }
      }

      // Fallback: direct usage field
      if (inputTokens === 0 && parsed.usage) {
        inputTokens = parsed.usage.input_tokens ?? parsed.usage.promptTokenCount ?? 0
        outputTokens = parsed.usage.output_tokens ?? parsed.usage.candidatesTokenCount ?? 0
      }
      if (parsed.model) {
        modelName = parsed.model
      }
    } catch {
      // If JSON parse fails, treat raw output as text response
      resultText = rawOutput.trim()
    }

    const content: ContentBlock[] = []

    // Find all tool call JSON objects in the response
    const toolCallRegex = /\{"tool":\s*"([^"]+)",\s*"input":\s*(\{[^}]*\})\s*\}/g
    let match: RegExpExecArray | null
    const toolCalls: Array<{ name: string; input: Record<string, unknown>; index: number }> = []

    while ((match = toolCallRegex.exec(resultText)) !== null) {
      try {
        const parsedInput = JSON.parse(match[2])
        toolCalls.push({ name: match[1], input: parsedInput, index: match.index })
      } catch {
        // Skip malformed tool calls
      }
    }

    if (toolCalls.length > 0) {
      const textBefore = resultText.slice(0, toolCalls[0].index).trim()
      if (textBefore) {
        content.push({ type: 'text' as const, text: textBefore })
      }
      for (const tc of toolCalls) {
        content.push({
          type: 'tool_use' as const,
          id: `gemini-${crypto.randomUUID().slice(0, 8)}`,
          name: tc.name,
          input: tc.input,
        })
      }
    } else {
      content.push({ type: 'text' as const, text: resultText })
    }

    return {
      content,
      model: modelName,
      inputTokens,
      outputTokens,
      stopReason: 'end_turn',
    }
  } catch (err) {
    // Clean up on error
    try { unlinkSync(promptFile) } catch { /* ignore */ }
    const stderr = (err as { stderr?: string }).stderr ?? ''
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Gemini CLI failed: ${stderr || message}`)
  }
}

// ============================================================
// SMART MODEL ROUTING
// ============================================================

export type TaskComplexity = 'light' | 'standard' | 'heavy' | 'large-context' | 'acknowledgment'

/**
 * Resolve the best model config based on task complexity.
 * - acknowledgment: simple ack/emoji → same as light (cheapest)
 * - light: memory extraction, skill generation, simple questions → OpenRouter (cheap)
 * - standard: normal chat, tool use → Claude subscription or OpenRouter
 * - heavy: coding pipeline, complex analysis → Claude subscription (best quality)
 *
 * Priority: OpenRouter for light tasks (saves subscription limits),
 * Claude CLI for standard/heavy (best quality, uses subscription).
 * Falls back through: OpenRouter → OpenAI → Claude CLI
 */
export function resolveSmartModelConfig(
  complexity: TaskComplexity = 'standard',
  options?: { needsToolCalling?: boolean }
): ModelConfig {
  // Normalize acknowledgment → light for cheapest routing
  const effective: Exclude<TaskComplexity, 'acknowledgment'> =
    complexity === 'acknowledgment' ? 'light' : complexity

  const hasOpenRouter = !!process.env.OPENROUTER_API_KEY
  const hasOpenAI = !!process.env.OPENAI_API_KEY
  const hasClaudeCli = (process.env.ANTHROPIC_API_KEY ?? '').startsWith('sk-ant-oat01-')
  const hasAnthropicApi = !!(process.env.ANTHROPIC_API_KEY) && !hasClaudeCli
  const hasGemini = !!process.env.GEMINI_API_KEY

  // Large-context tasks: route to Gemini CLI (1M token context window)
  if (effective === 'large-context' && hasGemini) {
    return {
      provider: 'gemini-cli',
      modelId: 'gemini-2.5-flash',
      apiKey: process.env.GEMINI_API_KEY!,
    }
  }

  // When tool calling is required, NEVER use claude-cli (it can't do native tool-use).
  // Prefer providers with native API tool support in order:
  // OpenRouter → Anthropic direct → OpenAI → Claude CLI as absolute last resort.
  if (options?.needsToolCalling) {
    if (hasOpenRouter) {
      return {
        provider: 'openrouter',
        modelId: effective === 'light'
          ? 'anthropic/claude-haiku-4.5'
          : 'anthropic/claude-sonnet-4',
        apiKey: process.env.OPENROUTER_API_KEY!,
        baseUrl: 'https://openrouter.ai/api/v1',
      }
    }
    if (hasAnthropicApi) {
      return {
        provider: 'anthropic',
        modelId: effective === 'light'
          ? 'claude-haiku-4-20250514'
          : 'claude-sonnet-4-20250514',
        apiKey: process.env.ANTHROPIC_API_KEY!,
      }
    }
    if (hasOpenAI) {
      return {
        provider: 'openai',
        modelId: effective === 'light' ? 'gpt-4o-mini' : 'gpt-4o',
        apiKey: process.env.OPENAI_API_KEY!,
      }
    }
    // Absolute last resort — CLI does not support native tool calling
    if (hasClaudeCli) {
      return { provider: 'claude-cli', modelId: 'claude-sonnet-4-20250514', apiKey: process.env.ANTHROPIC_API_KEY! }
    }
    return { provider: 'anthropic', modelId: 'claude-sonnet-4-20250514', apiKey: '' }
  }

  // Light tasks: use cheapest available
  if (effective === 'light') {
    if (hasOpenRouter) {
      return {
        provider: 'openrouter',
        modelId: 'anthropic/claude-haiku-4.5',
        apiKey: process.env.OPENROUTER_API_KEY!,
        baseUrl: 'https://openrouter.ai/api/v1',
      }
    }
    if (hasOpenAI) {
      return { provider: 'openai', modelId: 'gpt-4o-mini', apiKey: process.env.OPENAI_API_KEY! }
    }
  }

  // Standard + Heavy tasks: use Claude CLI (best quality, your subscription)
  // Only light background tasks go to OpenRouter to save limits
  if (hasClaudeCli) {
    return { provider: 'claude-cli', modelId: 'claude-sonnet-4-20250514', apiKey: process.env.ANTHROPIC_API_KEY! }
  }

  // Final fallbacks
  if (hasAnthropicApi) {
    return { provider: 'anthropic', modelId: 'claude-sonnet-4-20250514', apiKey: process.env.ANTHROPIC_API_KEY! }
  }
  if (hasOpenAI) {
    return { provider: 'openai', modelId: 'gpt-4o', apiKey: process.env.OPENAI_API_KEY! }
  }
  if (hasOpenRouter) {
    return {
      provider: 'openrouter',
      modelId: 'anthropic/claude-sonnet-4',
      apiKey: process.env.OPENROUTER_API_KEY!,
      baseUrl: 'https://openrouter.ai/api/v1',
    }
  }

  // Nothing configured
  return { provider: 'anthropic', modelId: 'claude-sonnet-4-20250514', apiKey: '' }
}

// ============================================================
// PROVIDER FALLBACK CHAIN
// ============================================================

/**
 * Returns an ordered list of ModelConfigs to try, based on what's configured.
 * Primary provider first, then fallbacks. Used by the agent loop when the
 * primary provider fails all retries.
 */
export function resolveSmartModelConfigChain(
  complexity: TaskComplexity = 'standard',
  options?: { needsToolCalling?: boolean }
): ModelConfig[] {
  const primary = resolveSmartModelConfig(complexity, options)
  const chain: ModelConfig[] = [primary]

  const hasOpenRouter = !!process.env.OPENROUTER_API_KEY
  const hasOpenAI = !!process.env.OPENAI_API_KEY
  const hasAnthropicApi = !!(process.env.ANTHROPIC_API_KEY) && !(process.env.ANTHROPIC_API_KEY ?? '').startsWith('sk-ant-oat01-')

  const isLightTier = complexity === 'light' || complexity === 'acknowledgment'
  const modelForComplexity = isLightTier
    ? { anthropic: 'claude-haiku-4-20250514', openrouter: 'anthropic/claude-haiku-4.5', openai: 'gpt-4o-mini' }
    : { anthropic: 'claude-sonnet-4-20250514', openrouter: 'anthropic/claude-sonnet-4', openai: 'gpt-4o' }

  // Add fallbacks that aren't the same provider as primary
  if (primary.provider !== 'anthropic' && hasAnthropicApi) {
    chain.push({
      provider: 'anthropic',
      modelId: modelForComplexity.anthropic,
      apiKey: process.env.ANTHROPIC_API_KEY!,
    })
  }
  if (primary.provider !== 'openrouter' && hasOpenRouter) {
    chain.push({
      provider: 'openrouter',
      modelId: modelForComplexity.openrouter,
      apiKey: process.env.OPENROUTER_API_KEY!,
      baseUrl: 'https://openrouter.ai/api/v1',
    })
  }
  if (primary.provider !== 'openai' && hasOpenAI) {
    chain.push({
      provider: 'openai',
      modelId: modelForComplexity.openai,
      apiKey: process.env.OPENAI_API_KEY!,
    })
  }

  return chain
}

// ============================================================
// CONFIG HELPERS
// ============================================================

export function resolveModelConfig(modelId?: string): ModelConfig {
  const id = modelId ?? process.env.BLADE_MODEL ?? 'claude-sonnet-4-20250514'

  // Detect OAuth subscription tokens — route through Claude CLI
  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  if (apiKey.startsWith('sk-ant-oat01-')) {
    return {
      provider: 'claude-cli',
      modelId: id,
      apiKey,
    }
  }

  // Detect provider from model name
  if (id.startsWith('claude-') || id.startsWith('claude3')) {
    return {
      provider: 'anthropic',
      modelId: id,
      apiKey,
    }
  }

  if (id.startsWith('gpt-') || id.startsWith('o3') || id.startsWith('o1')) {
    return {
      provider: 'openai',
      modelId: id,
      apiKey: process.env.OPENAI_API_KEY ?? '',
    }
  }

  if (id.startsWith('gemini-')) {
    return {
      provider: 'gemini-cli',
      modelId: id,
      apiKey: process.env.GEMINI_API_KEY ?? '',
    }
  }

  // Default: try OpenRouter
  return {
    provider: 'openrouter',
    modelId: id,
    apiKey: process.env.OPENROUTER_API_KEY ?? '',
    baseUrl: 'https://openrouter.ai/api/v1',
  }
}
