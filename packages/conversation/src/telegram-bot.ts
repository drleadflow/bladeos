import TelegramBot from 'node-telegram-bot-api'
import { initializeDb, memories, costEntries, activityEvents } from '@blade/db'
import {
  createExecutionAPI,
  loadPersonality,
  retrieveRelevant,
  speechToText,
  textToSpeech,
} from '@blade/core'
import { logger } from '@blade/shared'
import { createConversationEngine } from './engine.js'
import { TelegramAdapter } from './adapters/telegram.js'

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
const forceNewConversation = new Set<string>()
const chatConversations = new Map<string, string>()

const executionApi = createExecutionAPI()
const conversationEngine = createConversationEngine(executionApi, {
  retrieveMemories: async (query: string) => {
    const ranked = retrieveRelevant(query, 8)
    if (ranked.length === 0) return ''

    return ranked
      .map((memory, index) => {
        const tags = memory.tags.length > 0 ? ` [tags: ${memory.tags.join(', ')}]` : ''
        return `${index + 1}. (${memory.type}) ${memory.content}${tags}`
      })
      .join('\n')
  },
})
const telegramAdapter = new TelegramAdapter()

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

function cleanResponse(text: string): string {
  let cleaned = telegramAdapter.formatResponse(text)
  cleaned = cleaned.replace(/Claude Code finished in.*\n?/gi, '')
  cleaned = cleaned.replace(/Reason: ?(completed|end_turn|tool_use|max_iterations|error|success).*\n?/gi, '')
  cleaned = cleaned.replace(/^Claude Code.*$/gmi, '')
  cleaned = cleaned.replace(/^Blade Super Agent.*completed.*$/gmi, '')
  cleaned = cleaned.replace(/\bfinished in\b.*\n?/gi, '')
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim()
  return cleaned
}

function splitMessage(text: string): string[] {
  if (text.length <= TELEGRAM_MAX_MESSAGE_LENGTH) return [text]

  const chunks: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= TELEGRAM_MAX_MESSAGE_LENGTH) {
      chunks.push(remaining)
      break
    }

    let splitIndex = remaining.lastIndexOf('\n', TELEGRAM_MAX_MESSAGE_LENGTH)
    if (splitIndex === -1 || splitIndex < TELEGRAM_MAX_MESSAGE_LENGTH / 2) {
      splitIndex = TELEGRAM_MAX_MESSAGE_LENGTH
    }

    chunks.push(remaining.slice(0, splitIndex))
    remaining = remaining.slice(splitIndex).trimStart()
  }

  return chunks
}

function telegramPrompt(): string {
  const personality = loadPersonality()
  return personality ? `${personality}\n\n${SYSTEM_PROMPT}` : SYSTEM_PROMPT
}

function getOrCreateConversation(chatId: string): string {
  if (forceNewConversation.has(chatId)) {
    forceNewConversation.delete(chatId)
    const conversationId = conversationEngine.startConversation('telegram', `Telegram chat ${chatId}`)
    conversationEngine.linkChannel(conversationId, chatId, 'telegram')
    chatConversations.set(chatId, conversationId)
    evictOldest(chatConversations, MAX_CACHED_CHATS)
    return conversationId
  }

  const cached = chatConversations.get(chatId)
  if (cached) return cached

  const fromDb = conversationEngine.findByChannel(chatId, 'telegram')
  if (fromDb) {
    chatConversations.set(chatId, fromDb)
    evictOldest(chatConversations, MAX_CACHED_CHATS)
    return fromDb
  }

  const conversationId = conversationEngine.startConversation('telegram', `Telegram chat ${chatId}`)
  conversationEngine.linkChannel(conversationId, chatId, 'telegram')
  chatConversations.set(chatId, conversationId)
  evictOldest(chatConversations, MAX_CACHED_CHATS)
  return conversationId
}

function clip(text: string, max = 120): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function recordLocalEvent(params: {
  chatId: string
  conversationId: string
  eventType: string
  summary: string
  detail?: unknown
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
    })
  } catch {
    // best effort only
  }
}

async function sendResponse(bot: TelegramBot, chatId: number, text: string): Promise<void> {
  for (const chunk of splitMessage(text)) {
    await bot.sendMessage(chatId, chunk)
  }
}

async function runTelegramReply(params: {
  bot: TelegramBot
  chatId: string
  userText: string
  sendVoiceReply?: boolean
}): Promise<void> {
  const { bot, chatId, userText, sendVoiceReply = false } = params
  const conversationId = getOrCreateConversation(chatId)
  const request = telegramAdapter.parseIncoming({
    chatId,
    text: userText,
    isVoice: sendVoiceReply,
    voiceTranscript: sendVoiceReply ? userText : undefined,
  })

  if (!request) {
    throw new Error('Failed to parse Telegram request')
  }

  recordLocalEvent({
    chatId,
    conversationId,
    eventType: 'conversation',
    summary: `Telegram request: ${clip(userText, 90)}`,
    detail: { channel: 'telegram', voice: sendVoiceReply },
  })

  await bot.sendChatAction(Number(chatId), 'typing')

  const responseText = await telegramAdapter.deliver(
    conversationEngine.reply({
      ...request,
      conversationId,
      systemPromptOverride: telegramPrompt(),
    }),
    {
      destination: chatId,
      conversationId,
    }
  )

  const cleaned = cleanResponse(
    responseText || 'I processed your request but couldn\'t generate a response. Could you try rephrasing?'
  )

  await sendResponse(bot, Number(chatId), cleaned)

  if (sendVoiceReply) {
    try {
      const voiceBuffer = await textToSpeech(cleaned.slice(0, 2000))
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
}

export function startTelegramBot(token: string, allowedChatIds?: string[]): TelegramBot {
  initializeDb()

  const bot = new TelegramBot(token, { polling: true })
  const allowedSet =
    allowedChatIds && allowedChatIds.length > 0
      ? new Set(allowedChatIds)
      : null

  logger.info('Telegram', 'Telegram bot starting...')

  function isAllowed(chatId: number): boolean {
    if (!allowedSet) return true
    return allowedSet.has(String(chatId))
  }

  bot.onText(/\/start/, async (msg) => {
    if (!isAllowed(msg.chat.id)) return

    try {
      await bot.sendMessage(
        msg.chat.id,
        '⚔️ Blade Super Agent\n\nI\'m Blade, your AI assistant. Send me a message and I\'ll help you out.\n\nCommands:\n/help — List commands\n/memory — View recent memories\n/costs — View cost summary\n/new — Start a new conversation'
      )
    } catch (err) {
      logger.error('Telegram', `/start error: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  bot.onText(/\/help/, async (msg) => {
    if (!isAllowed(msg.chat.id)) return

    try {
      await bot.sendMessage(
        msg.chat.id,
        '⚔️ Blade Commands\n\n' +
          '/start — Welcome message\n' +
          '/help — This help text\n' +
          '/memory — View recent memories\n' +
          '/costs — View cost summary\n' +
          '/new — Start a new conversation\n\n' +
          'Or just send me a text message to chat!'
      )
    } catch (err) {
      logger.error('Telegram', `/help error: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  bot.onText(/\/memory/, async (msg) => {
    if (!isAllowed(msg.chat.id)) return

    try {
      const allMemories = memories.getAll(10) as Array<{ content: string; type: string; confidence: number }>
      if (allMemories.length === 0) {
        await bot.sendMessage(msg.chat.id, 'No memories stored yet.')
        return
      }

      const lines = allMemories.map(
        (memory, index) =>
          `${index + 1}. [${memory.type}] ${memory.content} (confidence: ${(memory.confidence * 100).toFixed(0)}%)`
      )
      await sendResponse(bot, msg.chat.id, `Recent Memories\n\n${lines.join('\n')}`)
    } catch (err) {
      logger.error('Telegram', `/memory error: ${err instanceof Error ? err.message : String(err)}`)
      await bot.sendMessage(msg.chat.id, 'Failed to retrieve memories.').catch(() => {})
    }
  })

  bot.onText(/\/costs/, async (msg) => {
    if (!isAllowed(msg.chat.id)) return

    try {
      const summary = costEntries.summary(30)
      const modelLines = Object.entries(summary.byModel)
        .map(([model, cost]) => `  ${model}: $${cost.toFixed(4)}`)
        .join('\n')

      const text = [
        'Cost Summary (30 days)',
        '',
        `Total: $${summary.totalUsd.toFixed(4)}`,
        `Tokens: ${summary.tokenCount.input.toLocaleString()} in / ${summary.tokenCount.output.toLocaleString()} out`,
        modelLines ? `\nBy model:\n${modelLines}` : '',
      ].join('\n')

      await sendResponse(bot, msg.chat.id, text)
    } catch (err) {
      logger.error('Telegram', `/costs error: ${err instanceof Error ? err.message : String(err)}`)
      await bot.sendMessage(msg.chat.id, 'Failed to retrieve cost summary.').catch(() => {})
    }
  })

  bot.onText(/\/new/, async (msg) => {
    if (!isAllowed(msg.chat.id)) return

    const chatId = String(msg.chat.id)
    chatConversations.delete(chatId)
    forceNewConversation.add(chatId)

    try {
      await bot.sendMessage(msg.chat.id, 'New conversation started. Send me a message!')
    } catch (err) {
      logger.error('Telegram', `/new error: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  bot.on('voice', async (msg) => {
    if (!isAllowed(msg.chat.id)) return

    const chatId = String(msg.chat.id)

    try {
      await bot.sendMessage(msg.chat.id, 'Transcribing...')
      const fileLink = await bot.getFileLink(msg.voice!.file_id)
      const audioResponse = await fetch(fileLink)
      if (!audioResponse.ok) {
        throw new Error(`Failed to download voice file: ${audioResponse.status}`)
      }

      const audioBuffer = Buffer.from(await audioResponse.arrayBuffer())
      const transcript = await speechToText(audioBuffer)
      if (!transcript.trim()) {
        await bot.sendMessage(msg.chat.id, 'Could not transcribe the voice message. Please try again.')
        return
      }

      await bot.sendMessage(msg.chat.id, `Heard: ${transcript}`)

      recordLocalEvent({
        chatId,
        conversationId: getOrCreateConversation(chatId),
        eventType: 'conversation',
        summary: `Voice transcribed: ${clip(transcript, 90)}`,
        detail: { channel: 'telegram', source: 'voice' },
      })

      await runTelegramReply({
        bot,
        chatId,
        userText: transcript,
        sendVoiceReply: true,
      })
    } catch (err) {
      logger.error('Telegram', `Voice error: ${err instanceof Error ? err.message : String(err)}`)
      await bot.sendMessage(msg.chat.id, `Voice error: ${String(err).slice(0, 200)}`).catch(() => {})
    }
  })

  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return
    if (!isAllowed(msg.chat.id)) return

    try {
      await runTelegramReply({
        bot,
        chatId: String(msg.chat.id),
        userText: msg.text.trim(),
      })
    } catch (err) {
      logger.error('Telegram', `Message error: ${err instanceof Error ? err.message : String(err)}`)
      await bot.sendMessage(msg.chat.id, `Error: ${String(err).slice(0, 200)}`).catch(() => {})
    }
  })

  bot.on('polling_error', (err) => {
    logger.error('Telegram', `Polling error: ${err instanceof Error ? err.message : String(err)}`)
  })

  logger.info('Telegram', 'Telegram bot started successfully')
  return bot
}

export { cleanResponse, splitMessage }
