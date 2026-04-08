export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

let currentLevel: LogLevel = 'info'

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLevel]
}

function formatMessage(level: LogLevel, context: string, message: string): string {
  const timestamp = new Date().toISOString()
  return `${timestamp} [${level.toUpperCase()}] [${context}] ${message}`
}

export const logger = {
  setLevel(level: LogLevel): void {
    currentLevel = level
  },

  debug(context: string, message: string, data?: unknown): void {
    if (!shouldLog('debug')) return
    console.debug(formatMessage('debug', context, message), data ?? '')
  },

  info(context: string, message: string, data?: unknown): void {
    if (!shouldLog('info')) return
    console.info(formatMessage('info', context, message), data ?? '')
  },

  warn(context: string, message: string, data?: unknown): void {
    if (!shouldLog('warn')) return
    console.warn(formatMessage('warn', context, message), data ?? '')
  },

  error(context: string, message: string, data?: unknown): void {
    if (!shouldLog('error')) return
    console.error(formatMessage('error', context, message), data ?? '')
  },
}
