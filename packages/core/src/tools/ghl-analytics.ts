/**
 * GHL Analytics Tools — Query the GHL Analytics Supabase database
 * for real-time lead tracking, response rates, and workflow performance.
 *
 * This connects to the GHL Analytics Dashboard (drleadflow/ghl-analytics)
 * which ingests GHL webhooks into Supabase. Much faster than MCP pagination.
 */

import { registerTool } from '../tool-registry.js'
import type { ToolCallResult, ExecutionContext } from '../types.js'
import { logger } from '@blade/shared'

function getSupabaseConfig() {
  const url = process.env.GHL_ANALYTICS_SUPABASE_URL
  const key = process.env.GHL_ANALYTICS_SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return { url, key }
}

async function supabaseQuery(sql: string): Promise<unknown> {
  const config = getSupabaseConfig()
  if (!config) throw new Error('GHL Analytics Supabase not configured (GHL_ANALYTICS_SUPABASE_URL / GHL_ANALYTICS_SUPABASE_SERVICE_KEY)')

  // Use Supabase REST API with raw SQL via rpc or direct query
  const res = await fetch(`${config.url}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'apikey': config.key,
      'Authorization': `Bearer ${config.key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({ query: sql }),
  })

  if (!res.ok) {
    // Fallback: use PostgREST query syntax instead of raw SQL
    throw new Error(`Supabase query failed (${res.status}): ${await res.text()}`)
  }

  return res.json()
}

async function supabaseGet(table: string, params: Record<string, string> = {}): Promise<unknown[]> {
  const config = getSupabaseConfig()
  if (!config) throw new Error('GHL Analytics Supabase not configured')

  const query = new URLSearchParams(params)
  const res = await fetch(`${config.url}/rest/v1/${table}?${query}`, {
    headers: {
      'apikey': config.key,
      'Authorization': `Bearer ${config.key}`,
      'Accept': 'application/json',
    },
  })

  if (!res.ok) {
    throw new Error(`Supabase GET ${table} failed (${res.status}): ${(await res.text()).slice(0, 300)}`)
  }

  return res.json() as Promise<unknown[]>
}

function ok(toolName: string, input: Record<string, unknown>, data: unknown, display: string): ToolCallResult {
  return { toolUseId: '', toolName, input, success: true, data, display, durationMs: 0, timestamp: new Date().toISOString() }
}

function fail(toolName: string, input: Record<string, unknown>, message: string): ToolCallResult {
  return { toolUseId: '', toolName, input, success: false, data: null, display: message, durationMs: 0, timestamp: new Date().toISOString() }
}

// ============================================================
// INTRO RESPONSE RATE — per account, per workflow
// ============================================================

registerTool(
  {
    name: 'ghl_intro_response_rate',
    description: 'Get intro message response rates from the GHL Analytics database. Shows how many leads replied to the first outbound message, broken down by workflow and handler type. Much faster than MCP — queries Supabase directly.',
    input_schema: {
      type: 'object',
      properties: {
        account_name: { type: 'string', description: 'Account name to filter (partial match). Leave empty for all accounts.' },
        days: { type: 'string', description: 'Number of days to look back (default: 30)' },
      },
      required: [],
    },
    category: 'web',
  },
  async (input) => {
    try {
      const days = parseInt((input.days as string) ?? '30', 10)
      const accountName = input.account_name as string | undefined

      // Get lead engagement data
      const params: Record<string, string> = {
        select: 'contact_id,is_responded,is_booked,is_dead,engagement_status,current_handler,first_seen_at,first_responded_at,form_id,form_type',
        'first_seen_at': `gte.${new Date(Date.now() - days * 86_400_000).toISOString()}`,
        order: 'first_seen_at.desc',
        limit: '1000',
      }

      const engagements = await supabaseGet('lead_engagement', params) as Array<{
        contact_id: string; is_responded: boolean; is_booked: boolean; is_dead: boolean
        engagement_status: string; current_handler: string; first_seen_at: string
        first_responded_at: string | null; form_id: string | null; form_type: string | null
      }>

      if (engagements.length === 0) {
        return ok('ghl_intro_response_rate', input, { noData: true },
          'No lead engagement data found. Make sure the GHL Analytics webhook is receiving events.')
      }

      const total = engagements.length
      const responded = engagements.filter(e => e.is_responded).length
      const booked = engagements.filter(e => e.is_booked).length
      const dead = engagements.filter(e => e.is_dead).length

      // By handler
      const byHandler: Record<string, { total: number; responded: number }> = {}
      for (const e of engagements) {
        const handler = e.current_handler ?? 'unknown'
        if (!byHandler[handler]) byHandler[handler] = { total: 0, responded: 0 }
        byHandler[handler].total++
        if (e.is_responded) byHandler[handler].responded++
      }

      // By engagement status
      const byStatus: Record<string, number> = {}
      for (const e of engagements) {
        byStatus[e.engagement_status] = (byStatus[e.engagement_status] ?? 0) + 1
      }

      // Response time (for those who responded)
      const responseTimes = engagements
        .filter(e => e.first_responded_at && e.first_seen_at)
        .map(e => (new Date(e.first_responded_at!).getTime() - new Date(e.first_seen_at).getTime()) / 3_600_000)
      const avgResponseHours = responseTimes.length > 0
        ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length * 10) / 10
        : 0

      const summary = [
        `Lead Response Report (last ${days} days)`,
        ``,
        `Overall: ${total} leads, ${responded} responded (${Math.round(100 * responded / total)}%), ${booked} booked (${Math.round(100 * booked / total)}%)`,
        `Dead/DQ: ${dead} (${Math.round(100 * dead / total)}%)`,
        `Avg response time: ${avgResponseHours}h`,
        ``,
        `By Handler:`,
        ...Object.entries(byHandler).map(([h, d]) =>
          `  ${h}: ${d.total} leads, ${Math.round(100 * d.responded / d.total)}% responded`
        ),
        ``,
        `By Status:`,
        ...Object.entries(byStatus).map(([s, c]) => `  ${s}: ${c}`),
      ].join('\n')

      return ok('ghl_intro_response_rate', input, { total, responded, booked, dead, byHandler, byStatus, avgResponseHours }, summary)
    } catch (err) {
      return fail('ghl_intro_response_rate', input, `Query failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
)

// ============================================================
// LEAD EVENTS — Recent activity feed
// ============================================================

registerTool(
  {
    name: 'ghl_lead_events',
    description: 'Get recent lead events from the GHL Analytics database. Shows what happened — messages, appointments, tag changes, pipeline moves.',
    input_schema: {
      type: 'object',
      properties: {
        event_type: { type: 'string', description: 'Filter by event type: inbound_message, outbound_message, appointment_booked, contact_created, etc.' },
        contact_id: { type: 'string', description: 'Filter by specific contact ID' },
        limit: { type: 'string', description: 'Number of events (default: 50)' },
      },
      required: [],
    },
    category: 'web',
  },
  async (input) => {
    try {
      const limit = (input.limit as string) ?? '50'
      const params: Record<string, string> = {
        select: 'id,contact_id,event_type,channel,direction,handler,metadata,created_at',
        order: 'created_at.desc',
        limit,
      }

      if (input.event_type) params['event_type'] = `eq.${input.event_type}`
      if (input.contact_id) params['contact_id'] = `eq.${input.contact_id}`

      const events = await supabaseGet('lead_events', params) as Array<{
        id: string; contact_id: string; event_type: string; channel: string
        direction: string; handler: string; metadata: unknown; created_at: string
      }>

      if (events.length === 0) {
        return ok('ghl_lead_events', input, [], 'No events found.')
      }

      const summary = events.slice(0, 20).map(e =>
        `${e.created_at.slice(0, 16)} | ${e.event_type} | ${e.direction ?? ''} | ${e.handler ?? ''} | ${e.contact_id.slice(0, 8)}...`
      ).join('\n')

      return ok('ghl_lead_events', input, events, `${events.length} events:\n${summary}`)
    } catch (err) {
      return fail('ghl_lead_events', input, `Query failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
)

// ============================================================
// WORKFLOW PERFORMANCE — Response rates by workflow
// ============================================================

registerTool(
  {
    name: 'ghl_workflow_performance',
    description: 'Get performance metrics per GHL workflow — how many leads entered, responded, booked, went dead. Use to compare which workflows and intro messages work best.',
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'string', description: 'Number of days to look back (default: 30)' },
      },
      required: [],
    },
    category: 'web',
  },
  async (input) => {
    try {
      const days = parseInt((input.days as string) ?? '30', 10)
      const since = new Date(Date.now() - days * 86_400_000).toISOString()

      const workflows = await supabaseGet('contact_workflows', {
        select: 'workflow_id,workflow_name,contact_id,status,entered_at',
        'entered_at': `gte.${since}`,
        order: 'entered_at.desc',
        limit: '2000',
      }) as Array<{
        workflow_id: string; workflow_name: string; contact_id: string
        status: string; entered_at: string
      }>

      if (workflows.length === 0) {
        return ok('ghl_workflow_performance', input, { noData: true },
          'No workflow data found. Workflows get tracked when GHL sends webhook events.')
      }

      // Group by workflow
      const byWorkflow: Record<string, { name: string; entered: number; completed: number; removed: number; contacts: Set<string> }> = {}
      for (const w of workflows) {
        if (!byWorkflow[w.workflow_id]) {
          byWorkflow[w.workflow_id] = { name: w.workflow_name, entered: 0, completed: 0, removed: 0, contacts: new Set() }
        }
        const wf = byWorkflow[w.workflow_id]
        wf.entered++
        wf.contacts.add(w.contact_id)
        if (w.status === 'completed') wf.completed++
        if (w.status === 'removed') wf.removed++
      }

      // Now check response rates for these contacts
      const contactIds = [...new Set(workflows.map(w => w.contact_id))]
      let engagements: Array<{ contact_id: string; is_responded: boolean; is_booked: boolean }> = []

      // Batch fetch engagements (Supabase limits)
      for (let i = 0; i < contactIds.length; i += 100) {
        const batch = contactIds.slice(i, i + 100)
        const result = await supabaseGet('lead_engagement', {
          select: 'contact_id,is_responded,is_booked',
          'contact_id': `in.(${batch.join(',')})`,
        }) as Array<{ contact_id: string; is_responded: boolean; is_booked: boolean }>
        engagements.push(...result)
      }

      const engagementMap = new Map(engagements.map(e => [e.contact_id, e]))

      const summary = Object.entries(byWorkflow)
        .sort((a, b) => b[1].entered - a[1].entered)
        .map(([id, wf]) => {
          const responded = [...wf.contacts].filter(c => engagementMap.get(c)?.is_responded).length
          const booked = [...wf.contacts].filter(c => engagementMap.get(c)?.is_booked).length
          const responseRate = wf.contacts.size > 0 ? Math.round(100 * responded / wf.contacts.size) : 0
          const bookRate = wf.contacts.size > 0 ? Math.round(100 * booked / wf.contacts.size) : 0
          return `${wf.name}\n  ${wf.contacts.size} leads | ${responseRate}% responded | ${bookRate}% booked | ${wf.completed} completed | ${wf.removed} removed`
        })
        .join('\n\n')

      return ok('ghl_workflow_performance', input, byWorkflow,
        `Workflow Performance (last ${days} days):\n\n${summary}`)
    } catch (err) {
      return fail('ghl_workflow_performance', input, `Query failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
)

logger.debug('Tools', 'GHL Analytics tools registered (intro_response_rate, lead_events, workflow_performance)')
