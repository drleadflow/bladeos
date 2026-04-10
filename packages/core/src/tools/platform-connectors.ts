/**
 * Platform Connector Tools — Read metrics from ad platforms and analytics tools.
 * Used by the CSM agent to monitor client performance.
 *
 * Supports: Meta Ads, Google Ads (read-only), generic webhook/API fetch.
 * All tools are READ-ONLY — no approval gates needed.
 */

import { registerTool } from '../tool-registry.js'
import { clientAccounts, clientHealthSnapshots, activityEvents } from '@blade/db'
import type { ToolCallResult, ExecutionContext } from '../types.js'
import { logger } from '@blade/shared'

function ok(toolName: string, input: Record<string, unknown>, data: unknown, display: string): ToolCallResult {
  return { toolUseId: '', toolName, input, success: true, data, display, durationMs: 0, timestamp: new Date().toISOString() }
}

function fail(toolName: string, input: Record<string, unknown>, message: string): ToolCallResult {
  return { toolUseId: '', toolName, input, success: false, data: null, display: message, durationMs: 0, timestamp: new Date().toISOString() }
}

// ============================================================
// META ADS API — Read campaign performance
// ============================================================

registerTool(
  {
    name: 'meta_ads_get_performance',
    description: 'Fetch Meta (Facebook/Instagram) Ads performance metrics for a client account. Returns spend, impressions, clicks, conversions, ROAS, CPL, CPA for the specified date range.',
    input_schema: {
      type: 'object',
      properties: {
        client_slug: { type: 'string', description: 'Client account slug' },
        date_preset: { type: 'string', description: 'Date range: today, yesterday, last_7d, last_14d, last_30d, this_month, last_month' },
      },
      required: ['client_slug'],
    },
    category: 'web',
  },
  async (input) => {
    const slug = input.client_slug as string
    const datePreset = (input.date_preset as string) ?? 'last_7d'

    const client = clientAccounts.get(slug)
    if (!client) return fail('meta_ads_get_performance', input, `Client "${slug}" not found`)

    let platforms: Record<string, Record<string, string>>
    try { platforms = JSON.parse(client.platformsJson) } catch { return fail('meta_ads_get_performance', input, 'Invalid platform config') }

    const meta = platforms.meta
    if (!meta?.account_id || !meta?.access_token) {
      return fail('meta_ads_get_performance', input, `Meta Ads not configured for client "${slug}". Set platforms.meta.account_id and platforms.meta.access_token.`)
    }

    // Map date preset to Meta API format
    const metaPresets: Record<string, string> = {
      today: 'today', yesterday: 'yesterday', last_7d: 'last_7d',
      last_14d: 'last_14d', last_30d: 'last_30d', this_month: 'this_month', last_month: 'last_month',
    }
    const preset = metaPresets[datePreset] ?? 'last_7d'

    try {
      const url = `https://graph.facebook.com/v19.0/act_${meta.account_id}/insights?` +
        `fields=spend,impressions,clicks,actions,cost_per_action_type,purchase_roas&` +
        `date_preset=${preset}&access_token=${meta.access_token}`

      const res = await fetch(url)
      if (!res.ok) {
        const errText = await res.text()
        return fail('meta_ads_get_performance', input, `Meta API error (${res.status}): ${errText.slice(0, 300)}`)
      }

      const data = await res.json() as { data?: Array<Record<string, unknown>> }
      const row = data.data?.[0]
      if (!row) {
        return ok('meta_ads_get_performance', input, { datePreset, noData: true }, `No Meta Ads data for "${slug}" in ${datePreset}`)
      }

      // Extract key metrics
      const spend = parseFloat(String(row.spend ?? '0'))
      const impressions = parseInt(String(row.impressions ?? '0'), 10)
      const clicks = parseInt(String(row.clicks ?? '0'), 10)
      const ctr = impressions > 0 ? (clicks / impressions * 100) : 0

      // Extract conversions from actions array
      const actions = (row.actions ?? []) as Array<{ action_type: string; value: string }>
      const leads = actions.find(a => a.action_type === 'lead')
      const purchases = actions.find(a => a.action_type === 'purchase')
      const leadCount = parseInt(leads?.value ?? '0', 10)
      const purchaseCount = parseInt(purchases?.value ?? '0', 10)

      // ROAS
      const roasArr = (row.purchase_roas ?? []) as Array<{ action_type: string; value: string }>
      const roas = parseFloat(roasArr[0]?.value ?? '0')

      // CPL and CPA
      const costPerAction = (row.cost_per_action_type ?? []) as Array<{ action_type: string; value: string }>
      const cpl = parseFloat(costPerAction.find(c => c.action_type === 'lead')?.value ?? '0')
      const cpa = parseFloat(costPerAction.find(c => c.action_type === 'purchase')?.value ?? '0')

      const metrics = {
        datePreset,
        spend: Math.round(spend * 100) / 100,
        impressions,
        clicks,
        ctr: Math.round(ctr * 100) / 100,
        leads: leadCount,
        purchases: purchaseCount,
        cpl: Math.round(cpl * 100) / 100,
        cpa: Math.round(cpa * 100) / 100,
        roas: Math.round(roas * 100) / 100,
      }

      const summary = [
        `Meta Ads (${datePreset}) for ${client.name}:`,
        `Spend: $${metrics.spend} | Impressions: ${metrics.impressions} | Clicks: ${metrics.clicks} (${metrics.ctr}% CTR)`,
        `Leads: ${metrics.leads} (CPL: $${metrics.cpl}) | Purchases: ${metrics.purchases} (CPA: $${metrics.cpa})`,
        `ROAS: ${metrics.roas}x`,
      ].join('\n')

      return ok('meta_ads_get_performance', input, metrics, summary)
    } catch (err) {
      return fail('meta_ads_get_performance', input, `Meta API call failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
)

// ============================================================
// CLIENT HEALTH CHECK — Score client against their KPI targets
// ============================================================

registerTool(
  {
    name: 'check_client_health',
    description: 'Run a health check on a client account. Compares current metrics against KPI targets and returns a health score (0-100) with alerts for any metrics below threshold.',
    input_schema: {
      type: 'object',
      properties: {
        client_slug: { type: 'string', description: 'Client account slug' },
        metrics: {
          type: 'object',
          description: 'Current metric values to check. Keys are metric names (e.g. "roas", "cpl", "spend"), values are numbers.',
        },
      },
      required: ['client_slug', 'metrics'],
    },
    category: 'web',
  },
  async (input) => {
    const slug = input.client_slug as string
    const metrics = input.metrics as Record<string, number>

    const client = clientAccounts.get(slug)
    if (!client) return fail('check_client_health', input, `Client "${slug}" not found`)

    let targets: Array<{ metric: string; target: number; warning: number; critical: number; direction: string }>
    try { targets = JSON.parse(client.kpiTargetsJson) } catch { targets = [] }

    if (targets.length === 0) {
      return fail('check_client_health', input, `No KPI targets configured for "${slug}". Set kpi_targets_json on the client account.`)
    }

    const alerts: Array<{ metric: string; value: number; target: number; severity: string }> = []
    let totalScore = 0
    let scoredMetrics = 0

    for (const target of targets) {
      const value = metrics[target.metric]
      if (value === undefined) continue

      scoredMetrics++
      const isHigherBetter = target.direction === 'higher_is_better'

      if (isHigherBetter) {
        if (value >= target.target) {
          totalScore += 100
        } else if (value >= target.warning) {
          totalScore += 60
          alerts.push({ metric: target.metric, value, target: target.target, severity: 'warning' })
        } else {
          totalScore += 20
          alerts.push({ metric: target.metric, value, target: target.target, severity: 'critical' })
        }
      } else {
        // Lower is better (e.g., CPL, CPA)
        if (value <= target.target) {
          totalScore += 100
        } else if (value <= target.warning) {
          totalScore += 60
          alerts.push({ metric: target.metric, value, target: target.target, severity: 'warning' })
        } else {
          totalScore += 20
          alerts.push({ metric: target.metric, value, target: target.target, severity: 'critical' })
        }
      }
    }

    const healthScore = scoredMetrics > 0 ? Math.round(totalScore / scoredMetrics) : 0
    const healthStatus = healthScore >= 80 ? 'healthy' : healthScore >= 50 ? 'warning' : 'critical'

    // Persist health data
    clientAccounts.updateHealth(client.id, { healthScore, healthStatus })
    clientHealthSnapshots.record({
      clientId: client.id,
      healthScore,
      healthStatus,
      metrics,
      alerts: alerts.length > 0 ? alerts : undefined,
    })

    // Emit activity event for alerts
    if (alerts.length > 0) {
      activityEvents.emit({
        eventType: 'client.health_alert',
        actorType: 'system',
        actorId: 'csm-agent',
        summary: `${client.name}: ${alerts.length} metric${alerts.length !== 1 ? 's' : ''} below target (health: ${healthScore}/100)`,
        targetType: 'client',
        targetId: client.id,
        detail: { healthScore, healthStatus, alerts, metrics },
      })
    }

    const alertSummary = alerts.length > 0
      ? '\nAlerts:\n' + alerts.map(a => `  ${a.severity.toUpperCase()}: ${a.metric} = ${a.value} (target: ${a.target})`).join('\n')
      : '\nAll metrics on target.'

    return ok('check_client_health', input, { healthScore, healthStatus, alerts, scoredMetrics },
      `${client.name} health: ${healthScore}/100 (${healthStatus})${alertSummary}`)
  }
)

// ============================================================
// LIST CLIENTS — Get all client accounts
// ============================================================

registerTool(
  {
    name: 'list_clients',
    description: 'List all client accounts with their current health status. Use to get an overview of all clients the CSM agent is monitoring.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter by status: active, paused, churned, onboarding. Leave empty for all.' },
      },
      required: [],
    },
    category: 'web',
  },
  async (input) => {
    const status = input.status as string | undefined
    const clients = clientAccounts.list({ status: status || undefined })

    if (clients.length === 0) {
      return ok('list_clients', input, [], 'No client accounts found. Use the client management API to add clients.')
    }

    const summary = clients.map(c =>
      `${c.name} (${c.slug}) — ${c.healthStatus} (${c.healthScore}/100) | ${c.serviceType} | $${c.monthlyRetainerUsd}/mo`
    ).join('\n')

    return ok('list_clients', input, clients, `${clients.length} client(s):\n${summary}`)
  }
)

// ============================================================
// GET CLIENT HISTORY — Health trend data
// ============================================================

registerTool(
  {
    name: 'get_client_health_history',
    description: 'Get health check history for a client. Returns trend data showing how their metrics have changed over time.',
    input_schema: {
      type: 'object',
      properties: {
        client_slug: { type: 'string', description: 'Client account slug' },
        limit: { type: 'string', description: 'Number of snapshots to return (default 14)' },
      },
      required: ['client_slug'],
    },
    category: 'web',
  },
  async (input) => {
    const slug = input.client_slug as string
    const limit = parseInt(String(input.limit ?? '14'), 10)

    const client = clientAccounts.get(slug)
    if (!client) return fail('get_client_health_history', input, `Client "${slug}" not found`)

    const history = clientHealthSnapshots.history(client.id, limit)
    if (history.length === 0) {
      return ok('get_client_health_history', input, [], `No health history for "${slug}" yet. Run a health check first.`)
    }

    const summary = history.map(h => {
      const metrics = JSON.parse(h.metricsJson) as Record<string, number>
      const metricStr = Object.entries(metrics).map(([k, v]) => `${k}: ${v}`).join(', ')
      return `${h.checkedAt.slice(0, 10)} — ${h.healthStatus} (${h.healthScore}/100) | ${metricStr}`
    }).join('\n')

    return ok('get_client_health_history', input, history, `Health history for ${client.name} (last ${history.length}):\n${summary}`)
  }
)

// ============================================================
// GENERIC API FETCH — Read from any analytics platform
// ============================================================

registerTool(
  {
    name: 'fetch_analytics_api',
    description: 'Fetch data from any analytics API (Triple Whale, Amazon Seller Central, MyRealProfit, etc.). Makes an authenticated GET request and returns the JSON response. READ-ONLY — never sends POST/PUT/DELETE.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full API URL to fetch (GET only)' },
        auth_header: { type: 'string', description: 'Authorization header value (e.g., "Bearer xxx" or "ApiKey xxx")' },
        description: { type: 'string', description: 'What this API call is fetching (for logging)' },
      },
      required: ['url'],
    },
    category: 'web',
  },
  async (input) => {
    const url = input.url as string
    const authHeader = input.auth_header as string | undefined
    const desc = (input.description as string) ?? 'analytics data'

    // Safety: only allow GET requests to known analytics domains
    const allowedDomains = [
      'app.triplewhale.com', 'api.triplewhale.com',
      'sellingpartnerapi', 'advertising-api.amazon.com',
      'api.myrealprofit.com', 'app.myrealprofit.com',
      'graph.facebook.com',
      'googleads.googleapis.com',
      'analytics.google.com', 'analyticsdata.googleapis.com',
    ]

    try {
      const parsed = new URL(url)
      const isDomainAllowed = allowedDomains.some(d => parsed.hostname.includes(d))
      if (!isDomainAllowed) {
        return fail('fetch_analytics_api', input, `Domain "${parsed.hostname}" is not in the allowed analytics platforms list. Allowed: ${allowedDomains.join(', ')}`)
      }
    } catch {
      return fail('fetch_analytics_api', input, `Invalid URL: "${url}"`)
    }

    try {
      const headers: Record<string, string> = { Accept: 'application/json' }
      if (authHeader) headers.Authorization = authHeader

      const res = await fetch(url, { method: 'GET', headers })
      if (!res.ok) {
        return fail('fetch_analytics_api', input, `API returned ${res.status}: ${(await res.text()).slice(0, 500)}`)
      }

      const data = await res.json()
      const preview = JSON.stringify(data).slice(0, 2000)
      return ok('fetch_analytics_api', input, data, `Fetched ${desc}: ${preview}`)
    } catch (err) {
      return fail('fetch_analytics_api', input, `Fetch failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
)

logger.debug('Tools', 'Platform connector tools registered (meta_ads, client health, analytics fetch)')
