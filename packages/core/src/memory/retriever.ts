import { memoryStore } from './memory-store.js'

export interface RankedMemory {
  id: string
  content: string
  type: string
  tags: string[]
  relevanceScore: number
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
const RECENCY_BOOST = 0.15
const ACCESS_COUNT_BOOST_MAX = 0.1

/**
 * Retrieve memories relevant to a query, re-ranked by a composite score
 * combining FTS5 match rank, confidence, recency, and access frequency.
 */
export function retrieveRelevant(query: string, limit = 10): RankedMemory[] {
  try {
    const raw = memoryStore.search(query, limit * 2)

    const now = Date.now()

    const scored: RankedMemory[] = raw.map((record, index) => {
      // FTS5 rank score: earlier position = better match
      // Normalize to 0-1 range (first result = 1.0, decays for later results)
      const ftsScore = 1 / (1 + index * 0.3)

      // Confidence score (already 0-1)
      const confidenceScore = record.confidence ?? 0.5

      // Recency boost: memories accessed in the last 7 days get a boost
      const createdAt = new Date(record.createdAt).getTime()
      const isRecent = (now - createdAt) < SEVEN_DAYS_MS
      const recencyBoost = isRecent ? RECENCY_BOOST : 0

      // Access count boost: slight boost for frequently used memories (capped)
      const accessCount = record.accessCount ?? 0
      const accessBoost = Math.min(accessCount * 0.01, ACCESS_COUNT_BOOST_MAX)

      // Composite relevance score
      const relevanceScore =
        ftsScore * 0.4 +
        confidenceScore * 0.35 +
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
        relevanceScore,
      }
    })

    scored.sort((a, b) => b.relevanceScore - a.relevanceScore)

    return scored.slice(0, limit)
  } catch {
    return []
  }
}
