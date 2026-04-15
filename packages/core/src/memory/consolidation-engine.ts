/**
 * Memory Consolidation Engine — periodically scans recent memories,
 * groups similar ones, and creates "insight" memories that synthesize
 * patterns using Gemini Flash.
 *
 * Inspired by ClaudeClaw OS's Gemini-powered memory consolidation.
 *
 * Schedule: every 12 hours (configurable)
 * Minimum memories: 10 (skip if fewer)
 * Groups: 3+ similar memories → 1 insight
 */

import { memories } from '@blade/db'
import { logger } from '@blade/shared'

const DEFAULT_INTERVAL_MS = 12 * 60 * 60 * 1000 // 12 hours
const MIN_MEMORIES_FOR_CONSOLIDATION = 10
const MIN_GROUP_SIZE = 3
const CONSOLIDATION_WINDOW_DAYS = 7

let _timer: ReturnType<typeof setInterval> | null = null

export interface ConsolidationResult {
  insightsCreated: number
  memoriesProcessed: number
  timestamp: string
}

const CONSOLIDATION_PROMPT = `You are a memory pattern analyzer. Given a set of recent memories, identify recurring patterns and synthesize insights.

For each pattern found, produce a JSON object:
- insight: A concise 1-3 sentence synthesis of the pattern
- pattern: A short label for the pattern (e.g. "client satisfaction issues", "preferred coding style")
- sourceIds: Array of memory IDs that contribute to this pattern

Rules:
- Only create insights from genuine patterns (3+ related memories)
- Insights should be independently useful — someone reading just the insight should understand it
- Avoid restating individual memories — synthesize across them
- If no meaningful patterns exist, return an empty array

Return ONLY a JSON array. No markdown fences.`

interface InsightResult {
  insight: string
  pattern: string
  sourceIds: string[]
}

/**
 * Run a single consolidation cycle.
 */
export async function runConsolidation(): Promise<ConsolidationResult> {
  const timestamp = new Date().toISOString()

  try {
    const recentMemories = memories.getForConsolidation(CONSOLIDATION_WINDOW_DAYS, 200) as {
      id: string
      type: string
      content: string
      tagsJson: string
      importance: string
    }[]

    if (recentMemories.length < MIN_MEMORIES_FOR_CONSOLIDATION) {
      logger.debug('Consolidation', `Only ${recentMemories.length} memories, skipping (need ${MIN_MEMORIES_FOR_CONSOLIDATION}+)`)
      return { insightsCreated: 0, memoriesProcessed: recentMemories.length, timestamp }
    }

    // Build context for Gemini
    const memoryContext = recentMemories.map(m => {
      let tags: string[] = []
      try { tags = JSON.parse(m.tagsJson ?? '[]') } catch { /* ignore */ }
      return `[ID: ${m.id}] (${m.type}, ${m.importance}) ${m.content} ${tags.length > 0 ? `[tags: ${tags.join(', ')}]` : ''}`
    }).join('\n')

    const insights = await callGeminiForInsights(memoryContext)

    let insightsCreated = 0
    for (const insight of insights) {
      if (insight.sourceIds.length < MIN_GROUP_SIZE) continue

      // Verify source IDs actually exist in the batch
      const validSourceIds = insight.sourceIds.filter(
        id => recentMemories.some(m => m.id === id)
      )
      if (validSourceIds.length < MIN_GROUP_SIZE) continue

      // Check for duplicate insights (avoid creating similar insights)
      const existingInsights = memories.getInsights(20) as { content: string }[]
      const isDuplicate = existingInsights.some(existing =>
        existing.content.toLowerCase().includes(insight.pattern.toLowerCase()) ||
        insight.insight.toLowerCase().includes(existing.content.toLowerCase().slice(0, 50))
      )
      if (isDuplicate) continue

      const tags = [insight.pattern.toLowerCase().replace(/\s+/g, '-')]
      memories.createInsight({
        sourceMemoryIds: validSourceIds,
        content: insight.insight,
        patternDescription: insight.pattern,
        tags,
      })
      insightsCreated++
    }

    if (insightsCreated > 0) {
      logger.info('Consolidation', `Created ${insightsCreated} insights from ${recentMemories.length} memories`)
    }

    return { insightsCreated, memoriesProcessed: recentMemories.length, timestamp }
  } catch (err) {
    logger.error('Consolidation', `Consolidation failed: ${err instanceof Error ? err.message : String(err)}`)
    return { insightsCreated: 0, memoriesProcessed: 0, timestamp }
  }
}

async function callGeminiForInsights(memoryContext: string): Promise<InsightResult[]> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    logger.warn('Consolidation', 'No GEMINI_API_KEY set, skipping consolidation')
    return []
  }

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: `Here are the recent memories to analyze:\n\n${memoryContext}` }] }],
      systemInstruction: { role: 'system', parts: [{ text: CONSOLIDATION_PROMPT }] },
      generationConfig: { maxOutputTokens: 4096, temperature: 0.3 },
    })

    const text = result.response.text().trim()
    const cleaned = text.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim()
    const parsed = JSON.parse(cleaned)

    if (!Array.isArray(parsed)) return []

    return parsed.filter(
      (item: unknown): item is InsightResult =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as InsightResult).insight === 'string' &&
        typeof (item as InsightResult).pattern === 'string' &&
        Array.isArray((item as InsightResult).sourceIds)
    )
  } catch (err) {
    logger.error('Consolidation', `Gemini call failed: ${err instanceof Error ? err.message : String(err)}`)
    return []
  }
}

/**
 * Start the consolidation scheduler.
 * Should only run in the blade-web process.
 */
export function startConsolidationScheduler(intervalMs?: number): void {
  if (_timer) {
    logger.warn('Consolidation', 'Scheduler already running, skipping')
    return
  }

  const interval = intervalMs ?? DEFAULT_INTERVAL_MS

  // Run once after a 60s delay (after DB init + decay scheduler)
  setTimeout(() => {
    runConsolidation().catch(err => {
      logger.error('Consolidation', `Initial consolidation failed: ${err instanceof Error ? err.message : String(err)}`)
    })
  }, 60_000)

  _timer = setInterval(() => {
    runConsolidation().catch(err => {
      logger.error('Consolidation', `Consolidation cycle failed: ${err instanceof Error ? err.message : String(err)}`)
    })
  }, interval)

  if (_timer && typeof _timer === 'object' && 'unref' in _timer) {
    _timer.unref()
  }

  logger.info('Consolidation', `Started with interval ${Math.round(interval / 3600000)}h`)
}

export function stopConsolidationScheduler(): void {
  if (_timer) {
    clearInterval(_timer)
    _timer = null
    logger.info('Consolidation', 'Stopped')
  }
}
