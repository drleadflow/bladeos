import { memoryEmbeddings } from '@blade/db'
import { cosineSimilarity } from './embedder.js'
import { logger } from '@blade/shared'

interface VectorEntry {
  memoryId: string
  embedding: Float32Array
}

let index: VectorEntry[] = []
let loaded = false

export function loadVectorIndex(): void {
  try {
    const all = memoryEmbeddings.getAll()
    index = all
    loaded = true
    logger.info('VectorStore', `Loaded ${index.length} embeddings into memory index`)
  } catch {
    logger.warn('VectorStore', 'Failed to load vector index, starting empty')
    index = []
    loaded = true
  }
}

export function addToIndex(memoryId: string, embedding: Float32Array): void {
  index = index.filter(e => e.memoryId !== memoryId)
  index.push({ memoryId, embedding })
}

export function removeFromIndex(memoryId: string): void {
  index = index.filter(e => e.memoryId !== memoryId)
}

export function searchSimilar(
  queryEmbedding: Float32Array,
  limit = 10,
  minSimilarity = 0.3
): { memoryId: string; similarity: number }[] {
  if (!loaded) loadVectorIndex()

  const results: { memoryId: string; similarity: number }[] = []

  for (const entry of index) {
    const similarity = cosineSimilarity(queryEmbedding, entry.embedding)
    if (similarity >= minSimilarity) {
      results.push({ memoryId: entry.memoryId, similarity })
    }
  }

  results.sort((a, b) => b.similarity - a.similarity)
  return results.slice(0, limit)
}

export function getIndexSize(): number {
  return index.length
}
