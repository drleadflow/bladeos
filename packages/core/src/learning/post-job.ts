import type { AgentLoopResult } from '../types.js'
import { callModel, resolveSmartModelConfig } from '../model-provider.js'
import { memoryStore } from '../memory/memory-store.js'
import { skills } from '@blade/db'
import { logger } from '@blade/shared'

interface JobLearning {
  type: 'skill_result' | 'error_pattern'
  content: string
  tags: string[]
  skillName?: string
  skillSuccess?: boolean
}

const JOB_EXTRACTION_SYSTEM_PROMPT = `You are a learning extraction system for coding jobs. Analyze the job outcome and extract reusable learnings.

Return a JSON array of learnings. Each learning has:
- type: "skill_result" (what approach/tool worked well) or "error_pattern" (errors encountered and how they were resolved)
- content: A concise, self-contained statement (1-2 sentences max)
- tags: Array of 1-5 short keyword tags
- skillName: (optional) Name of a specific skill or tool that was used
- skillSuccess: (optional) Whether that skill/tool was successful

Rules:
- Focus on what approaches worked, what tools were most useful, and error patterns encountered
- Be concise and actionable — future jobs should benefit from these learnings
- If there are no meaningful learnings, return an empty array []
- Return ONLY the JSON array, no markdown fences or extra text`

/**
 * Extract learnings from a completed coding job and save as memories.
 * Fire-and-forget: never throws.
 */
export async function extractJobLearnings(
  jobId: string,
  title: string,
  description: string,
  result: AgentLoopResult
): Promise<void> {
  try {
    const config = resolveSmartModelConfig('light')

    if (!config.apiKey) {
      logger.warn('Learning', 'No API key available for job learning extraction, skipping')
      return
    }

    const summary = buildJobSummary(jobId, title, description, result)

    const response = await callModel(
      config,
      JOB_EXTRACTION_SYSTEM_PROMPT,
      [{ role: 'user', content: summary }],
      [],
      2048
    )

    const text = response.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map(b => b.text)
      .join('')

    const learnings = parseJobLearnings(text)

    for (const learning of learnings) {
      try {
        // Save the memory
        const keywords = learning.content
          .split(/\s+/)
          .filter(w => w.length > 3)
          .slice(0, 5)
          .join(' ')

        const existing = memoryStore.search(keywords, 3)
        const duplicate = existing.find(mem => {
          const memContent = mem.content.toLowerCase()
          const learningContent = learning.content.toLowerCase()
          return (
            memContent.includes(learningContent) ||
            learningContent.includes(memContent)
          )
        })

        if (duplicate) {
          memoryStore.reinforce(duplicate.id)
        } else {
          memoryStore.save(
            learning.content,
            learning.type,
            learning.tags,
            `job:${jobId}`
          )
        }

        // Record skill usage if applicable
        if (learning.skillName && learning.skillSuccess !== undefined) {
          try {
            skills.recordUse(learning.skillName, learning.skillSuccess)
          } catch {
            // Skill may not exist — that is fine
          }
        }
      } catch (err) {
        logger.debug('Learning', `Failed to save job learning: ${err}`)
      }
    }

    logger.info('Learning', `Extracted ${learnings.length} learnings from job ${jobId}`)
  } catch (err) {
    logger.debug('Learning', `Job learning extraction failed (non-fatal): ${err}`)
  }
}

function buildJobSummary(
  jobId: string,
  title: string,
  description: string,
  result: AgentLoopResult
): string {
  const parts: string[] = [
    `## Coding Job Summary`,
    `Job: ${title}`,
    `Description: ${description}`,
    `Outcome: ${result.stopReason}`,
    `Total tool calls: ${result.totalToolCalls}`,
    `Total cost: $${result.totalCost.toFixed(4)}`,
    `Turns: ${result.turns.length}`,
  ]

  // Collect tool usage stats
  const toolStats = new Map<string, { count: number; successCount: number }>()
  for (const turn of result.turns) {
    for (const tc of turn.toolCalls) {
      const entry = toolStats.get(tc.toolName) ?? { count: 0, successCount: 0 }
      entry.count++
      if (tc.success) entry.successCount++
      toolStats.set(tc.toolName, entry)
    }
  }

  if (toolStats.size > 0) {
    parts.push('\n## Tools Used')
    for (const [name, stats] of toolStats) {
      parts.push(`- ${name}: ${stats.count} calls, ${stats.successCount} successful`)
    }
  }

  // Include final response (truncated)
  if (result.finalResponse) {
    const maxLen = 3000
    const response = result.finalResponse.length > maxLen
      ? result.finalResponse.slice(0, maxLen) + '\n[truncated]'
      : result.finalResponse
    parts.push(`\n## Final Response\n${response}`)
  }

  return parts.join('\n')
}

function parseJobLearnings(text: string): JobLearning[] {
  try {
    const cleaned = text.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim()
    const parsed = JSON.parse(cleaned)

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter(
      (item: unknown): item is JobLearning =>
        typeof item === 'object' &&
        item !== null &&
        'type' in item &&
        'content' in item &&
        typeof (item as JobLearning).content === 'string' &&
        ['skill_result', 'error_pattern'].includes((item as JobLearning).type)
    ).map(item => ({
      type: item.type,
      content: item.content,
      tags: Array.isArray(item.tags) ? item.tags.filter((t: unknown) => typeof t === 'string') : [],
      skillName: typeof item.skillName === 'string' ? item.skillName : undefined,
      skillSuccess: typeof item.skillSuccess === 'boolean' ? item.skillSuccess : undefined,
    }))
  } catch {
    return []
  }
}
