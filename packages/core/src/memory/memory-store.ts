import { memories } from '@blade/db'

interface MemoryRecord {
  id: string
  type: string
  content: string
  tagsJson: string
  source: string
  confidence: number
  accessCount: number
  createdAt: string
}

export class MemoryStore {
  save(content: string, type: string, tags: string[], source: string): { id: string } {
    return memories.create({ type, content, tags, source })
  }

  search(query: string, limit = 10): MemoryRecord[] {
    try {
      return memories.search(query, limit) as MemoryRecord[]
    } catch {
      // Fallback to getAll if FTS search fails (e.g. empty query or FTS not available)
      return memories.getAll(limit) as MemoryRecord[]
    }
  }

  reinforce(id: string): void {
    memories.reinforce(id)
  }

  decay(id: string): void {
    memories.decay(id)
  }

  prune(minConfidence = 0.1): number {
    return memories.prune(minConfidence)
  }

  getAll(limit = 100): MemoryRecord[] {
    return memories.getAll(limit) as MemoryRecord[]
  }
}

export const memoryStore = new MemoryStore()
