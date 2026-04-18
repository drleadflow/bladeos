import { memories } from '@blade/db'
import { logger } from '@blade/shared'

interface MemoryRow {
  id: string
  content: string
}

/**
 * Evaluate which injected memories were actually used in the response.
 * Boost salience for referenced memories, leave others for natural decay.
 */
export function processMemoryFeedback(
  injectedMemoryIds: string[],
  responseText: string
): { boosted: number; penalized: number } {
  let boosted = 0
  let penalized = 0

  const allMemories = memories.getAll(1000) as MemoryRow[]
  const memoryMap = new Map(allMemories.map(m => [m.id, m]))

  const responseLower = responseText.toLowerCase()

  for (const id of injectedMemoryIds) {
    const memory = memoryMap.get(id)
    if (!memory) continue

    const memoryWords = memory.content.toLowerCase().split(/\s+/).filter(w => w.length > 4)
    const matchCount = memoryWords.filter(w => responseLower.includes(w)).length
    const matchRatio = memoryWords.length > 0 ? matchCount / memoryWords.length : 0

    if (matchRatio > 0.2) {
      memories.reinforce(id)
      boosted++
    } else {
      penalized++
    }
  }

  if (boosted > 0 || penalized > 0) {
    logger.debug('MemoryFeedback', `Processed ${injectedMemoryIds.length} memories: ${boosted} boosted, ${penalized} not referenced`)
  }

  return { boosted, penalized }
}
