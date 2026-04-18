import OpenAI from 'openai'
import { logger } from '@blade/shared'

const embeddingCache = new Map<string, Float32Array>()
const MAX_CACHE_SIZE = 1000

let openaiClient: OpenAI | null = null

function getClient(): OpenAI | null {
  if (openaiClient) return openaiClient
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  openaiClient = new OpenAI({ apiKey })
  return openaiClient
}

export async function generateEmbedding(text: string): Promise<Float32Array | null> {
  const cacheKey = text.slice(0, 200)
  const cached = embeddingCache.get(cacheKey)
  if (cached) return cached

  const client = getClient()
  if (!client) {
    logger.debug('Embedder', 'OpenAI API key not configured, skipping embedding')
    return null
  }

  try {
    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000),
    })

    const embedding = new Float32Array(response.data[0].embedding)

    if (embeddingCache.size >= MAX_CACHE_SIZE) {
      const firstKey = embeddingCache.keys().next().value
      if (firstKey) embeddingCache.delete(firstKey)
    }
    embeddingCache.set(cacheKey, embedding)

    return embedding
  } catch (err) {
    logger.warn('Embedder', `Embedding generation failed: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0
  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  return denominator === 0 ? 0 : dotProduct / denominator
}
