// Engine
export { createConversationEngine } from './engine.js'
export type { ConversationEngine, ConversationEngineOptions } from './engine.js'
export { startTelegramBot, cleanResponse as cleanTelegramResponse, splitMessage as splitTelegramMessage } from './telegram-bot.js'
export { startSlackBot } from './slack-bot.js'

// Context & Policy
export { buildSystemPrompt } from './context-builder.js'
export type { ContextBuildOptions } from './context-builder.js'
export { resolvePolicy, cleanupScope } from './policy-resolver.js'
export type { PolicyResult } from './policy-resolver.js'

// Adapters
export {
  WebSSEAdapter,
  TelegramAdapter,
  CLIAdapter,
  APIAdapter,
} from './adapters/index.js'
export type {
  ChannelAdapter,
  DeliveryContext,
  WebIncoming,
  TelegramIncoming,
  CLIIncoming,
  APIIncoming,
  APIResponse,
} from './adapters/index.js'
