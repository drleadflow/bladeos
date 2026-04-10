import TelegramBot from 'node-telegram-bot-api'
import { initializeDb, memories, costEntries, activityEvents } from '@blade/db'
import {
  createExecutionAPI,
  loadPersonality,
  speechToText,
  textToSpeech,
} from '@blade/core'
import { logger } from '@blade/shared'
import { createConversationEngine } from './engine.js'
import { TelegramAdapter } from './adapters/telegram.js'

const TELEGRAM_MAX_MESSAGE_LENGTH = 4096
const REPLY_TIMEOUT_MS = 90_000
const SEND_MAX_RETRIES = 3
const SEND_RETRY_DELAYS_MS = [1000, 2000, 4000]

// Per-chat concurrency lock — prevents simultaneous processing for the same chat
const activeChatReplies = new Map<string, Promise<void>>()
// Queue: if a message arrives while one is processing, hold the latest
const pendingMessages = new Map<string, { text: string; resolve: () => void }>()

const SYSTEM_PROMPT = `You are Blade, an AI super agent built by Blade Labs. You are helpful, direct, and capable.

CRITICAL RULES:
1. ONLY respond to what the user just said. Do NOT bring up topics from memory unless the user asks about them.
2. If memories are provided below, use them ONLY if they are directly relevant to the user's current message. Ignore unrelated memories completely.
3. NEVER reference tasks, issues, or projects the user did not mention in this conversation.
4. If you are unsure what the user is asking, ask for clarification instead of guessing.

You have access to tools for memory management, file operations, and command execution.

Key behaviors:
- When the user tells you a preference or important fact, save it to memory using save_memory.
- When a topic comes up that you might have prior context on, use recall_memory to check. But ONLY if the user brought it up.
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
// PULL-BASED MEMORY: No auto-injection. The agent has recall_memory as a tool
// and will search when it decides it needs context. This is the Hermes/MemGPT
// pattern — prevents context contamination by default.
// Auto-injection was causing the bot to bring up Slack issues, other projects,
// etc. from keyword-matched memories that weren't relevant to the conversation.
const conversationEngine = createConversationEngine(executionApi, {
  // No retrieveMemories callback = no auto-injection.
  // The agent uses recall_memory tool when it needs context.
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

function toUserFacingFailure(rawResponse: string): string | undefined {
  const normalized = rawResponse.trim()
  if (!normalized) return undefined

  if (
    normalized === 'Agent loop completed without a result'
    || normalized.startsWith('No API key configured for provider')
    || normalized.startsWith('Stream ended without a message_done event')
  ) {
    return 'I understood your request, but the reply run ended before I could send a complete answer. Please try again.'
  }

  return undefined
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

async function sendWithRetry(bot: TelegramBot, chatId: number, text: string): Promise<void> {
  for (const chunk of splitMessage(text)) {
    let lastError: unknown
    for (let attempt = 0; attempt < SEND_MAX_RETRIES; attempt++) {
      try {
        await bot.sendMessage(chatId, chunk)
        lastError = undefined
        break
      } catch (err) {
        lastError = err
        const msg = err instanceof Error ? err.message : String(err)

        // Telegram flood control — respect retry_after
        if (msg.includes('retry after') || msg.includes('Too Many Requests')) {
          const match = msg.match(/retry after (\d+)/)
          const waitSec = match ? parseInt(match[1], 10) : 5
          logger.warn('Telegram', `Flood control: waiting ${waitSec}s before retry`)
          await sleep(waitSec * 1000)
          continue
        }

        // Timeout — do NOT retry (message may have been delivered)
        if (msg.includes('ETIMEDOUT') || msg.includes('ETIMEOUT') || msg.toLowerCase().includes('timed out')) {
          logger.warn('Telegram', `Send timed out — skipping retry to avoid duplicate`)
          break
        }

        // Network error — retry with backoff
        if (attempt < SEND_MAX_RETRIES - 1) {
          const delay = SEND_RETRY_DELAYS_MS[attempt] ?? 2000
          logger.warn('Telegram', `Send attempt ${attempt + 1} failed: ${msg}. Retrying in ${delay}ms`)
          await sleep(delay)
        }
      }
    }
    if (lastError) {
      logger.error('Telegram', `All send retries exhausted for chat ${chatId}: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`))
    }, ms)
    promise.then(
      (val) => { clearTimeout(timer); resolve(val) },
      (err) => { clearTimeout(timer); reject(err) },
    )
  })
}

async function runTelegramReplyInner(params: {
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

  await bot.sendChatAction(Number(chatId), 'typing').catch(() => {})

  const responseText = await withTimeout(
    telegramAdapter.deliver(
      conversationEngine.reply({
        ...request,
        conversationId,
        systemPromptOverride: telegramPrompt(),
      }),
      {
        destination: chatId,
        conversationId,
      }
    ),
    REPLY_TIMEOUT_MS,
    `Reply for chat ${chatId}`
  )

  const userFacingFailure = toUserFacingFailure(responseText)
  if (userFacingFailure) {
    recordLocalEvent({
      chatId,
      conversationId,
      eventType: 'conversation_reply_failed',
      summary: `Telegram reply failed: ${clip(responseText, 90)}`,
      detail: { rawResponse: responseText, voice: sendVoiceReply },
    })
  }

  const cleaned = cleanResponse(
    userFacingFailure
      || responseText
      || 'I processed your request but couldn\'t generate a response. Could you try rephrasing?'
  )

  await sendWithRetry(bot, Number(chatId), cleaned)

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

/**
 * Per-chat concurrency guard + timeout wrapper.
 * If a reply is already in-flight for this chat, the new message waits.
 * The inner reply has a hard timeout to prevent infinite hangs.
 */
async function runTelegramReply(params: {
  bot: TelegramBot
  chatId: string
  userText: string
  sendVoiceReply?: boolean
}): Promise<void> {
  const { bot, chatId } = params

  // Wait for any in-flight reply on this chat to finish
  const existing = activeChatReplies.get(chatId)
  if (existing) {
    logger.info('Telegram', `Chat ${chatId} has in-flight reply, queuing message`)
    await existing.catch(() => {})
  }

  const replyPromise = runTelegramReplyInner(params).catch(async (err) => {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error('Telegram', `Reply failed for chat ${chatId}: ${msg}`)

    // ALWAYS notify user — never go silent
    const userMsg = msg.includes('timed out')
      ? 'Sorry, my response took too long. Please try again.'
      : `Something went wrong. Please try again. (${msg.slice(0, 120)})`
    await sendWithRetry(bot, Number(chatId), userMsg)
  }).finally(() => {
    activeChatReplies.delete(chatId)
  })

  activeChatReplies.set(chatId, replyPromise)
  await replyPromise
}

export function startTelegramBot(token: string, allowedChatIds?: string[]): TelegramBot {
  // ── Startup validation (fail loud, not silent) ──────────────────
  if (!token || token.length < 20) {
    throw new Error('TELEGRAM_BOT_TOKEN is missing or invalid. Cannot start bot.')
  }

  const hasAnyProvider = !!(
    process.env.OPENROUTER_API_KEY
    || process.env.ANTHROPIC_API_KEY
    || process.env.OPENAI_API_KEY
  )
  if (!hasAnyProvider) {
    throw new Error('No AI provider API key configured (OPENROUTER_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY). Bot would be unable to generate responses.')
  }

  initializeDb()

  const bot = new TelegramBot(token, { polling: true })
  const allowedSet =
    allowedChatIds && allowedChatIds.length > 0
      ? new Set(allowedChatIds)
      : null

  logger.info('Telegram', 'Telegram bot starting...')

  // ── Silence detection heartbeat ─────────────────────────────────
  // Track wall-clock time since last successful message delivery.
  // If the bot goes silent (no sends for SILENCE_THRESHOLD_MS), log a warning.
  const SILENCE_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes
  let lastSuccessfulSend = Date.now()
  let silenceWarningEmitted = false

  const silenceWatcher = setInterval(() => {
    const silentMs = Date.now() - lastSuccessfulSend
    if (silentMs > SILENCE_THRESHOLD_MS && !silenceWarningEmitted) {
      logger.warn('Telegram', `Bot has not sent a message in ${Math.round(silentMs / 1000)}s — possible silence condition`)
      silenceWarningEmitted = true
    }
    if (silentMs <= SILENCE_THRESHOLD_MS && silenceWarningEmitted) {
      silenceWarningEmitted = false
    }
  }, 60_000)
  silenceWatcher.unref() // Don't prevent process exit

  // Wrap sendMessage to track successful sends
  const originalSendMessage = bot.sendMessage.bind(bot)
  bot.sendMessage = async function (...args: Parameters<typeof bot.sendMessage>) {
    const result = await originalSendMessage(...args)
    lastSuccessfulSend = Date.now()
    silenceWarningEmitted = false
    return result
  } as typeof bot.sendMessage

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
      await sendWithRetry(bot, msg.chat.id, `Recent Memories\n\n${lines.join('\n')}`)
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

      await sendWithRetry(bot, msg.chat.id, text)
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

  bot.on('photo', async (msg) => {
    if (!isAllowed(msg.chat.id)) return

    const chatId = String(msg.chat.id)

    try {
      // Get the highest resolution photo (last in array)
      const photos = msg.photo!
      const bestPhoto = photos[photos.length - 1]
      const fileLink = await bot.getFileLink(bestPhoto.file_id)
      const imgResponse = await fetch(fileLink)
      if (!imgResponse.ok) {
        throw new Error(`Failed to download image: ${imgResponse.status}`)
      }

      const imgBuffer = Buffer.from(await imgResponse.arrayBuffer())
      const base64Data = imgBuffer.toString('base64')

      // Determine media type from URL
      const url = fileLink.toLowerCase()
      const mediaType = url.endsWith('.png') ? 'image/png'
        : url.endsWith('.webp') ? 'image/webp'
        : 'image/jpeg'

      // Build a message with the image inline for the model
      const caption = msg.caption || 'What do you see in this image?'
      const userText = `[User sent an image with caption: "${caption}"]\n\nPlease analyze the image and respond to the user's request.`

      const conversationId = getOrCreateConversation(chatId)

      recordLocalEvent({
        chatId,
        conversationId,
        eventType: 'conversation',
        summary: `Photo received: ${clip(caption, 90)}`,
        detail: { channel: 'telegram', source: 'photo' },
      })

      await bot.sendChatAction(Number(chatId), 'typing').catch(() => {})

      // Use the vision tool directly: save to temp file, call analyze_image via conversation
      const { writeFileSync, mkdtempSync } = await import('node:fs')
      const { join } = await import('node:path')
      const { tmpdir } = await import('node:os')

      const tmpDir = mkdtempSync(join(tmpdir(), 'blade-img-'))
      const ext = mediaType === 'image/png' ? '.png' : mediaType === 'image/webp' ? '.webp' : '.jpg'
      const imgPath = join(tmpDir, `telegram-photo${ext}`)
      writeFileSync(imgPath, imgBuffer)

      // Run reply with context about the image
      const imageContext = `The user sent a photo. The image has been saved to ${imgPath}. Use the analyze_image tool with that path to see the image and answer the user's question: "${caption}"`

      await runTelegramReply({
        bot,
        chatId,
        userText: imageContext,
      })

      // Cleanup temp file
      try {
        const { unlinkSync, rmdirSync } = await import('node:fs')
        unlinkSync(imgPath)
        rmdirSync(tmpDir)
      } catch { /* best effort cleanup */ }
    } catch (err) {
      logger.error('Telegram', `Photo error: ${err instanceof Error ? err.message : String(err)}`)
      await sendWithRetry(bot, msg.chat.id, 'Failed to process the image. Please try again.')
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
      await sendWithRetry(bot, msg.chat.id, 'Voice processing failed. Please try again or send a text message.')
    }
  })

  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return
    if (!isAllowed(msg.chat.id)) return

    // runTelegramReply handles its own errors internally (never throws to caller)
    // but we keep a safety net that ALWAYS notifies the user
    try {
      await runTelegramReply({
        bot,
        chatId: String(msg.chat.id),
        userText: msg.text.trim(),
      })
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      logger.error('Telegram', `Unhandled message error: ${errMsg}`)
      // Last-resort notification — retry send, never swallow silently
      await sendWithRetry(bot, msg.chat.id, `Something went wrong. Please try again.`)
    }
  })

  // ── Hardened polling error handler (never crash, never exit) ──────
  let consecutivePollingErrors = 0
  bot.on('polling_error', (err) => {
    consecutivePollingErrors++
    const msg = err instanceof Error ? err.message : String(err)
    logger.error('Telegram', `Polling error #${consecutivePollingErrors}: ${msg}`)

    // After 10 consecutive polling errors, log critical warning
    // The bot library handles reconnection internally, but we track the pattern
    if (consecutivePollingErrors >= 10) {
      logger.error('Telegram', `${consecutivePollingErrors} consecutive polling errors — bot may be in degraded state. Check network and bot token.`)
    }
  })

  // Reset consecutive error counter on any successful message receive
  bot.on('message', () => { consecutivePollingErrors = 0 })

  // ── Startup self-test: verify bot token is valid ────────────────
  bot.getMe().then((me) => {
    logger.info('Telegram', `Bot started: @${me.username} (id: ${me.id})`)
  }).catch((err) => {
    logger.error('Telegram', `Bot token validation failed: ${err instanceof Error ? err.message : String(err)}. Bot may not receive messages.`)
  })

  return bot
}

export { cleanResponse, splitMessage }
