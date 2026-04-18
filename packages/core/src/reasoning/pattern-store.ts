import { reasoningPatterns } from '@blade/db'
import { generateEmbedding, cosineSimilarity } from '../memory/embedder.js'
import { classifyTask } from '../routing/task-classifier.js'
import { logger } from '@blade/shared'

export interface PatternMatch {
  id: string
  taskType: string
  approach: string
  confidence: number
  similarity: number
  employeeSlug: string | null
}

/**
 * Store a successful approach as a reasoning pattern.
 * Called when a mission/job completes successfully.
 */
export async function storePattern(params: {
  taskDescription: string
  approach: string
  employeeSlug?: string
  missionId?: string
  outcome?: string
}): Promise<string> {
  const taskType = classifyTask(params.taskDescription, '')

  let embeddingBuffer: Buffer | undefined
  const embedding = await generateEmbedding(params.taskDescription)
  if (embedding) {
    embeddingBuffer = Buffer.from(embedding.buffer)
  }

  const record = reasoningPatterns.create({
    taskType,
    taskDescription: params.taskDescription,
    approach: params.approach,
    outcome: params.outcome ?? 'success',
    employeeSlug: params.employeeSlug,
    embedding: embeddingBuffer,
    missionId: params.missionId,
  })

  logger.info('ReasoningBank', `Stored pattern for "${taskType}": ${params.taskDescription.slice(0, 80)}`)
  return record.id
}

/**
 * Find similar patterns for a given task description.
 * Uses both task type matching and semantic similarity.
 */
export async function findSimilarPatterns(
  taskDescription: string,
  options?: { limit?: number; minSimilarity?: number }
): Promise<PatternMatch[]> {
  const limit = options?.limit ?? 5
  const minSimilarity = options?.minSimilarity ?? 0.5
  const taskType = classifyTask(taskDescription, '')

  const typeMatches = reasoningPatterns.listByTaskType(taskType, limit)

  const queryEmbedding = await generateEmbedding(taskDescription)
  const semanticMatches: Array<{ id: string; similarity: number }> = []

  if (queryEmbedding) {
    const allEmbeddings = reasoningPatterns.getEmbeddings()
    for (const entry of allEmbeddings) {
      const similarity = cosineSimilarity(queryEmbedding, entry.embedding)
      if (similarity >= minSimilarity) {
        semanticMatches.push({ id: entry.id, similarity })
      }
    }
    semanticMatches.sort((a, b) => b.similarity - a.similarity)
  }

  const seen = new Set<string>()
  const results: PatternMatch[] = []

  for (const match of semanticMatches.slice(0, limit)) {
    const record = reasoningPatterns.get(match.id)
    if (!record || seen.has(record.id)) continue
    seen.add(record.id)
    results.push({
      id: record.id,
      taskType: record.taskType,
      approach: record.approach,
      confidence: record.confidence,
      similarity: match.similarity,
      employeeSlug: record.employeeSlug,
    })
  }

  for (const record of typeMatches) {
    if (seen.has(record.id) || results.length >= limit) continue
    seen.add(record.id)
    results.push({
      id: record.id,
      taskType: record.taskType,
      approach: record.approach,
      confidence: record.confidence,
      similarity: 0.5,
      employeeSlug: record.employeeSlug,
    })
  }

  return results.slice(0, limit)
}

/**
 * Build a context string from matching patterns for injection into prompts.
 */
export async function buildPatternContext(taskDescription: string): Promise<string> {
  const patterns = await findSimilarPatterns(taskDescription, { limit: 3 })

  if (patterns.length === 0) return ''

  const lines: string[] = [
    '--- Proven Approaches (ReasoningBank) ---',
    'Similar tasks have been solved before. Here are approaches that worked:',
    '',
  ]

  for (const pattern of patterns) {
    const confidenceLabel = pattern.confidence >= 0.8 ? 'high' : pattern.confidence >= 0.5 ? 'medium' : 'low'
    lines.push(`[${confidenceLabel} confidence, ${Math.round(pattern.similarity * 100)}% similar]`)
    lines.push(`Approach: ${pattern.approach}`)
    if (pattern.employeeSlug) {
      lines.push(`Previously handled by: ${pattern.employeeSlug}`)
    }
    lines.push('')
  }

  lines.push('Consider adapting these approaches to your current task.')
  return lines.join('\n')
}

/**
 * Record that a pattern was used and whether it succeeded.
 */
export function recordPatternOutcome(patternId: string, success: boolean): void {
  reasoningPatterns.recordUse(patternId, success)
  logger.debug('ReasoningBank', `Pattern ${patternId} ${success ? 'succeeded' : 'failed'}`)
}
