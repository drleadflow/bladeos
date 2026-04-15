/**
 * Importance classifier — uses a cheap model (Gemini Flash or Haiku)
 * to classify memories as critical/high/medium/low on save.
 *
 * Classification is fire-and-forget: the memory saves instantly at 'medium',
 * then an async update raises or lowers it based on LLM classification.
 */

import { memories } from '@blade/db'
import { logger } from '@blade/shared'

export type ImportanceLevel = 'critical' | 'high' | 'medium' | 'low'

const IMPORTANCE_CONFIDENCE: Record<ImportanceLevel, number> = {
  critical: 1.0,
  high: 0.8,
  medium: 0.5,
  low: 0.3,
}

const CLASSIFICATION_PROMPT = `You are a memory importance classifier. Given a memory's content and type, classify its importance level.

Levels:
- critical: Identity facts (name, business name, address, email), access credentials, business-critical rules, core SOPs
- high: Client names, user preferences, recurring patterns, technical decisions, pricing, team structure
- medium: General facts, one-time observations, contextual information, meeting notes
- low: Temporary state, session-specific context, transient notes, timestamps

Return ONLY one word: critical, high, medium, or low`

/**
 * Classify the importance of a memory using Gemini Flash.
 * Falls back to 'medium' on any failure.
 */
export async function classifyImportance(
  content: string,
  type: string,
  tags: string[]
): Promise<ImportanceLevel> {
  try {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return 'medium'

    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    const userContent = `Memory type: ${type}\nTags: ${tags.join(', ') || 'none'}\nContent: ${content}`

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: userContent }] }],
      systemInstruction: { role: 'system', parts: [{ text: CLASSIFICATION_PROMPT }] },
      generationConfig: { maxOutputTokens: 10, temperature: 0 },
    })

    const text = result.response.text().trim().toLowerCase()
    const level = text as ImportanceLevel

    if (['critical', 'high', 'medium', 'low'].includes(level)) {
      return level
    }

    return 'medium'
  } catch (err) {
    logger.debug('ImportanceClassifier', `Classification failed (using medium): ${err instanceof Error ? err.message : String(err)}`)
    return 'medium'
  }
}

/**
 * Maps importance level to a starting confidence score.
 */
export function importanceToConfidence(level: ImportanceLevel): number {
  return IMPORTANCE_CONFIDENCE[level]
}

/**
 * Fire-and-forget: classify a memory and update its importance + confidence in the DB.
 * Safe to call without awaiting — logs errors internally.
 */
export function classifyAndUpdate(memoryId: string, content: string, type: string, tags: string[]): void {
  classifyImportance(content, type, tags)
    .then(level => {
      const confidence = importanceToConfidence(level)
      memories.updateImportance(memoryId, level, confidence)
      if (level !== 'medium') {
        logger.debug('ImportanceClassifier', `Classified memory ${memoryId} as ${level} (confidence: ${confidence})`)
      }
    })
    .catch(err => {
      logger.debug('ImportanceClassifier', `Failed to classify memory ${memoryId}: ${err instanceof Error ? err.message : String(err)}`)
    })
}
