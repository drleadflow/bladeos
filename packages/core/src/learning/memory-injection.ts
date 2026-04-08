import { retrieveRelevant } from '../memory/retriever.js'

/**
 * Augment a base system prompt with relevant memories from the memory store.
 * Searches memories using the user's message as query and appends a
 * "## Your Memory" section if relevant memories are found.
 *
 * This is synchronous-safe since memoryStore.search uses synchronous SQLite.
 */
export function buildMemoryAugmentedPrompt(
  basePrompt: string,
  userMessage: string
): string {
  try {
    if (!userMessage || userMessage.trim().length === 0) {
      return basePrompt
    }

    const memories = retrieveRelevant(userMessage, 8)

    if (memories.length === 0) {
      return basePrompt
    }

    // Filter to only reasonably relevant memories (score > 0.2)
    const relevant = memories.filter(m => m.relevanceScore > 0.2)

    if (relevant.length === 0) {
      return basePrompt
    }

    const memoryLines = relevant.map(m => {
      const tagStr = m.tags.length > 0 ? ` [${m.tags.join(', ')}]` : ''
      return `- ${m.content}${tagStr}`
    })

    const memorySection = [
      '',
      '## Your Memory',
      'You remember the following about this user and their work:',
      ...memoryLines,
    ].join('\n')

    return basePrompt + memorySection
  } catch {
    // Memory injection must never break the main flow
    return basePrompt
  }
}
