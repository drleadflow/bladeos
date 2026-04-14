import TelegramBot from 'node-telegram-bot-api'
import { initializeDb, memories, costEntries, activityEvents, workspaces as wsRepo, clientAccounts, onboarding as onboardingRepo } from '@blade/db'
import {
  createExecutionAPI,
  loadPersonality,
  speechToText,
  textToSpeech,
  advanceState,
  getQuestionPrompt,
  executeInstall,
  getSuggestedPrompts,
  isSkipSignal,
  getCoreEmployeeIds,
} from '@blade/core'
import type { OnboardingSession, OnboardingState } from '@blade/core'
import { logger } from '@blade/shared'
import { join } from 'node:path'
import { writeFileSync, mkdtempSync, unlinkSync, rmdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createConversationEngine } from './engine.js'
import { TelegramAdapter } from './adapters/telegram.js'
import { createSkillResolver } from './skill-resolver.js'

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try { return JSON.parse(raw) as T }
  catch { return fallback }
}

const TELEGRAM_MAX_MESSAGE_LENGTH = 4096
const REPLY_TIMEOUT_MS = 90_000
const SEND_MAX_RETRIES = 3
const SEND_RETRY_DELAYS_MS = [1000, 2000, 4000]

// Per-chat concurrency lock — prevents simultaneous processing for the same chat
const activeChatReplies = new Map<string, Promise<void>>()
// Queue: if a message arrives while one is processing, hold the latest
const pendingMessages = new Map<string, { text: string; resolve: () => void }>()

const SYSTEM_PROMPT = `You are Blade — an AI workforce of 6 specialized employees running inside Telegram.

You have a Chief of Staff, Growth Lead, Sales Closer, Finance Analyst, Ops Manager, and Support Lead — all working for the user.

Personality:
- Direct and action-oriented. No fluff.
- Speak like a sharp COO who's been with the company for years.
- When the user asks for something, DO IT. Don't ask clarifying questions unless truly ambiguous.
- Use the user's business context from memory when available.
- Never mention Claude, AI models, or internal system details.
- You are Blade. That's it.

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

You have project workspace tools for real development:
- open_project: Clone a GitHub repo and set it as the active workspace
- run_in_project: Run any shell command (npm install, npm test, git status, etc.)
- read_project_file: Read any file from the project
- write_project_file: Create or edit files
- push_and_pr: Commit changes, push to a branch, and open a pull request
- list_projects: Show all open workspaces

When the user mentions a repo or project, use open_project to clone it. Then use run_in_project for commands and read/write for files. This is a real dev environment — you can install deps, run tests, build, and ship PRs.

You are communicating via Telegram. IMPORTANT formatting rules:
- Keep responses concise for mobile reading.
- Do NOT use markdown formatting (no **bold**, no *italic*, no ## headers, no \`code blocks\`).
- Write in plain text only. Use emojis sparingly for emphasis instead of markdown.
- Be conversational and natural, like texting a friend who happens to be incredibly capable.`

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
  resolveSkillPrompt: createSkillResolver(),
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

// Track when the last message was sent per chat for staleness detection
const lastMessageTime = new Map<string, number>()
const STALE_CONVERSATION_MS = 30 * 60 * 1000 // 30 minutes — start fresh after gap

/** Detect if the user is starting a new topic (greeting or short message after a gap) */
function isConversationStale(chatId: string): boolean {
  const lastTime = lastMessageTime.get(chatId)
  if (!lastTime) return true // First message ever — fresh start
  return (Date.now() - lastTime) > STALE_CONVERSATION_MS
}

function getOrCreateConversation(chatId: string, userMessage?: string): string {
  // Force new conversation if explicitly requested (/new command)
  if (forceNewConversation.has(chatId)) {
    forceNewConversation.delete(chatId)
    return startFreshConversation(chatId)
  }

  // Auto-detect stale conversations — if 30+ minutes since last message, start fresh.
  // This prevents the bot from loading old Slack/GitHub discussions and continuing them.
  if (isConversationStale(chatId)) {
    logger.info('Telegram', `Chat ${chatId}: conversation stale (30m+ gap), starting fresh`)
    return startFreshConversation(chatId)
  }

  const cached = chatConversations.get(chatId)
  if (cached) return cached

  // No cached conversation — start fresh (don't load ancient DB history)
  return startFreshConversation(chatId)
}

function startFreshConversation(chatId: string): string {
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
  lastMessageTime.set(chatId, Date.now())
  const conversationId = getOrCreateConversation(chatId, userText)
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

// ── Onboarding flow ───���──────────────────────────────────────────

function getPacksDir(): string {
  // Resolve skill-packs relative to the project root
  return join(process.cwd(), 'skill-packs')
}

function persistSession(session: OnboardingSession): void {
  onboardingRepo.update(session.id, {
    state: session.state,
    vertical: session.vertical ?? null,
    selectedEmployees: JSON.stringify(getCoreEmployeeIds()),
    answers: JSON.stringify(session.answers),
    currentEmployeeIndex: 0,
    currentQuestionIndex: 0,
  })
}

async function handleOnboarding(bot: TelegramBot, chatId: string, message: string): Promise<boolean> {
  const numChatId = Number(chatId)

  // Look up active onboarding session
  const row = onboardingRepo.getByChannel('telegram', chatId)
  if (!row) return false
  if (row.state === 'complete' || row.state === 'installing') return false

  let session: OnboardingSession = {
    id: row.id,
    channel: row.channel,
    channelId: row.channelId,
    state: row.state as OnboardingState,
    vertical: row.vertical ?? undefined,
    answers: safeJsonParse(row.answers, {}),
  }

  // Skip signal — jump straight to install with whatever we have
  if (isSkipSignal(message)) {
    session = { ...session, state: 'installing' }
    persistSession(session)
    await runInstall(bot, chatId, session)
    return true
  }

  // Advance the state with the user's answer
  session = advanceState(session, message.trim())
  persistSession(session)

  // If we've moved to installing, run the install
  if (session.state === 'installing') {
    await runInstall(bot, chatId, session)
    return true
  }

  // Otherwise, ask the next question
  const nextPrompt = getQuestionPrompt(session.state)
  if (nextPrompt) {
    await sendWithRetry(bot, numChatId, nextPrompt)
  }

  return true
}

async function runInstall(bot: TelegramBot, chatId: string, session: OnboardingSession): Promise<void> {
  const numChatId = Number(chatId)
  await sendWithRetry(bot, numChatId, 'Setting up your team...')

  try {
    const result = executeInstall(session, getPacksDir())

    onboardingRepo.complete(session.id)

    const prompts = getSuggestedPrompts(session)
    const promptList = prompts.map((p, i) => `${i + 1}. "${p}"`).join('\n')

    await sendWithRetry(bot, numChatId,
      `Your team is ready!\n\n` +
      `${result.employeesActivated} employees activated\n` +
      `${result.memoriesSeeded} memories seeded\n` +
      `${result.skillsInstalled} skills installed\n\n` +
      `Try asking:\n${promptList}`)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    logger.error('Telegram', `Onboarding install failed: ${errMsg}`)
    await sendWithRetry(bot, numChatId, 'Setup hit a snag. Try /start again, or just send me a message and I\'ll work without the full setup.')
    onboardingRepo.complete(session.id)
  }
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
    const chatId = String(msg.chat.id)

    if (!isAllowed(msg.chat.id)) return

    try {
      // Immediately activate core employees — no questions asked
      const { executeInstantSetup } = await import('@blade/core')
      const result = executeInstantSetup(getPacksDir())

      // Send welcome with concrete value preview
      const welcome = [
        `Welcome to Blade. Your AI workforce is live.`,
        ``,
        `${result.employeesActivated} employees activated. ${result.skillsInstalled} skills loaded.`,
        ``,
        `Here's what I can do right now:`,
        `- "Give me a morning briefing" — your daily priorities and metrics`,
        `- "Write me a follow-up email for [client]" — drafts in your voice`,
        `- "Audit my pipeline" — finds stale deals and missed follow-ups`,
        `- "Score this candidate: [details]" — instant qualification`,
        `- "What should I focus on today?" — your Chief of Staff weighs in`,
        ``,
        `Just talk to me like a team member. I learn from every conversation.`,
      ].join('\n')

      await sendWithRetry(bot, msg.chat.id, welcome)

      // Auto-trigger a useful first action — morning briefing
      // This shows immediate value instead of asking questions
      forceNewConversation.add(chatId)

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      logger.error('Telegram', `Setup failed: ${errMsg}`)
      await sendWithRetry(bot, msg.chat.id,
        'Welcome to Blade! Something went wrong with auto-setup, but you can still chat with me. Just send any message.')
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
          '/status — Check all integrations (GitHub, GHL, workspaces, clients)\n' +
          '/memory — View recent memories\n' +
          '/costs — View cost summary\n' +
          '/new — Start a new conversation\n\n' +
          'Development:\n' +
          '"Open drleadflow/repo-name" — Clone and work on a project\n' +
          '"Run npm install" — Execute commands in active project\n' +
          '"Push and PR: description" — Ship your changes\n\n' +
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

  bot.onText(/\/status/, async (msg) => {
    if (!isAllowed(msg.chat.id)) return

    try {
      const lines: string[] = ['Blade Status Report', '']

      // AI Providers
      lines.push('AI Providers:')
      if (process.env.ANTHROPIC_API_KEY) lines.push('  Anthropic: connected')
      if (process.env.OPENROUTER_API_KEY) lines.push('  OpenRouter: connected')
      if (process.env.OPENAI_API_KEY) lines.push('  OpenAI: connected')
      if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENROUTER_API_KEY && !process.env.OPENAI_API_KEY) {
        lines.push('  None configured!')
      }

      // GitHub
      lines.push('')
      lines.push('GitHub:')
      if (process.env.GITHUB_TOKEN) {
        lines.push('  Token: configured')
        lines.push('  Can: clone repos, read issues, create PRs, push code')
      } else {
        lines.push('  Not configured')
      }

      // GHL / MCP
      lines.push('')
      lines.push('GoHighLevel:')
      if (process.env.GHL_MCP_USER_KEY) {
        lines.push('  MCP Server: connected (dlf-agency.skool-203.workers.dev)')
        lines.push('  User Key: configured')
        lines.push('  Can: list sub-accounts, export messages, search conversations')
      } else {
        lines.push('  MCP: not configured (GHL_MCP_USER_KEY missing)')
      }
      if (process.env.GHL_API_KEY) lines.push(`  Direct API: configured (location: ${process.env.GHL_LOCATION_ID ?? 'unknown'})`)

      // Slack
      lines.push('')
      lines.push('Slack:')
      lines.push(process.env.SLACK_BOT_TOKEN ? '  Bot: connected' : '  Not configured')

      // Workspaces
      lines.push('')
      lines.push('Workspaces:')
      try {
        const all = wsRepo.list()
        if (all.length > 0) {
          lines.push(`  ${all.length} project(s) open:`)
          for (const ws of all.slice(0, 5)) {
            lines.push(`    - ${ws.name} (${ws.status}) — ${ws.repoUrl}`)
          }
        } else {
          lines.push('  No projects open. Say "open <repo>" to start.')
        }
      } catch {
        lines.push('  Workspace system ready')
      }

      // Clients (CSM)
      lines.push('')
      lines.push('CSM Clients:')
      try {
        const clients = clientAccounts.list({ status: 'active' })
        if (clients.length > 0) {
          lines.push(`  ${clients.length} active client(s):`)
          for (const c of clients.slice(0, 5)) {
            lines.push(`    - ${c.name} (${c.healthStatus}, ${c.healthScore}/100)`)
          }
        } else {
          lines.push('  No clients configured yet')
        }
      } catch {
        lines.push('  Client system ready')
      }

      // Tools
      lines.push('')
      lines.push('Available tools: open_project, run_in_project, read/write files, push_and_pr, list_clients, check_client_health, meta_ads, github, slack, memory, web search')

      lines.push('')
      lines.push('Send "open drleadflow/Ceolandingpages" to start coding.')

      await sendWithRetry(bot, msg.chat.id, lines.join('\n'))
    } catch (err) {
      logger.error('Telegram', `/status error: ${err instanceof Error ? err.message : String(err)}`)
      await bot.sendMessage(msg.chat.id, 'Failed to get status.').catch(() => {})
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

  // Note: No onboarding check needed here — onboarding is now instant
  // (zero-question setup on /start). Photo messages always go through
  // the normal conversation flow.
  bot.on('photo', async (msg) => {
    if (!isAllowed(msg.chat.id)) return

    const chatId = String(msg.chat.id)

    try {
      // Get the highest resolution photo (last in array)
      if (!msg.photo?.length) return
      const bestPhoto = msg.photo[msg.photo.length - 1]
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
        unlinkSync(imgPath)
        rmdirSync(tmpDir)
      } catch { /* best effort cleanup */ }
    } catch (err) {
      logger.error('Telegram', `Photo error: ${err instanceof Error ? err.message : String(err)}`)
      await sendWithRetry(bot, msg.chat.id, 'Failed to process the image. Please try again.')
    }
  })

  // Note: No onboarding check needed here — onboarding is now instant
  // (zero-question setup on /start). Voice messages always go through
  // the normal conversation flow.
  bot.on('voice', async (msg) => {
    if (!isAllowed(msg.chat.id)) return

    const chatId = String(msg.chat.id)

    try {
      if (!msg.voice) return
      await bot.sendMessage(msg.chat.id, 'Transcribing...')
      const fileLink = await bot.getFileLink(msg.voice.file_id)
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

    const chatId = String(msg.chat.id)

    // Check if user is in onboarding flow
    try {
      const handled = await handleOnboarding(bot, chatId, msg.text.trim())
      if (handled) return
    } catch (err) {
      logger.error('Telegram', `Onboarding error: ${err instanceof Error ? err.message : String(err)}`)
      // Fall through to normal reply on onboarding failure
    }

    // runTelegramReply handles its own errors internally (never throws to caller)
    // but we keep a safety net that ALWAYS notifies the user
    try {
      await runTelegramReply({
        bot,
        chatId,
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
