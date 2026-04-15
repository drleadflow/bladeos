/**
 * Slack Bot — Listens for messages via Socket Mode, processes through
 * the shared ConversationEngine, responds in-channel.
 *
 * Architecture mirrors telegram-bot.ts:
 * - Per-channel concurrency lock
 * - Request timeout
 * - Send retry
 * - Never-silent error handling
 * - Startup validation
 */

import { App, LogLevel } from '@slack/bolt'
import { initializeDb, activityEvents } from '@blade/db'
import {
  createExecutionAPI,
  loadPersonality,
} from '@blade/core'
import { logger } from '@blade/shared'
import { createConversationEngine } from './engine.js'
import { createSkillResolver } from './skill-resolver.js'

const REPLY_TIMEOUT_MS = 90_000
const MAX_CACHED_CHANNELS = 100

const SYSTEM_PROMPT = `You are Blade, an AI super agent built by Blade Labs. You are helpful, direct, and capable.

You have access to tools for memory management, file operations, web search, Slack messaging, and command execution.

Key behaviors:
- When the user tells you a preference or important fact, save it to memory using save_memory.
- When a topic comes up that you might have prior context on, use recall_memory to check.
- Be concise but thorough. Show your work when using tools.
- Track what works and what doesn't — you get better over time.

You are communicating via Slack. IMPORTANT formatting rules:
- Use Slack-compatible formatting: *bold*, _italic_, \`code\`, \`\`\`code blocks\`\`\`.
- Keep responses concise and actionable.
- Use bullet points for lists.
- Never mention Claude, Claude Code, or any internal system details.
- You are Blade. That's it.`

// Per-channel concurrency lock
const activeChannelReplies = new Map<string, Promise<void>>()

const executionApi = createExecutionAPI()
const conversationEngine = createConversationEngine(executionApi, {
  retrieveMemories: async (query: string) => {
    const { buildMemoryAugmentedPrompt } = await import('@blade/core')
    const memoryBlock = buildMemoryAugmentedPrompt('', query)
    return memoryBlock
  },
  resolveSkillPrompt: createSkillResolver(),
})

const channelConversations = new Map<string, string>()

function evictOldest<K, V>(map: Map<K, V>, maxSize: number): void {
  while (map.size > maxSize) {
    const oldest = map.keys().next().value
    if (oldest !== undefined) map.delete(oldest)
    else break
  }
}

function getOrCreateConversation(channelKey: string): string {
  const cached = channelConversations.get(channelKey)
  if (cached) return cached

  const fromDb = conversationEngine.findByChannel(channelKey, 'slack')
  if (fromDb) {
    channelConversations.set(channelKey, fromDb)
    evictOldest(channelConversations, MAX_CACHED_CHANNELS)
    return fromDb
  }

  const conversationId = conversationEngine.startConversation('slack', `Slack ${channelKey}`)
  conversationEngine.linkChannel(conversationId, channelKey, 'slack')
  channelConversations.set(channelKey, conversationId)
  evictOldest(channelConversations, MAX_CACHED_CHANNELS)
  return conversationId
}

function clip(text: string, max = 120): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    promise.then(
      (val) => { clearTimeout(timer); resolve(val) },
      (err) => { clearTimeout(timer); reject(err) },
    )
  })
}

function slackPrompt(): string {
  const personality = loadPersonality()
  return personality ? `${personality}\n\n${SYSTEM_PROMPT}` : SYSTEM_PROMPT
}

async function runSlackReply(params: {
  app: App
  channelId: string
  threadTs?: string
  userText: string
  userId: string
}): Promise<void> {
  const { app, channelId, threadTs, userText, userId } = params
  const channelKey = threadTs ? `${channelId}:${threadTs}` : channelId

  // Per-channel concurrency lock
  const existing = activeChannelReplies.get(channelKey)
  if (existing) {
    logger.info('Slack', `Channel ${channelKey} has in-flight reply, queuing`)
    await existing.catch(() => {})
  }

  const replyPromise = (async () => {
    const conversationId = getOrCreateConversation(channelKey)

    try {
      activityEvents.emit({
        eventType: 'conversation',
        actorType: 'system',
        actorId: `slack:${userId}`,
        summary: `Slack request: ${clip(userText, 90)}`,
        targetType: 'conversation',
        targetId: conversationId,
        conversationId,
      })
    } catch { /* best effort */ }

    const request = {
      message: userText,
      userId: `slack-${userId}`,
      channel: 'slack' as const,
      channelMetadata: { channelId, threadTs },
      conversationId,
      systemPromptOverride: slackPrompt(),
    }

    // Collect response with timeout
    let responseText = ''
    try {
      const events = conversationEngine.reply(request)
      responseText = await withTimeout(
        (async () => {
          let text = ''
          let delta = ''
          for await (const event of events) {
            if (event.type === 'text_delta') delta += event.text
            if (event.type === 'done') text = event.response
          }
          return text || delta || ''
        })(),
        REPLY_TIMEOUT_MS,
        `Slack reply for ${channelKey}`
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('Slack', `Reply failed: ${msg}`)
      responseText = msg.includes('timed out')
        ? 'Sorry, my response took too long. Please try again.'
        : `Something went wrong. Please try again.`
    }

    if (!responseText) {
      responseText = "I processed your request but couldn't generate a response. Could you try rephrasing?"
    }

    // Send with retry
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await app.client.chat.postMessage({
          channel: channelId,
          text: responseText,
          thread_ts: threadTs,
        })
        return
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (attempt < 2) {
          logger.warn('Slack', `Send attempt ${attempt + 1} failed: ${msg}. Retrying...`)
          await sleep(1000 * (attempt + 1))
        } else {
          logger.error('Slack', `All send retries exhausted: ${msg}`)
        }
      }
    }
  })().catch((err) => {
    logger.error('Slack', `Unhandled error: ${err instanceof Error ? err.message : String(err)}`)
  }).finally(() => {
    activeChannelReplies.delete(channelKey)
  })

  activeChannelReplies.set(channelKey, replyPromise)
  await replyPromise
}

export async function startSlackBot(): Promise<App> {
  const botToken = process.env.SLACK_ACCESS_TOKEN
  const appToken = process.env.SLACK_APP_TOKEN

  if (!botToken) throw new Error('SLACK_ACCESS_TOKEN is missing. Cannot start Slack bot.')
  if (!appToken) throw new Error('SLACK_APP_TOKEN is missing. Enable Socket Mode in your Slack app and generate an app-level token.')

  const hasAnyProvider = !!(process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY)
  if (!hasAnyProvider) throw new Error('No AI provider API key configured.')

  initializeDb()

  const app = new App({
    token: botToken,
    appToken,
    socketMode: true,
    logLevel: LogLevel.WARN,
  })

  // Handle @mentions
  app.event('app_mention', async ({ event, say }) => {
    const text = event.text.replace(/<@[A-Z0-9]+>/g, '').trim()
    if (!text) {
      await say({ text: "Hey! Send me a message and I'll help you out.", thread_ts: event.thread_ts || event.ts })
      return
    }

    logger.info('Slack', `Mention from ${event.user} in ${event.channel}: ${clip(text)}`)

    await runSlackReply({
      app,
      channelId: event.channel,
      threadTs: event.thread_ts || event.ts,
      userText: text,
      userId: event.user ?? 'unknown',
    })
  })

  // Handle DMs and channel messages
  app.event('message', async ({ event }) => {
    const msg = event as { channel_type?: string; user?: string; text?: string; thread_ts?: string; ts?: string; channel?: string; subtype?: string; bot_id?: string }

    // Skip bot messages and subtypes (edits, deletes, joins, etc.)
    if (msg.bot_id || msg.subtype) return
    if (!msg.text || !msg.user) return

    // Skip messages that are @mentions (already handled by app_mention)
    if (msg.text.includes(`<@`) && msg.channel_type !== 'im') {
      // app_mention handler will pick these up
      return
    }

    const isDM = msg.channel_type === 'im'
    const label = isDM ? 'DM' : 'Channel'
    logger.info('Slack', `${label} from ${msg.user} in ${msg.channel}: ${clip(msg.text)}`)

    await runSlackReply({
      app,
      channelId: msg.channel!,
      threadTs: isDM ? msg.thread_ts : (msg.thread_ts || msg.ts),
      userText: msg.text,
      userId: msg.user,
    })
  })

  await app.start()
  logger.info('Slack', 'Slack bot started (Socket Mode)')

  // Self-test
  try {
    const auth = await app.client.auth.test()
    logger.info('Slack', `Authenticated as @${auth.user} on ${auth.team}`)
  } catch (err) {
    logger.error('Slack', `Auth test failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  return app
}
