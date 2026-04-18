import { logger } from '@blade/shared'

/**
 * Simple in-memory session manager.
 * Maps (conversationId or employeeSlug) → Claude SDK session ID.
 *
 * Sessions persist across messages within the same process lifetime.
 * On restart, sessions start fresh (the SDK handles its own persistence
 * on disk at ~/.claude/projects/).
 */
const sessionMap = new Map<string, string>()

export function getSession(key: string): string | undefined {
  return sessionMap.get(key)
}

export function setSession(key: string, sessionId: string): void {
  sessionMap.set(key, sessionId)
  logger.debug('SessionManager', `Session stored: ${key} → ${sessionId}`)
}

export function clearSession(key: string): void {
  sessionMap.delete(key)
}

export function clearAllSessions(): void {
  sessionMap.clear()
}

export function getActiveSessionCount(): number {
  return sessionMap.size
}

/**
 * Build a session key from available context.
 * Priority: conversationId > employeeSlug > 'default'
 */
export function buildSessionKey(params: {
  conversationId?: string
  employeeSlug?: string
}): string {
  if (params.conversationId) return `conv:${params.conversationId}`
  if (params.employeeSlug) return `emp:${params.employeeSlug}`
  return 'default'
}
