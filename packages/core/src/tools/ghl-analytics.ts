/**
 * GHL Analytics Tools — Query Blade's own lead tracking database.
 * Data comes from GHL webhooks ingested at /api/webhooks/ghl.
 * Instant queries — no MCP pagination, no external DB.
 */

import { registerTool } from '../tool-registry.js'
import type { ToolCallResult, ExecutionContext } from '../types.js'
import { logger } from '@blade/shared'

function ok(toolName: string, input: Record<string, unknown>, data: unknown, display: string): ToolCallResult {
  return { toolUseId: '', toolName, input, success: true, data, display, durationMs: 0, timestamp: new Date().toISOString() }
}

function fail(toolName: string, input: Record<string, unknown>, message: string): ToolCallResult {
  return { toolUseId: '', toolName, input, success: false, data: null, display: message, durationMs: 0, timestamp: new Date().toISOString() }
}

// ============================================================
// INTRO RESPONSE RATE
// ============================================================

registerTool(
  {
    name: 'ghl_intro_response_rate',
    description: 'Get intro message response rates from lead tracking data. Shows how many leads replied to the first outbound message. Breaks down by intro template to show which messages work best.',
    input_schema: {
      type: 'object',
      properties: {
        account_id: { type: 'string', description: 'GHL location/account ID to filter. Leave empty for all accounts.' },
        days: { type: 'string', description: 'Number of days to look back (default: 30)' },
      },
      required: [],
    },
    category: 'web',
  },
  async (input) => {
    try {
      const { leadEngagement } = await import('@blade/db')
      const days = parseInt((input.days as string) ?? '30', 10)
      const accountId = input.account_id as string | undefined

      const overall = leadEngagement.introResponseRate({ accountId, days })
      const byTemplate = leadEngagement.byIntroTemplate({ accountId, days })

      if (overall.totalLeads === 0) {
        // Local DB empty — trigger a sync and tell user to retry
        try {
          const port = process.env.PORT ?? '3000'
          fetch(`http://localhost:${port}/api/leads/sync?all=true&days=30`).catch(() => {})
        } catch { /* ignore */ }
        return ok('ghl_intro_response_rate', input, { noData: true, syncTriggered: true },
          'No lead data in local database yet. I just triggered a sync from GHL — this pulls all messages via MCP and stores them locally. Try again in 2-3 minutes. Alternatively, use the recall_memory or web_search tools to check if there are cached reports.')
      }

      const lines = [
        `Intro Response Report (last ${days} days)`,
        ``,
        `Overall: ${overall.totalLeads} leads`,
        `  Replied to INTRO: ${overall.repliedToIntro} (${overall.introResponsePct}%)`,
        `  Replied to FOLLOW-UP: ${overall.repliedToFollowup}`,
        `  Never replied: ${overall.neverReplied}`,
        `  Overall response: ${overall.overallResponsePct}%`,
        `  Booked: ${overall.booked}`,
      ]

      if (byTemplate.length > 0) {
        lines.push('', 'By Intro Template:', '---')
        for (const t of byTemplate.slice(0, 10)) {
          lines.push(`  ${t.introResponsePct}% response (${t.repliedToIntro}/${t.sent}) [${t.source ?? 'unknown'}]`)
          lines.push(`  "${t.template}"`)
          lines.push('')
        }
      }

      return ok('ghl_intro_response_rate', input, { overall, byTemplate }, lines.join('\n'))
    } catch (err) {
      return fail('ghl_intro_response_rate', input, `Query failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
)

// ============================================================
// LEAD EVENTS — Recent activity
// ============================================================

registerTool(
  {
    name: 'ghl_lead_events',
    description: 'Get recent lead events — messages, appointments, contact creates. Shows real-time activity from GHL webhooks.',
    input_schema: {
      type: 'object',
      properties: {
        account_id: { type: 'string', description: 'Filter by GHL account ID' },
        event_type: { type: 'string', description: 'Filter: inbound_message, outbound_message, contact_created, appointment_booked' },
        limit: { type: 'string', description: 'Number of events (default: 30)' },
      },
      required: [],
    },
    category: 'web',
  },
  async (input) => {
    try {
      const { leadEvents } = await import('@blade/db')
      const events = leadEvents.recent({
        accountId: input.account_id as string | undefined,
        eventType: input.event_type as string | undefined,
        limit: parseInt((input.limit as string) ?? '30', 10),
      })

      if (events.length === 0) {
        return ok('ghl_lead_events', input, [], 'No events found. Webhooks may not be configured yet.')
      }

      const summary = events.slice(0, 20).map(e =>
        `${e.createdAt.slice(0, 16)} | ${e.eventType} | ${e.direction ?? ''} | ${e.handler ?? ''} | ${(e.messageBody ?? '').slice(0, 60)}`
      ).join('\n')

      return ok('ghl_lead_events', input, events, `${events.length} events:\n${summary}`)
    } catch (err) {
      return fail('ghl_lead_events', input, `Query failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
)

// ============================================================
// ACCOUNT ACTIVITY SUMMARY
// ============================================================

registerTool(
  {
    name: 'ghl_account_activity',
    description: 'Get activity summary per GHL account — total events, inbound vs outbound messages. Shows which accounts are active.',
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'string', description: 'Number of days (default: 30)' },
      },
      required: [],
    },
    category: 'web',
  },
  async (input) => {
    try {
      const { leadEvents } = await import('@blade/db')
      const days = parseInt((input.days as string) ?? '30', 10)
      const accounts = leadEvents.countByAccount(days)

      if (accounts.length === 0) {
        return ok('ghl_account_activity', input, [], 'No account activity. Webhooks may not be configured.')
      }

      const summary = accounts.map(a =>
        `${a.accountName ?? a.accountId}: ${a.totalEvents} events (${a.inbound} in, ${a.outbound} out)`
      ).join('\n')

      return ok('ghl_account_activity', input, accounts, `Account Activity (${days}d):\n${summary}`)
    } catch (err) {
      return fail('ghl_account_activity', input, `Query failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
)

logger.debug('Tools', 'GHL Analytics tools registered (intro_response_rate, lead_events, account_activity)')
