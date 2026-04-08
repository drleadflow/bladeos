import { getDb } from '@blade/db'
import { memoryStore } from '../memory/memory-store.js'
import { callModel, resolveSmartModelConfig } from '../model-provider.js'
import { logger } from '@blade/shared'

// ============================================================
// TYPES
// ============================================================

export interface EvolutionEvent {
  type: 'skill_improved' | 'new_skill_created' | 'tool_discovered' | 'prompt_optimized' | 'pattern_learned'
  description: string
  before?: string
  after?: string
  impact?: string
  timestamp: string
}

// Known tools -> npm packages or MCP servers for discovery
const KNOWN_TOOL_MAP: Record<string, { npm?: string; mcp?: string; description: string }> = {
  'GoHighLevel': { mcp: 'ghl-mcp-server', description: 'CRM and marketing automation platform' },
  'Stripe': { npm: 'stripe', description: 'Payment processing API' },
  'Calendly': { npm: 'calendly-api', description: 'Scheduling and booking API' },
  'HubSpot': { npm: '@hubspot/api-client', description: 'CRM and marketing platform' },
  'Salesforce': { npm: 'jsforce', description: 'CRM platform API' },
  'Mailchimp': { npm: '@mailchimp/mailchimp_marketing', description: 'Email marketing API' },
  'Slack': { npm: '@slack/web-api', mcp: 'slack-mcp-server', description: 'Team messaging platform' },
  'Notion': { npm: '@notionhq/client', mcp: 'notion-mcp-server', description: 'Workspace and documentation API' },
  'Airtable': { npm: 'airtable', mcp: 'airtable-mcp-server', description: 'Database/spreadsheet platform' },
  'Shopify': { npm: '@shopify/shopify-api', description: 'E-commerce platform API' },
  'QuickBooks': { npm: 'node-quickbooks', description: 'Accounting software API' },
  'Twilio': { npm: 'twilio', description: 'Communication APIs (SMS, voice, video)' },
  'SendGrid': { npm: '@sendgrid/mail', description: 'Email delivery API' },
  'Intercom': { npm: 'intercom-client', description: 'Customer messaging platform' },
  'Google Sheets': { npm: 'googleapis', mcp: 'google-sheets-mcp', description: 'Spreadsheet API' },
  'Google Calendar': { npm: 'googleapis', mcp: 'google-calendar-mcp', description: 'Calendar API' },
  'WhatsApp': { npm: 'whatsapp-web.js', description: 'WhatsApp messaging API' },
  'Facebook': { npm: 'facebook-nodejs-business-sdk', description: 'Facebook Marketing API' },
  'LinkedIn': { description: 'LinkedIn API for social media' },
  'TikTok': { description: 'TikTok API for social media' },
}

function db() {
  return getDb()
}

function now(): string {
  return new Date().toISOString()
}

// ============================================================
// EVOLUTION CYCLE
// ============================================================

/**
 * Run a full self-evolution cycle. Analyzes failures, optimizes skills,
 * discovers tools, and learns patterns. Never throws.
 */
export async function runEvolutionCycle(): Promise<EvolutionEvent[]> {
  const events: EvolutionEvent[] = []

  try {
    // (a) Analyze recent failures — look for recurring error patterns
    const failureEvents = await analyzeRecentFailures()
    events.push(...failureEvents)
  } catch (err) {
    logger.debug('Evolution', `Failure analysis failed (non-fatal): ${err}`)
  }

  try {
    // (b) Optimize popular skills with low success rates
    const optimizeEvents = await optimizePopularSkills()
    events.push(...optimizeEvents)
  } catch (err) {
    logger.debug('Evolution', `Skill optimization failed (non-fatal): ${err}`)
  }

  try {
    // (c) Discover missing tools from improvement queue
    const toolEvents = discoverMissingTools()
    events.push(...toolEvents)
  } catch (err) {
    logger.debug('Evolution', `Tool discovery failed (non-fatal): ${err}`)
  }

  try {
    // (d) Learn from successful patterns
    const patternEvents = learnSuccessfulPatterns()
    events.push(...patternEvents)
  } catch (err) {
    logger.debug('Evolution', `Pattern learning failed (non-fatal): ${err}`)
  }

  // (e) Store all events in the evolution_events table
  for (const event of events) {
    try {
      db().prepare(
        `INSERT INTO evolution_events (id, type, description, before_value, after_value, impact, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        event.type,
        event.description,
        event.before ?? null,
        event.after ?? null,
        event.impact ?? null,
        event.timestamp
      )
    } catch (err) {
      logger.debug('Evolution', `Failed to record event: ${err}`)
    }
  }

  logger.info('Evolution', `Evolution cycle complete: ${events.length} event(s)`)
  return events
}

// ============================================================
// (a) ANALYZE RECENT FAILURES
// ============================================================

async function analyzeRecentFailures(): Promise<EvolutionEvent[]> {
  const events: EvolutionEvent[] = []

  // Query memories for error_pattern type
  let errorMemories: Array<{ id: string; content: string; accessCount: number }>
  try {
    errorMemories = memoryStore.search('error_pattern', 50) as Array<{ id: string; content: string; accessCount: number }>
  } catch {
    errorMemories = (memoryStore.getAll(100) as Array<{ id: string; type: string; content: string; accessCount: number }>)
      .filter(m => m.type === 'error_pattern')
  }

  if (errorMemories.length < 3) {
    return events
  }

  // Group similar errors by keyword overlap
  const errorGroups = groupSimilarErrors(errorMemories.map(m => m.content))

  for (const [pattern, count] of Object.entries(errorGroups)) {
    if (count >= 3) {
      // This error appeared 3+ times — generate a skill suggestion
      try {
        const config = resolveSmartModelConfig('light')

        if (!config.apiKey) continue

        const response = await callModel(
          config,
          'You are a skill improvement advisor. Given a recurring error pattern, suggest a concise system prompt addition (2-3 sentences) that would help an AI agent handle this error better. Respond with ONLY the suggested text, no explanation.',
          [{ role: 'user', content: `This error has occurred ${count} times:\n\n${pattern}` }],
          [],
          512
        )

        const suggestion = response.content
          .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
          .map(b => b.text)
          .join('')
          .trim()

        if (suggestion) {
          events.push({
            type: 'new_skill_created',
            description: `Generated handling guidance for recurring error: "${pattern.slice(0, 80)}..."`,
            before: `Error occurred ${count} times with no specific handling`,
            after: suggestion.slice(0, 200),
            impact: `Should reduce recurrence of this error pattern`,
            timestamp: now(),
          })
        }
      } catch {
        // LLM call failed — skip this pattern
      }
    }
  }

  return events
}

function groupSimilarErrors(contents: string[]): Record<string, number> {
  const groups: Record<string, number> = {}

  for (const content of contents) {
    // Extract a normalized key: first 60 chars, lowered, trimmed
    const key = content.toLowerCase().trim().slice(0, 60)
    let matched = false

    for (const existing of Object.keys(groups)) {
      // Check if this content is similar to an existing group
      if (existing.includes(key.slice(0, 30)) || key.includes(existing.slice(0, 30))) {
        groups[existing]++
        matched = true
        break
      }
    }

    if (!matched) {
      groups[key] = 1
    }
  }

  return groups
}

// ============================================================
// (b) OPTIMIZE POPULAR SKILLS
// ============================================================

async function optimizePopularSkills(): Promise<EvolutionEvent[]> {
  const events: EvolutionEvent[] = []

  const popularSkills = db().prepare(
    `SELECT name, description, system_prompt, success_rate, total_uses
     FROM skills WHERE total_uses >= 10 AND success_rate < 0.7
     ORDER BY total_uses DESC LIMIT 5`
  ).all() as Array<{ name: string; description: string; system_prompt: string; success_rate: number; total_uses: number }>

  for (const skill of popularSkills) {
    try {
      const config = resolveSmartModelConfig('light')

      if (!config.apiKey) continue

      const response = await callModel(
        config,
        `You are a prompt optimization expert. Improve this system prompt to increase its success rate. The current success rate is ${(skill.success_rate * 100).toFixed(0)}% across ${skill.total_uses} uses. Return ONLY the improved system prompt, nothing else.`,
        [{ role: 'user', content: `Skill: ${skill.name}\nDescription: ${skill.description}\n\nCurrent system prompt:\n${skill.system_prompt}` }],
        [],
        1024
      )

      const improved = response.content
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map(b => b.text)
        .join('')
        .trim()

      if (improved && improved !== skill.system_prompt) {
        events.push({
          type: 'skill_improved',
          description: `Suggested improvement for skill "${skill.name}" (${(skill.success_rate * 100).toFixed(0)}% success rate, ${skill.total_uses} uses)`,
          before: skill.system_prompt.slice(0, 200),
          after: improved.slice(0, 200),
          impact: `Targeting improved success rate from ${(skill.success_rate * 100).toFixed(0)}%`,
          timestamp: now(),
        })
      }
    } catch {
      // LLM call failed — skip this skill
    }
  }

  return events
}

// ============================================================
// (c) DISCOVER MISSING TOOLS
// ============================================================

function discoverMissingTools(): EvolutionEvent[] {
  const events: EvolutionEvent[] = []

  const pending = db().prepare(
    `SELECT id, type, description FROM improvement_queue
     WHERE status = 'pending'
     ORDER BY created_at ASC LIMIT 20`
  ).all() as Array<{ id: string; type: string; description: string }>

  for (const item of pending) {
    const lower = item.description.toLowerCase()

    for (const [toolName, info] of Object.entries(KNOWN_TOOL_MAP)) {
      if (lower.includes(toolName.toLowerCase())) {
        const packageInfo = info.npm ? `npm: ${info.npm}` : info.mcp ? `mcp: ${info.mcp}` : 'no package found'

        events.push({
          type: 'tool_discovered',
          description: `Discovered ${toolName} integration needed: ${info.description}`,
          after: `Recommended package: ${packageInfo}`,
          impact: `Would enable ${toolName} integration for queued improvement: "${item.description.slice(0, 80)}"`,
          timestamp: now(),
        })
        break
      }
    }
  }

  return events
}

// ============================================================
// (d) LEARN FROM SUCCESSFUL PATTERNS
// ============================================================

function learnSuccessfulPatterns(): EvolutionEvent[] {
  const events: EvolutionEvent[] = []

  // Query recent successful tool call chains from the tool_calls table
  const recentConversations = db().prepare(
    `SELECT conversation_id, tool_name, success
     FROM tool_calls
     WHERE success = 1
     ORDER BY created_at DESC
     LIMIT 500`
  ).all() as Array<{ conversation_id: string; tool_name: string; success: number }>

  // Group by conversation
  const byConversation = new Map<string, string[]>()
  for (const row of recentConversations) {
    const existing = byConversation.get(row.conversation_id) ?? []
    existing.push(row.tool_name)
    byConversation.set(row.conversation_id, existing)
  }

  // Find repeated sequences of 3+ tools
  const sequenceCounts = new Map<string, number>()
  for (const tools of byConversation.values()) {
    if (tools.length < 3) continue

    // Extract sliding windows of size 3
    for (let i = 0; i <= tools.length - 3; i++) {
      const seq = tools.slice(i, i + 3).join(' -> ')
      sequenceCounts.set(seq, (sequenceCounts.get(seq) ?? 0) + 1)
    }
  }

  // Record patterns that appear 3+ times
  for (const [sequence, count] of sequenceCounts) {
    if (count >= 3) {
      // Check if we already have a memory for this pattern
      const existing = memoryStore.search(sequence.replace(/ -> /g, ' '), 3)
      const alreadyKnown = existing.some(m => m.content.includes(sequence))

      if (!alreadyKnown) {
        memoryStore.save(
          `Successful tool pattern (used ${count} times): ${sequence}`,
          'skill_result',
          ['pattern', ...sequence.split(' -> ').map(s => s.trim())],
          'evolution'
        )

        events.push({
          type: 'pattern_learned',
          description: `Discovered frequently-used tool chain: ${sequence} (${count} occurrences)`,
          impact: `Pattern saved to memory for future reference`,
          timestamp: now(),
        })
      }
    }
  }

  return events
}
