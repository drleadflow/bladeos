/**
 * Dynamic memory injection budget — replaces the 2K hard cap with
 * a configurable, tiered system that prioritizes pinned and
 * high-importance memories.
 */

import type { MemoryRecord } from './memory-store.js'

export interface InjectionTier {
  label: string
  memories: MemoryRecord[]
  budgetChars: number
}

export interface InjectionBudget {
  maxChars: number
  pinnedBudget: number
  highImportanceBudget: number
  recentBudget: number
  generalBudget: number
}

const MIN_BUDGET = 4000
const MAX_BUDGET = 16000
const DEFAULT_BUDGET = 10000

/**
 * Calculate the injection budget based on available context.
 * Allocates ~5% of available context to memory, within floor/ceiling bounds.
 */
export function calculateBudget(availableContextChars?: number, configMaxChars?: number): InjectionBudget {
  let maxChars = configMaxChars ?? DEFAULT_BUDGET

  if (availableContextChars) {
    const dynamicBudget = Math.floor(availableContextChars * 0.05)
    maxChars = Math.max(MIN_BUDGET, Math.min(dynamicBudget, MAX_BUDGET))
  }

  maxChars = Math.max(MIN_BUDGET, Math.min(maxChars, MAX_BUDGET))

  return {
    maxChars,
    pinnedBudget: Math.floor(maxChars * 0.30),
    highImportanceBudget: Math.floor(maxChars * 0.30),
    recentBudget: Math.floor(maxChars * 0.20),
    generalBudget: Math.floor(maxChars * 0.20),
  }
}

/**
 * Build the memory injection block with tiered priority:
 * 1. Pinned (always first, never cut)
 * 2. High-importance matches
 * 3. Recent memories (last 7 days)
 * 4. General FTS matches
 */
export function buildInjectionBlock(
  pinned: MemoryRecord[],
  highImportance: MemoryRecord[],
  recent: MemoryRecord[],
  general: MemoryRecord[],
  budget: InjectionBudget
): string {
  const sections: string[] = []
  let usedChars = 0

  // Tier 1: Pinned (always injected first)
  const pinnedLines = fillTier(pinned, budget.pinnedBudget)
  if (pinnedLines.length > 0) {
    const block = pinnedLines.join('\n')
    sections.push(`[Pinned — always active]\n${block}`)
    usedChars += block.length + 30
  }

  // Tier 2: High-importance (critical/high rated memories)
  const remaining2 = budget.maxChars - usedChars
  const highBudget = Math.min(budget.highImportanceBudget, remaining2)
  const highLines = fillTier(highImportance, highBudget)
  if (highLines.length > 0) {
    const block = highLines.join('\n')
    sections.push(`[Key knowledge]\n${block}`)
    usedChars += block.length + 20
  }

  // Tier 3: Recent (accessed or created recently)
  const remaining3 = budget.maxChars - usedChars
  const recentBudget = Math.min(budget.recentBudget, remaining3)
  const recentLines = fillTier(recent, recentBudget)
  if (recentLines.length > 0) {
    const block = recentLines.join('\n')
    sections.push(`[Recent context]\n${block}`)
    usedChars += block.length + 20
  }

  // Tier 4: General FTS matches
  const remaining4 = budget.maxChars - usedChars
  const generalBudget = Math.min(budget.generalBudget, remaining4)
  const generalLines = fillTier(general, generalBudget)
  if (generalLines.length > 0) {
    const block = generalLines.join('\n')
    sections.push(`[Related memories]\n${block}`)
  }

  if (sections.length === 0) {
    return ''
  }

  return sections.join('\n\n')
}

function fillTier(memories: MemoryRecord[], budgetChars: number): string[] {
  const lines: string[] = []
  let usedChars = 0

  for (const m of memories) {
    const tags = parseTags(m.tagsJson)
    const tagStr = tags.length > 0 ? ` [${tags.join(', ')}]` : ''
    const line = `- ${m.content}${tagStr}`

    if (usedChars + line.length > budgetChars) {
      // If we haven't added anything yet, add a truncated version
      if (lines.length === 0 && budgetChars > 100) {
        lines.push(`- ${m.content.slice(0, budgetChars - 10)}...`)
      }
      break
    }

    lines.push(line)
    usedChars += line.length + 1 // +1 for newline
  }

  return lines
}

function parseTags(tagsJson: string | undefined): string[] {
  if (!tagsJson) return []
  try {
    return JSON.parse(tagsJson)
  } catch {
    return []
  }
}
