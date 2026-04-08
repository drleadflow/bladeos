import Anthropic from '@anthropic-ai/sdk'
import type { ToolDefinition, ModelConfig, ModelResponse, ContentBlock } from './types.js'
import type { AgentMessage } from './types.js'
import { logger } from '@blade/shared'

// ============================================================
// ANTHROPIC PROVIDER
// ============================================================

function createAnthropicClient(config: ModelConfig): Anthropic {
  return new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  })
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

export async function callModel(
  config: ModelConfig,
  systemPrompt: string,
  messages: AgentMessage[],
  tools: ToolDefinition[],
  maxTokens?: number
): Promise<ModelResponse> {
  if (config.provider === 'anthropic' || config.provider === 'openrouter') {
    const client = createAnthropicClient(config)

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

  throw new Error(`Provider "${config.provider}" not yet supported. Use "anthropic" or "openrouter".`)
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
  if (config.provider !== 'anthropic' && config.provider !== 'openrouter') {
    throw new Error(`Streaming not supported for provider "${config.provider}"`)
  }

  const client = createAnthropicClient(config)

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

// ============================================================
// CONFIG HELPERS
// ============================================================

export function resolveModelConfig(modelId?: string): ModelConfig {
  const id = modelId ?? process.env.BLADE_MODEL ?? 'claude-sonnet-4-20250514'

  // Detect provider from model name
  if (id.startsWith('claude-') || id.startsWith('claude3')) {
    return {
      provider: 'anthropic',
      modelId: id,
      apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    }
  }

  if (id.startsWith('gpt-') || id.startsWith('o3') || id.startsWith('o1')) {
    return {
      provider: 'openai',
      modelId: id,
      apiKey: process.env.OPENAI_API_KEY ?? '',
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
