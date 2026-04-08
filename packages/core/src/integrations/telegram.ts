import TelegramBot from 'node-telegram-bot-api'
import { initializeDb, conversations, messages, memories, costEntries } from '@blade/db'
import { runAgentLoop, getAllToolDefinitions, buildMemoryAugmentedPrompt } from '../index.js'
import type { AgentMessage, ExecutionContext } from '../types.js'
import { logger } from '@blade/shared'

const TELEGRAM_MAX_MESSAGE_LENGTH = 4096

const SYSTEM_PROMPT = `You are Blade, an AI super agent built by Blade Labs. You are helpful, direct, and capable.

You have access to tools for memory management, file operations, and command execution.

Key behaviors:
- When the user tells you a preference or important fact, save it to memory using save_memory.
- When a topic comes up that you might have prior context on, use recall_memory to check.
- Be concise but thorough. Show your work when using tools.
- Track what works and what doesn't — you get better over time.

You are communicating via Telegram. Keep responses concise and well-formatted for mobile reading.`

/** In-memory map of Telegram chat ID to conversation ID */
const chatConversations = new Map<string, string>()

/** In-memory map of Telegram chat ID to message history */
const chatHistories = new Map<string, AgentMessage[]>()

/**
 * Split a long message into chunks that respect Telegram's 4096 character limit.
 * Splits on newline boundaries when possible.
 */
function splitMessage(text: string): string[] {
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
 * Get or create a conversation for a given Telegram chat ID.
 */
function getOrCreateConversation(chatId: string): string {
  const existing = chatConversations.get(chatId)
  if (existing) {
    return existing
  }

  const conv = conversations.create(`Telegram chat ${chatId}`)
  chatConversations.set(chatId, conv.id)
  chatHistories.set(chatId, [])
  return conv.id
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
        await bot.sendMessage(msg.chat.id, chunk, { parse_mode: 'Markdown' })
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

      await bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' })
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

    try {
      await bot.sendMessage(msg.chat.id, '🎤 Transcribing...')
      await bot.sendMessage(
        msg.chat.id,
        'Voice transcription coming soon. Please type your message.'
      )
    } catch (err) {
      logger.error('Telegram', `Voice error: ${err instanceof Error ? err.message : String(err)}`)
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
      const conversationId = getOrCreateConversation(chatId)
      const history = chatHistories.get(chatId) ?? []
      const tools = getAllToolDefinitions()

      // Build memory-augmented prompt
      const augmentedPrompt = buildMemoryAugmentedPrompt(SYSTEM_PROMPT, userText)

      // Add user message to history
      history.push({ role: 'user', content: userText })

      // Store user message in DB
      messages.create({
        conversationId,
        role: 'user',
        content: userText,
      })

      const context: ExecutionContext = {
        conversationId,
        userId: `telegram-${chatId}`,
        modelId: 'claude-sonnet-4-20250514',
        maxIterations: 15,
        costBudget: 0,
      }

      // Send typing indicator
      await bot.sendChatAction(msg.chat.id, 'typing')

      const result = await runAgentLoop({
        systemPrompt: augmentedPrompt,
        messages: history,
        tools,
        context,
        onToolCall: async (tc) => {
          try {
            await bot.sendMessage(
              msg.chat.id,
              `🔧 Using ${tc.toolName}...`
            )
          } catch {
            // Non-critical — don't break the loop
          }
        },
      })

      const responseText = result.finalResponse || 'I processed your request but have no text response.'

      // Send response, splitting if needed
      for (const chunk of splitMessage(responseText)) {
        await bot.sendMessage(msg.chat.id, chunk)
      }

      // Add assistant response to history
      history.push({ role: 'assistant', content: responseText })
      chatHistories.set(chatId, history)

      // Store assistant message in DB
      messages.create({
        conversationId,
        role: 'assistant',
        content: responseText,
        model: 'claude-sonnet-4-20250514',
      })

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
