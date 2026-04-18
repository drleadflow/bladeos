import { memories } from '@blade/db'
import { memoryStore } from './memory-store.js'
import { generateEmbedding } from './embedder.js'
import { searchSimilar } from './vector-store.js'
import type { RankedMemory } from './retriever.js'
import type { MemoryRecord } from './memory-store.js'
import { logger } from '@blade/shared'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

const IMPORTANCE_WEIGHT: Record<string, number> = {
  critical: 1.0,
  high: 0.75,
  medium: 0.5,
  low: 0.25,
}

/**
 * Hybrid retrieval combining FTS5 + vector search.
 * Scoring: 40% vector + 30% FTS + 15% importance + 10% recency + 5% access
 */
export async function retrieveHybrid(query: string, limit = 10): Promise<RankedMemory[]> {
  const ftsResults = memoryStore.search(query, limit * 2)

  const ftsScores = new Map<string, { score: number; record: MemoryRecord }>()
  ftsResults.forEach((record, idx) => {
    ftsScores.set(record.id, { score: 1 / (1 + idx * 0.3), record })
  })

  let vectorScores = new Map<string, number>()
  try {
    const queryEmbedding = await generateEmbedding(query)
    if (queryEmbedding) {
      const vectorResults = searchSimilar(queryEmbedding, limit * 2)
      vectorScores = new Map(vectorResults.map(r => [r.memoryId, r.similarity]))
    }
  } catch (err) {
    logger.debug('HybridRetriever', `Vector search unavailable: ${err instanceof Error ? err.message : String(err)}`)
  }

  const allIds = new Set([...ftsScores.keys(), ...vectorScores.keys()])

  const allRecords = new Map<string, MemoryRecord>()
  for (const [id, data] of ftsScores) {
    allRecords.set(id, data.record)
  }

  // Fetch records for IDs that only appeared in vector results
  const missingIds = [...vectorScores.keys()].filter(id => !allRecords.has(id))
  if (missingIds.length > 0) {
    try {
      const bulk = memories.getAll(1000) as MemoryRecord[]
      for (const r of bulk) {
        if (!allRecords.has(r.id)) allRecords.set(r.id, r)
      }
    } catch { /* skip if DB unavailable */ }
  }

  const now = Date.now()
  const scored: RankedMemory[] = []

  for (const id of allIds) {
    const record = allRecords.get(id)
    if (!record) continue

    const ftsScore = ftsScores.get(id)?.score ?? 0
    const vectorSim = vectorScores.get(id) ?? 0

    const importance = record.importance ?? 'medium'
    const importanceBoost = IMPORTANCE_WEIGHT[importance] ?? 0.5

    const createdAt = new Date(record.createdAt).getTime()
    const isRecent = (now - createdAt) < SEVEN_DAYS_MS
    const recencyBoost = isRecent ? 0.10 : 0

    const accessCount = record.accessCount ?? 0
    const accessBoost = Math.min(accessCount * 0.01, 0.05)

    const relevanceScore =
      vectorSim * 0.40 +
      ftsScore * 0.30 +
      importanceBoost * 0.15 +
      recencyBoost +
      accessBoost

    let tags: string[] = []
    try { tags = JSON.parse(record.tagsJson ?? '[]') } catch { tags = [] }

    scored.push({
      id: record.id,
      content: record.content,
      type: record.type,
      tags,
      importance,
      relevanceScore,
    })
  }

  scored.sort((a, b) => b.relevanceScore - a.relevanceScore)
  return scored.slice(0, limit)
}
