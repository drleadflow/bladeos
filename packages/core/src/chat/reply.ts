import { logger } from '@blade/shared'
import { runAgentLoop } from '../agent-loop.js'
import { callModel, resolveSmartModelConfig } from '../model-provider.js'
import type {
  AgentLoopOptions,
  AgentLoopResult,
  AgentMessage,
} from '../types.js'

function extractTextFromTurn(result: AgentLoopResult, turnIndex: number): string {
  const turn = result.turns[turnIndex]
  if (!turn) return ''

  return turn.response.content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim()
}

export function extractBestResponseText(result: AgentLoopResult): string {
  if (result.finalResponse.trim()) {
    return result.finalResponse.trim()
  }

  for (let i = result.turns.length - 1; i >= 0; i--) {
    const text = extractTextFromTurn(result, i)
    if (text) {
      return text
    }
  }

  return ''
}

async function summarizeToolResults(
  systemPrompt: string,
  history: AgentMessage[],
  result: AgentLoopResult
): Promise<string> {
  const toolSummary = result.turns
    .flatMap((turn) => turn.toolCalls)
    .map((toolCall) =>
      `- ${toolCall.toolName}: ${toolCall.success ? toolCall.display?.slice(0, 300) : 'failed'}`
    )
    .join('\n')

  if (!toolSummary) return ''

  const summaryMessages: AgentMessage[] = [
    ...history,
    {
      role: 'user',
      content:
        `Based on the tool results above, provide a concise response to the user. ` +
        `Here is what the tools returned:\n\n${toolSummary}\n\n` +
        'Respond naturally as Blade. Do NOT use markdown. Be concise.',
    },
  ]

  try {
    const config = resolveSmartModelConfig('light')
    if (!config.apiKey) return ''

    const response = await callModel(config, systemPrompt, summaryMessages, [], 1024)
    return response.content
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim()
  } catch (error) {
    logger.error(
      'ChatReply',
      `Summarization failed: ${error instanceof Error ? error.message : String(error)}`
    )
    return ''
  }
}

export interface ConversationReplyResult {
  responseText: string
  result: AgentLoopResult
}

export async function runConversationReply(
  options: Omit<AgentLoopOptions, 'streaming' | 'onTextDelta'> & {
    fallbackText: string
    responseLabel?: string
  }
): Promise<ConversationReplyResult> {
  const { systemPrompt, messages, tools, context, fallbackText, responseLabel = 'response' } = options

  const result = await runAgentLoop({
    ...options,
    systemPrompt,
    messages,
    tools,
    context,
  })

  logger.info(
    'ChatReply',
    `${responseLabel}: turns=${result.turns.length} cost=$${result.totalCost.toFixed(4)} ` +
      `stopReason=${result.stopReason} responseLen=${result.finalResponse.length}`
  )

  let responseText = extractBestResponseText(result)

  if (!responseText && result.turns.some((turn) => turn.toolCalls.length > 0)) {
    logger.info('ChatReply', `${responseLabel}: empty response after tool use, running summarization`)
    responseText = await summarizeToolResults(systemPrompt, messages, result)
  }

  if (!responseText) {
    responseText = fallbackText
  }

  return { responseText, result }
}
