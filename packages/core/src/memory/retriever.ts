import { memoryStore } from './memory-store.js'

export interface RankedMemory {
  id: string
  content: string
  type: string
  tags: string[]
  importance: string
  relevanceScore: number
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
const RECENCY_BOOST = 0.10
const ACCESS_COUNT_BOOST_MAX = 0.10

/** Importance weight map for scoring */
const IMPORTANCE_WEIGHT: Record<string, number> = {
  critical: 1.0,
  high: 0.75,
  medium: 0.5,
  low: 0.25,
}

/**
 * Retrieve memories relevant to a query, re-ranked by a composite score
 * combining FTS5 match rank, confidence, importance, recency, and access frequency.
 *
 * Updated formula (v2):
 *   35% FTS rank + 25% confidence + 20% importance + 10% recency + 10% access
 */
export function retrieveRelevant(query: string, limit = 10): RankedMemory[] {
  try {
    const raw = memoryStore.search(query, limit * 2)

    const now = Date.now()

    const scored: RankedMemory[] = raw.map((record, index) => {
      // FTS5 rank score: earlier position = better match
      const ftsScore = 1 / (1 + index * 0.3)

      // Confidence score (already 0-1)
      const confidenceScore = record.confidence ?? 0.5

      // Importance boost
      const importance = record.importance ?? 'medium'
      const importanceBoost = IMPORTANCE_WEIGHT[importance] ?? 0.5

      // Recency boost: memories accessed in the last 7 days get a boost
      const createdAt = new Date(record.createdAt).getTime()
      const isRecent = (now - createdAt) < SEVEN_DAYS_MS
      const recencyBoost = isRecent ? RECENCY_BOOST : 0

      // Access count boost: slight boost for frequently used memories (capped)
      const accessCount = record.accessCount ?? 0
      const accessBoost = Math.min(accessCount * 0.01, ACCESS_COUNT_BOOST_MAX)

      // Composite relevance score (v2 weights)
      const relevanceScore =
        ftsScore * 0.35 +
        confidenceScore * 0.25 +
        importanceBoost * 0.20 +
        recencyBoost +
        accessBoost

      let tags: string[] = []
      try {
        tags = JSON.parse(record.tagsJson ?? '[]')
      } catch {
        tags = []
      }

      return {
        id: record.id,
        content: record.content,
        type: record.type,
        tags,
        importance,
        relevanceScore,
      }
    })

    scored.sort((a, b) => b.relevanceScore - a.relevanceScore)

    return scored.slice(0, limit)
  } catch {
    return []
  }
}
