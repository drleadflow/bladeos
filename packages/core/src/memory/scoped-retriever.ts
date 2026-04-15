/**
 * Scoped memory retriever — filters memories by employee scope
 * before applying the standard relevance ranking.
 *
 * Scope rules:
 *   - 'own': employee sees own memories + hive memories
 *   - 'shared': employee sees own + shared + hive memories
 *   - no employeeId: sees all memories (main/triage agent)
 *
 * Pinned memories are always included regardless of scope.
 */

import { memoryStore } from './memory-store.js'
import type { MemoryRecord } from './memory-store.js'
import type { RankedMemory } from './retriever.js'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

const IMPORTANCE_WEIGHT: Record<string, number> = {
  critical: 1.0,
  high: 0.75,
  medium: 0.5,
  low: 0.25,
}

/**
 * Retrieve memories scoped to an employee, re-ranked by composite score.
 * If no employeeId is provided, returns all memories (unscoped).
 */
export function retrieveScoped(
  query: string,
  employeeId: string | undefined,
  employeeScope: string,
  limit = 10
): RankedMemory[] {
  try {
    // Get FTS matches
    const raw = memoryStore.search(query, limit * 3)

    // Apply scope filter
    const scoped = filterByScope(raw, employeeId, employeeScope)

    // Score and rank
    const now = Date.now()
    const scored: RankedMemory[] = scoped.map((record, index) => {
      const ftsScore = 1 / (1 + index * 0.3)
      const confidenceScore = record.confidence ?? 0.5
      const importance = record.importance ?? 'medium'
      const importanceBoost = IMPORTANCE_WEIGHT[importance] ?? 0.5

      const createdAt = new Date(record.createdAt).getTime()
      const isRecent = (now - createdAt) < SEVEN_DAYS_MS
      const recencyBoost = isRecent ? 0.10 : 0

      const accessCount = record.accessCount ?? 0
      const accessBoost = Math.min(accessCount * 0.01, 0.10)

      const relevanceScore =
        ftsScore * 0.35 +
        confidenceScore * 0.25 +
        importanceBoost * 0.20 +
        recencyBoost +
        accessBoost

      let tags: string[] = []
      try { tags = JSON.parse(record.tagsJson ?? '[]') } catch { tags = [] }

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

function filterByScope(
  records: MemoryRecord[],
  employeeId: string | undefined,
  employeeScope: string
): MemoryRecord[] {
  // No employee = main agent, sees everything
  if (!employeeId) return records

  return records.filter(record => {
    // Pinned memories are always visible
    if (record.pinned) return true

    // Hive memories are always visible
    if (record.scope === 'hive') return true

    // Own memories
    if (record.employeeId === employeeId) return true

    // Shared scope sees shared memories
    if (employeeScope === 'shared' && record.scope === 'shared') return true

    return false
  })
}
