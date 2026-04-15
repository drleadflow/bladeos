import { memories } from '@blade/db'

export interface MemoryRecord {
  id: string
  type: string
  content: string
  tagsJson: string
  source: string
  confidence: number
  accessCount: number
  createdAt: string
  importance: string
  employeeId: string | null
  scope: string
  pinned: number
}

export class MemoryStore {
  save(content: string, type: string, tags: string[], source: string, options?: {
    importance?: string
    employeeId?: string
    scope?: string
    pinned?: boolean
  }): { id: string } {
    return memories.create({
      type,
      content,
      tags,
      source,
      importance: options?.importance,
      employeeId: options?.employeeId,
      scope: options?.scope,
      pinned: options?.pinned,
    })
  }

  search(query: string, limit = 10): MemoryRecord[] {
    try {
      return memories.search(query, limit) as MemoryRecord[]
    } catch {
      return memories.getAll(limit) as MemoryRecord[]
    }
  }

  getPinned(): MemoryRecord[] {
    return memories.getPinned() as MemoryRecord[]
  }

  setPinned(id: string, pinned: boolean): void {
    memories.setPinned(id, pinned)
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
