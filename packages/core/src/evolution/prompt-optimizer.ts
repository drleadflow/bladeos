import { getDb } from '@blade/db'
import { callModel, resolveSmartModelConfig } from '../model-provider.js'
import { logger } from '@blade/shared'

function db() {
  return getDb()
}

// Phrases that indicate user dissatisfaction
const NEGATIVE_SIGNALS = [
  'no',
  "that's wrong",
  'not what i meant',
  'not what i asked',
  'try again',
  'wrong',
  'incorrect',
  'not right',
  "that doesn't",
  "that's not",
  'please redo',
  'start over',
  'not helpful',
  "didn't work",
  'not quite',
  'nope',
  'ugh',
]

interface OptimizationResult {
  original: string
  optimized: string
  changes: string[]
}

/**
 * Analyze an employee's recent conversations and suggest an improved system prompt.
 * Returns null if no improvement needed or insufficient data.
 * Never throws.
 */
export async function optimizeEmployeePrompt(
  employeeId: string
): Promise<OptimizationResult | null> {
  try {
    // Look up the employee's current system prompt from the skills table
    // (employees use skills as their prompt source)
    const employee = db().prepare(
      `SELECT slug, name, description FROM employees WHERE slug = ? OR id = ?`
    ).get(employeeId, employeeId) as { slug: string; name: string; description: string } | undefined

    if (!employee) {
      logger.debug('PromptOptimizer', `Employee ${employeeId} not found`)
      return null
    }

    // Get the employee's skill/prompt
    const skill = db().prepare(
      `SELECT name, system_prompt FROM skills WHERE name = ?`
    ).get(employee.slug) as { name: string; system_prompt: string } | undefined

    const currentPrompt = skill?.system_prompt ?? employee.description

    // Find conversations involving this employee
    // Look at recent messages for negative signal patterns
    const recentMessages = db().prepare(
      `SELECT m.role, m.content, m.conversation_id
       FROM messages m
       ORDER BY m.created_at DESC
       LIMIT 200`
    ).all() as Array<{ role: string; content: string; conversation_id: string }>

    // Identify failure patterns: user messages that contain negative signals
    // immediately following an assistant message
    const failureExamples: string[] = []

    for (let i = 1; i < recentMessages.length; i++) {
      const current = recentMessages[i - 1] // more recent (desc order)
      const previous = recentMessages[i]     // older

      if (
        current.role === 'user' &&
        previous.role === 'assistant' &&
        current.conversation_id === previous.conversation_id
      ) {
        const userMsg = current.content.toLowerCase()
        const hasNegativeSignal = NEGATIVE_SIGNALS.some(signal => userMsg.includes(signal))

        if (hasNegativeSignal) {
          failureExamples.push(
            `Assistant said: "${previous.content.slice(0, 200)}..."\nUser responded: "${current.content.slice(0, 200)}"`
          )
        }
      }
    }

    if (failureExamples.length < 2) {
      logger.debug('PromptOptimizer', `Not enough failure examples for ${employeeId} (${failureExamples.length} found)`)
      return null
    }

    // Use haiku to generate an improved prompt
    const config = resolveSmartModelConfig('light')

    if (!config.apiKey) {
      logger.warn('PromptOptimizer', 'No API key available for prompt optimization')
      return null
    }

    const analysisPrompt = `You are a prompt optimization expert. Analyze the following system prompt and failure examples where the assistant gave unhelpful responses.

Current system prompt:
---
${currentPrompt}
---

Failure examples (where user was dissatisfied):
${failureExamples.slice(0, 5).map((ex, i) => `\n${i + 1}. ${ex}`).join('\n')}

Based on these failures, generate:
1. An improved system prompt that addresses the identified failure patterns
2. A JSON array of changes you made

Respond in this exact format:
PROMPT_START
<the improved system prompt>
PROMPT_END
CHANGES_START
["change 1 description", "change 2 description"]
CHANGES_END`

    const response = await callModel(
      config,
      'You are a prompt optimization expert. Output exactly in the requested format.',
      [{ role: 'user', content: analysisPrompt }],
      [],
      2048
    )

    const text = response.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map(b => b.text)
      .join('')

    // Parse the response
    const promptMatch = text.match(/PROMPT_START\s*([\s\S]*?)\s*PROMPT_END/)
    const changesMatch = text.match(/CHANGES_START\s*([\s\S]*?)\s*CHANGES_END/)

    if (!promptMatch) {
      logger.debug('PromptOptimizer', 'Could not parse improved prompt from response')
      return null
    }

    const optimized = promptMatch[1].trim()
    let changes: string[] = []

    if (changesMatch) {
      try {
        const parsed = JSON.parse(changesMatch[1].trim())
        if (Array.isArray(parsed)) {
          changes = parsed.filter((c: unknown) => typeof c === 'string')
        }
      } catch {
        changes = ['Prompt was rewritten to address failure patterns']
      }
    }

    if (optimized === currentPrompt) {
      return null
    }

    logger.info('PromptOptimizer', `Generated optimized prompt for ${employeeId} with ${changes.length} change(s)`)

    return {
      original: currentPrompt,
      optimized,
      changes,
    }
  } catch (err) {
    logger.debug('PromptOptimizer', `Prompt optimization failed (non-fatal): ${err}`)
    return null
  }
}
