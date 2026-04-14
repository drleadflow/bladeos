import { memories } from '@blade/db'

const CORRECTION_PATTERNS = [
  /\bthat'?s (?:not right|wrong|incorrect)\b/i,
  /\bactually,?\s+(?:we|you|i)\s+(?:always|never|should)\b/i,
  /\bremember (?:that|this)\b/i,
  /\bmake (?:this|that) a rule\b/i,
  /\bhardcode (?:this|that)\b/i,
  /\bdon'?t (?:ever|do that|use)\b/i,
  /\bfrom now on\b/i,
  /\balways (?:do|use|follow)\b/i,
  /\bnever (?:do|use|send)\b/i,
  /\bstop (?:doing|using)\b/i,
]

export interface FeedbackSignal {
  type: 'correction' | 'positive' | 'rule'
  content: string
  confidence: number
}

/**
 * Detect if a user message contains feedback that should be learned.
 * Returns a FeedbackSignal if detected, null otherwise.
 */
export function detectFeedback(message: string): FeedbackSignal | null {
  // Check for correction patterns
  for (const pattern of CORRECTION_PATTERNS) {
    if (pattern.test(message)) {
      const isRule = /\bmake.*rule\b|hardcode|from now on|always|never\b/i.test(message)
      return {
        type: isRule ? 'rule' : 'correction',
        content: message,
        confidence: isRule ? 0.95 : 0.8,
      }
    }
  }

  // Check for positive reinforcement
  if (/\b(?:perfect|exactly|great job|that'?s (?:right|correct|good)|yes,? (?:like that|exactly))\b/i.test(message)) {
    return {
      type: 'positive',
      content: message,
      confidence: 0.7,
    }
  }

  return null
}

/**
 * Save detected feedback as a high-confidence memory.
 */
export function saveFeedbackAsMemory(signal: FeedbackSignal, employeeId?: string): void {
  const tags = ['feedback', signal.type]
  if (employeeId) tags.push(employeeId)

  memories.create({
    type: signal.type === 'rule' ? 'preference' : 'fact',
    content: signal.content.slice(0, 2000),
    tags,
    source: 'user-feedback',
    confidence: signal.confidence,
  })
}
