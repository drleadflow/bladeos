import TelegramBot from 'node-telegram-bot-api'
import { initializeDb, conversations, messages, memories, costEntries, activityEvents } from '@blade/db'
import { getAllToolDefinitions, buildMemoryAugmentedPrompt, runConversationReply, calculateCost, loadPersonality } from '../index.js'
import { resolveSmartModelConfig } from '../model-provider.js'
import type { AgentLoopResult, AgentMessage, ExecutionContext } from '../types.js'
import { logger } from '@blade/shared'
import { speechToText } from '../voice/deepgram-stt.js'
import { textToSpeech } from '../voice/cartesia-tts.js'

const TELEGRAM_MAX_MESSAGE_LENGTH = 4096

const SYSTEM_PROMPT = `You are Blade, an AI super agent built by Blade Labs. You are helpful, direct, and capable.

You have access to tools for memory management, file operations, and command execution.

Key behaviors:
- When the user tells you a preference or important fact, save it to memory using save_memory.
- When a topic comes up that you might have prior context on, use recall_memory to check.
- Be concise but thorough. Show your work when using tools.
- Track what works and what doesn't — you get better over time.

You are communicating via Telegram. IMPORTANT formatting rules:
- Keep responses concise for mobile reading.
- Do NOT use markdown formatting (no **bold**, no *italic*, no ## headers, no \`code blocks\`).
- Write in plain text only. Use emojis sparingly for emphasis instead of markdown.
- Be conversational and natural, like texting a friend who happens to be incredibly capable.
- Never mention Claude, Claude Code, or any internal system details.
- You are Blade. That's it.`

const MAX_CACHED_CHATS = 100
const MAX_HISTORY_LENGTH = 50
const TELEGRAM_FALLBACK_RESPONSE = 'I processed your request but couldn\'t generate a response. Could you try rephrasing?'

/**
 * Look up the conversation ID for a Telegram chat from the DB.
 * Conversations are stored with title 'Telegram chat {chatId}'.
 */
function findConversationForChat(chatId: string): string | undefined {
  const title = `Telegram chat ${chatId}`
  const allConvs = conversations.list(200)
  const match = allConvs.find(c => c.title === title)
  return match?.id
}

/**
 * Load message history for a conversation from the DB.
 */
function loadHistoryFromDb(conversationId: string): AgentMessage[] {
  const dbMessages = messages.listByConversation(conversationId)
  return dbMessages.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))
}

/**
 * Clean up agent response for Telegram — strip internal metadata, markdown, system messages.
 */
export function cleanResponse(text: string): string {
  let cleaned = text
  // Remove all Claude/system metadata
  cleaned = cleaned.replace(/Claude Code finished in.*\n?/gi, '')
  cleaned = cleaned.replace(/Reason: ?(completed|end_turn|tool_use|error|success).*\n?/gi, '')
  cleaned = cleaned.replace(/^Claude Code.*$/gmi, '')
  cleaned = cleaned.replace(/^Blade Super Agent.*completed.*$/gmi, '')
  cleaned = cleaned.replace(/\bfinished in\b.*\n?/gi, '')
  // Remove markdown formatting
  cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, '$1')
  cleaned = cleaned.replace(/\*(.*?)\*/g, '$1')
  cleaned = cleaned.replace(/#{1,6}\s/g, '')
  cleaned = cleaned.replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/g, '').trim())
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1')
  // Clean up whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim()
  return cleaned
}

/**
 * Split a long message into chunks that respect Telegram's 4096 character limit.
 * Splits on newline boundaries when possible.
 */
export function splitMessage(text: string): string[] {
  if (text.length <= TELEGRAM_MAX_MESSAGE_LENGTH) {
    return [text]
  }

  const chunks: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= TELEGRAM_MAX_MESSAGE_LENGTH) {
      chunks.push(remaining)
      break
    }

    // Find the last newline within the limit
    let splitIndex = remaining.lastIndexOf('\n', TELEGRAM_MAX_MESSAGE_LENGTH)
    if (splitIndex === -1 || splitIndex < TELEGRAM_MAX_MESSAGE_LENGTH / 2) {
      // Fall back to splitting at the limit if no good newline found
      splitIndex = TELEGRAM_MAX_MESSAGE_LENGTH
    }

    chunks.push(remaining.slice(0, splitIndex))
    remaining = remaining.slice(splitIndex).trimStart()
  }

  return chunks
}

/**
 * Evict the oldest entry from a Map if it exceeds maxSize.
 * Maps iterate in insertion order, so the first key is the oldest.
 */
function evictOldest<K, V>(map: Map<K, V>, maxSize: number): void {
  while (map.size > maxSize) {
    const oldest = map.keys().next().value
    if (oldest !== undefined) {
      map.delete(oldest)
    } else {
      break
    }
  }
}

/** In-memory caches that hydrate from DB on first access */
const chatConversations = new Map<string, string>()
const chatHistories = new Map<string, AgentMessage[]>()

/**
 * Get or create a conversation for a given Telegram chat ID.
 * Checks DB first, then in-memory cache, then creates new.
 */
function getOrCreateConversation(chatId: string): string {
  // Check cache
  const cached = chatConversations.get(chatId)
  if (cached) return cached

  // Check DB
  const fromDb = findConversationForChat(chatId)
  if (fromDb) {
    chatConversations.set(chatId, fromDb)
    chatHistories.set(chatId, loadHistoryFromDb(fromDb))
    evictOldest(chatConversations, MAX_CACHED_CHATS)
    evictOldest(chatHistories, MAX_CACHED_CHATS)
    return fromDb
  }

  // Create new
  const conv = conversations.create(`Telegram chat ${chatId}`)
  chatConversations.set(chatId, conv.id)
  chatHistories.set(chatId, [])
  evictOldest(chatConversations, MAX_CACHED_CHATS)
  evictOldest(chatHistories, MAX_CACHED_CHATS)
  return conv.id
}

function trimHistory(history: AgentMessage[]): AgentMessage[] {
  return history.length > MAX_HISTORY_LENGTH ? history.slice(-MAX_HISTORY_LENGTH) : history
}

function cacheHistory(chatId: string, history: AgentMessage[]): void {
  chatHistories.set(chatId, trimHistory(history))
  evictOldest(chatHistories, MAX_CACHED_CHATS)
}

function clip(text: string, max = 120): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function buildTelegramPrompt(userText: string): string {
  const base = buildMemoryAugmentedPrompt(SYSTEM_PROMPT, userText)
  const personality = loadPersonality()
  return personality ? `${personality}\n\n${base}` : base
}

function getTokenTotals(result: AgentLoopResult): { inputTokens: number; outputTokens: number } {
  return result.turns.reduce(
    (totals, turn) => ({
      inputTokens: totals.inputTokens + turn.response.inputTokens,
      outputTokens: totals.outputTokens + turn.response.outputTokens,
    }),
    { inputTokens: 0, outputTokens: 0 }
  )
}

function recordTelegramActivity(params: {
  chatId: string
  conversationId: string
  eventType: string
  summary: string
  detail?: unknown
  costUsd?: number
}): void {
  try {
    activityEvents.emit({
      eventType: params.eventType,
      actorType: 'system',
      actorId: `telegram:${params.chatId}`,
      summary: params.summary,
      detail: params.detail,
      targetType: 'conversation',
      targetId: params.conversationId,
      conversationId: params.conversationId,
      costUsd: params.costUsd,
    })
  } catch {
    // Activity logging should never break the bot path.
  }
}

async function executeTelegramConversation(params: {
  bot: TelegramBot
  chatId: string
  userText: string
  sendVoiceReply?: boolean
}): Promise<void> {
  const { bot, chatId, userText, sendVoiceReply = false } = params
  const conversationId = getOrCreateConversation(chatId)
  const history = [...(chatHistories.get(chatId) ?? [])]
  const tools = getAllToolDefinitions()
  const augmentedPrompt = buildTelegramPrompt(userText)

  history.push({ role: 'user', content: userText })

  messages.create({
    conversationId,
    role: 'user',
    content: userText,
  })

  recordTelegramActivity({
    chatId,
    conversationId,
    eventType: 'conversation',
    summary: `Telegram request: ${clip(userText, 90)}`,
    detail: { channel: 'telegram', sendVoiceReply },
  })

  const modelConfig = resolveSmartModelConfig('standard', { needsToolCalling: true })
  const context: ExecutionContext = {
    conversationId,
    userId: `telegram-${chatId}`,
    modelId: modelConfig.modelId,
    modelConfig,
    maxIterations: 15,
    costBudget: 0,
  }

  await bot.sendChatAction(Number(chatId), 'typing')

  const { responseText, result } = await runConversationReply({
    systemPrompt: augmentedPrompt,
    messages: history,
    tools,
    context,
    fallbackText: TELEGRAM_FALLBACK_RESPONSE,
    responseLabel: sendVoiceReply ? 'telegram voice response' : 'telegram text response',
  })

  const cleanedResponse = cleanResponse(responseText || TELEGRAM_FALLBACK_RESPONSE)

  for (const chunk of splitMessage(cleanedResponse)) {
    await bot.sendMessage(Number(chatId), chunk)
  }

  if (sendVoiceReply) {
    try {
      const voiceBuffer = await textToSpeech(cleanedResponse.slice(0, 2000))
      await bot.sendVoice(
        Number(chatId),
        voiceBuffer,
        {},
        { filename: 'response.mp3', contentType: 'audio/mpeg' }
      )
    } catch (ttsErr) {
      logger.error('Telegram', `TTS reply error: ${ttsErr instanceof Error ? ttsErr.message : String(ttsErr)}`)
    }
  }

  history.push({ role: 'assistant', content: cleanedResponse })
  cacheHistory(chatId, history)

  const tokenTotals = getTokenTotals(result)
  messages.create({
    conversationId,
    role: 'assistant',
    content: cleanedResponse,
    model: modelConfig.modelId,
    inputTokens: tokenTotals.inputTokens,
    outputTokens: tokenTotals.outputTokens,
  })

  if (tokenTotals.inputTokens > 0 || tokenTotals.outputTokens > 0) {
    const cost = calculateCost(modelConfig.modelId, tokenTotals.inputTokens, tokenTotals.outputTokens)
    costEntries.record({
      ...cost,
      conversationId,
    })
  }

  for (const turn of result.turns) {
    for (const toolCall of turn.toolCalls) {
      recordTelegramActivity({
        chatId,
        conversationId,
        eventType: 'tool_call',
        summary: `Telegram tool: ${toolCall.toolName} ${toolCall.success ? '✓' : '✗'}`,
        detail: {
          toolName: toolCall.toolName,
          success: toolCall.success,
          durationMs: toolCall.durationMs,
        },
      })
    }
  }

  recordTelegramActivity({
    chatId,
    conversationId,
    eventType: 'conversation_reply',
    summary: `Telegram reply: ${clip(cleanedResponse, 100)}`,
    detail: {
      stopReason: result.stopReason,
      toolCalls: result.totalToolCalls,
      sendVoiceReply,
    },
    costUsd: result.totalCost,
  })
}

/**
 * Start the Telegram bot integration for Blade Super Agent.
 *
 * @param token - Telegram Bot API token from BotFather
 * @param allowedChatIds - Optional list of chat IDs that are allowed to use the bot.
 *   If empty or undefined, all chats are allowed.
 */
export function startTelegramBot(token: string, allowedChatIds?: string[]): TelegramBot {
  initializeDb()

  const bot = new TelegramBot(token, { polling: true })
  const allowedSet = allowedChatIds && allowedChatIds.length > 0
    ? new Set(allowedChatIds)
    : null

  logger.info('Telegram', 'Telegram bot starting...')

  function isAllowed(chatId: number): boolean {
    if (!allowedSet) return true
    return allowedSet.has(String(chatId))
  }

  // /start command
  bot.onText(/\/start/, async (msg) => {
    if (!isAllowed(msg.chat.id)) return

    try {
      await bot.sendMessage(
        msg.chat.id,
        '⚔️ *Blade Super Agent*\n\nI\'m Blade, your AI assistant. Send me a message and I\'ll help you out.\n\nCommands:\n/help — List commands\n/memory — View recent memories\n/costs — View cost summary\n/new — Start a new conversation',
        { parse_mode: 'Markdown' }
      )
    } catch (err) {
      logger.error('Telegram', `/start error: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  // /help command
  bot.onText(/\/help/, async (msg) => {
    if (!isAllowed(msg.chat.id)) return

    try {
      await bot.sendMessage(
        msg.chat.id,
        '⚔️ *Blade Commands*\n\n' +
        '/start — Welcome message\n' +
        '/help — This help text\n' +
        '/memory — View recent memories\n' +
        '/costs — View cost summary\n' +
        '/new — Start a new conversation\n\n' +
        'Or just send me a text message to chat!',
        { parse_mode: 'Markdown' }
      )
    } catch (err) {
      logger.error('Telegram', `/help error: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  // /memory command
  bot.onText(/\/memory/, async (msg) => {
    if (!isAllowed(msg.chat.id)) return

    try {
      const allMemories = memories.getAll(10) as Array<{ content: string; type: string; confidence: number }>
      if (allMemories.length === 0) {
        await bot.sendMessage(msg.chat.id, 'No memories stored yet.')
        return
      }

      const lines = allMemories.map(
        (m, i) => `${i + 1}. [${m.type}] ${m.content} (confidence: ${(m.confidence * 100).toFixed(0)}%)`
      )
      const text = '🧠 *Recent Memories*\n\n' + lines.join('\n')

      for (const chunk of splitMessage(text)) {
        await bot.sendMessage(msg.chat.id, chunk)
      }
    } catch (err) {
      logger.error('Telegram', `/memory error: ${err instanceof Error ? err.message : String(err)}`)
      await bot.sendMessage(msg.chat.id, 'Failed to retrieve memories.').catch(() => {})
    }
  })

  // /costs command
  bot.onText(/\/costs/, async (msg) => {
    if (!isAllowed(msg.chat.id)) return

    try {
      const summary = costEntries.summary(30)
      const modelLines = Object.entries(summary.byModel)
        .map(([model, cost]) => `  ${model}: $${cost.toFixed(4)}`)
        .join('\n')

      const text = [
        '💰 *Cost Summary (30 days)*',
        '',
        `Total: $${summary.totalUsd.toFixed(4)}`,
        `Tokens: ${summary.tokenCount.input.toLocaleString()} in / ${summary.tokenCount.output.toLocaleString()} out`,
        modelLines ? `\nBy model:\n${modelLines}` : '',
      ].join('\n')

      await bot.sendMessage(msg.chat.id, text)
    } catch (err) {
      logger.error('Telegram', `/costs error: ${err instanceof Error ? err.message : String(err)}`)
      await bot.sendMessage(msg.chat.id, 'Failed to retrieve cost summary.').catch(() => {})
    }
  })

  // /new command — start new conversation
  bot.onText(/\/new/, async (msg) => {
    if (!isAllowed(msg.chat.id)) return

    try {
      const chatId = String(msg.chat.id)
      chatConversations.delete(chatId)
      chatHistories.delete(chatId)
      await bot.sendMessage(msg.chat.id, '🔄 New conversation started. Send me a message!')
    } catch (err) {
      logger.error('Telegram', `/new error: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  // Voice message handler
  bot.on('voice', async (msg) => {
    if (!isAllowed(msg.chat.id)) return

    const chatId = String(msg.chat.id)

    try {
      await bot.sendMessage(msg.chat.id, '🎤 Transcribing...')

      // 1. Download the voice file from Telegram
      const fileLink = await bot.getFileLink(msg.voice!.file_id)
      const audioResponse = await fetch(fileLink)
      if (!audioResponse.ok) {
        throw new Error(`Failed to download voice file: ${audioResponse.status}`)
      }
      const audioBuffer = Buffer.from(await audioResponse.arrayBuffer())

      // 2. Transcribe with Deepgram
      const transcript = await speechToText(audioBuffer)

      if (!transcript.trim()) {
        await bot.sendMessage(msg.chat.id, 'Could not transcribe the voice message. Please try again.')
        return
      }

      await bot.sendMessage(msg.chat.id, `📝 Heard: ${transcript}`)
      recordTelegramActivity({
        chatId,
        conversationId: getOrCreateConversation(chatId),
        eventType: 'conversation',
        summary: `Voice transcribed: ${clip(transcript, 90)}`,
        detail: { channel: 'telegram', source: 'voice' },
      })

      await executeTelegramConversation({
        bot,
        chatId,
        userText: transcript,
        sendVoiceReply: true,
      })

      // Award XP for voice interaction (extra XP on top of conversation)
      try {
        const { awardXP, XP_AWARDS } = await import('../gamification/index.js')
        awardXP({ action: 'completed_task', xp: XP_AWARDS.completed_task })
        awardXP({ action: 'first_tool_use_of_day', xp: XP_AWARDS.first_tool_use_of_day })
      } catch { /* gamification not ready */ }

    } catch (err) {
      logger.error('Telegram', `Voice error: ${err instanceof Error ? err.message : String(err)}`)
      try {
        const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred'
        await bot.sendMessage(msg.chat.id, `❌ Voice error: ${errorMsg.slice(0, 200)}`)
      } catch {
        // Last resort
      }
    }
  })

  // Text message handler (main chat logic)
  bot.on('message', async (msg) => {
    // Skip commands — they are handled above
    if (!msg.text || msg.text.startsWith('/')) return
    if (!isAllowed(msg.chat.id)) return

    const chatId = String(msg.chat.id)
    const userText = msg.text.trim()

    if (!userText) return

    try {
      await executeTelegramConversation({
        bot,
        chatId,
        userText,
      })

      // Award XP for Telegram conversation
      try {
        const { awardXP, XP_AWARDS } = await import('../gamification/index.js')
        awardXP({ action: 'completed_task', xp: XP_AWARDS.completed_task })
      } catch { /* gamification not ready */ }

    } catch (err) {
      logger.error('Telegram', `Message error: ${err instanceof Error ? err.message : String(err)}`)
      try {
        const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred'
        await bot.sendMessage(
          msg.chat.id,
          `❌ Error: ${errorMsg.slice(0, 200)}`
        )
      } catch {
        // Last resort — can't even send the error message
      }
    }
  })

  // Handle polling errors gracefully
  bot.on('polling_error', (err) => {
    logger.error('Telegram', `Polling error: ${err instanceof Error ? err.message : String(err)}`)
  })

  logger.info('Telegram', 'Telegram bot started successfully')

  return bot
}
