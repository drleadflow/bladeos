/**
 * Context Builder — Assembles the system prompt from personality,
 * memory augmentation, and employee context.
 */

import type { ConversationRequest } from '@blade/core'
import { loadPersonality } from '@blade/core'

export interface ContextBuildOptions {
  request: ConversationRequest
  retrieveMemories?: (query: string) => Promise<string>
  employeePrompt?: string
}

export function buildSystemPrompt(options: ContextBuildOptions): string {
  const { request, employeePrompt } = options
  const parts: string[] = []

  // Base personality
  if (employeePrompt) {
    parts.push(employeePrompt)
  } else {
    parts.push(loadPersonality())
  }

  // Memory context (injected by caller if available)
  // The actual memory retrieval happens outside this function
  // to keep it pure and testable

  // Channel-specific instructions
  switch (request.channel) {
    case 'telegram':
      parts.push('\n## Channel: Telegram\nKeep responses concise. Avoid markdown formatting. Max 4000 chars.')
      break
    case 'cli':
      parts.push('\n## Channel: CLI\nKeep responses concise. Use plain text.')
      break
    case 'api':
      parts.push('\n## Channel: API\nRespond in structured, parseable format when appropriate.')
      break
  }

  return parts.join('\n\n')
}
