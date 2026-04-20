/**
 * Blade Telegram Bot — Standalone always-on service.
 *
 * Starts the Telegram bot with polling, initializes the database,
 * loads employee definitions, and keeps the process alive.
 *
 * Deploy on a VPS with pm2 or as a Railway service.
 */

import { initializeDb } from '@blade/db'
import { loadEmployeeDefinitions } from '@blade/core'
import { startTelegramBot } from '@blade/conversation'
import { logger } from '@blade/shared'
import { startMissionWorker, stopMissionWorker } from '../../../packages/core/src/missions/index.js'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main(): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    logger.error('telegram', 'TELEGRAM_BOT_TOKEN is required')
    process.exit(1)
  }

  const allowedChatIds = process.env.TELEGRAM_ALLOWED_CHAT_IDS
    ?.split(',')
    .map(id => id.trim())
    .filter(Boolean)

  // Initialize database
  logger.info('telegram', 'Initializing database...')
  initializeDb()

  // Load employee definitions from YAML
  const definitionsDir = join(__dirname, '..', '..', '..', 'packages', 'core', 'src', 'employees', 'definitions')
  // Also check the dist path for built deployments
  const distDefinitionsDir = join(__dirname, '..', '..', '..', 'packages', 'core', 'dist', 'employees', 'definitions')

  for (const dir of [definitionsDir, distDefinitionsDir]) {
    if (existsSync(dir)) {
      try {
        loadEmployeeDefinitions(dir)
        logger.info('telegram', `Employee definitions loaded from ${dir}`)
        break
      } catch (err) {
        logger.warn('telegram', `Failed to load definitions from ${dir}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  // Start the bot
  logger.info('telegram', 'Starting Telegram bot...')
  const bot = startTelegramBot(token, allowedChatIds)

  logger.info('telegram', 'Bot is running. Press Ctrl+C to stop.')

  // Start mission execution worker
  const sendTelegramNotification = async (message: string): Promise<void> => {
    try {
      const chatId = allowedChatIds?.[0]
      if (chatId) {
        await bot.sendMessage(chatId, message)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.warn('telegram', `Failed to send mission notification: ${msg}`)
    }
  }

  startMissionWorker({
    pollIntervalMs: 10_000,
    clarificationTimeoutMs: 5 * 60 * 1000,
    maxRetriesPerMission: 3,
    defaultCostBudget: 1.0,
    dashboardUrl: process.env.DASHBOARD_URL ?? 'http://localhost:5174',
    notifyTelegram: sendTelegramNotification,
  })
  logger.info('telegram', 'Mission worker started')

  // Graceful shutdown
  const shutdown = (): void => {
    logger.info('telegram', 'Shutting down...')
    stopMissionWorker()
    bot.stopPolling()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  // Keep process alive — prevents Node from exiting while polling
  setInterval(() => {
    // Heartbeat
  }, 60_000)
}

main().catch((err: unknown) => {
  logger.error('telegram', `Fatal error: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
