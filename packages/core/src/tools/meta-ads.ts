/**
 * Meta Ads Tools — Query Facebook/Instagram ad performance via Graph API.
 * Uses META_USER_TOKEN from environment.
 */

import { registerTool } from '../tool-registry.js'
import type { ToolCallResult } from '../types.js'
import { logger } from '@blade/shared'

const GRAPH_API = 'https://graph.facebook.com/v21.0'

function ok(toolName: string, input: Record<string, unknown>, data: unknown, display: string): ToolCallResult {
  return { toolUseId: '', toolName, input, success: true, data, display, durationMs: 0, timestamp: new Date().toISOString() }
}

function fail(toolName: string, input: Record<string, unknown>, message: string): ToolCallResult {
  return { toolUseId: '', toolName, input, success: false, data: null, display: message, durationMs: 0, timestamp: new Date().toISOString() }
}

async function metaGet(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const token = process.env.META_USER_TOKEN
  if (!token) throw new Error('META_USER_TOKEN not configured')

  const url = new URL(`${GRAPH_API}${path}`)
  url.searchParams.set('access_token', token)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }

  const res = await fetch(url.toString())
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Meta API ${res.status}: ${text.slice(0, 300)}`)
  }
  return res.json()
}

// ── List Ad Accounts ────────────────────────────────────────

registerTool(
  {
    name: 'meta_list_accounts',
    description: 'List all Meta/Facebook ad accounts with their status and total spend. Use when the user asks about their ad accounts.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
    category: 'web',
  },
  async (input) => {
    try {
      const result = await metaGet('/me/adaccounts', {
        fields: 'id,name,account_status,currency,amount_spent',
      }) as { data: Array<Record<string, unknown>> }

      const statusMap: Record<number, string> = { 1: 'Active', 2: 'Disabled', 3: 'Unsettled', 7: 'Pending Review', 9: 'In Grace Period', 100: 'Pending Closure', 101: 'Closed' }
      const accounts = result.data.map((a) => ({
        id: a.id,
        name: a.name,
        status: statusMap[(a.account_status as number)] ?? `Unknown (${a.account_status})`,
        totalSpent: `$${((a.amount_spent as number) / 100).toFixed(2)}`,
      }))

      const display = accounts.map((a) => `- ${a.name}: ${a.status}, ${a.totalSpent} spent`).join('\n')
      return ok('meta_list_accounts', input, accounts, `${accounts.length} ad accounts:\n${display}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.error('meta-ads', `list accounts failed: ${msg}`)
      return fail('meta_list_accounts', input, msg)
    }
  }
)

// ── Account Performance ─────────────────────────────────────

registerTool(
  {
    name: 'meta_account_performance',
    description: 'Get ad performance metrics for a Meta ad account — spend, impressions, clicks, CTR, CPC, conversions, cost per result. Use when the user asks about ad performance, ROAS, CPL, or how ads are doing.',
    input_schema: {
      type: 'object',
      properties: {
        account_id: { type: 'string', description: 'Ad account ID (e.g. act_12345). Use meta_list_accounts first if unknown.' },
        date_preset: { type: 'string', description: 'Date range: today, yesterday, last_7d, last_14d, last_30d, this_month, last_month. Default: last_7d' },
      },
      required: ['account_id'],
    },
    category: 'web',
  },
  async (input) => {
    try {
      const accountId = input.account_id as string
      const datePreset = (input.date_preset as string) || 'last_7d'

      const result = await metaGet(`/${accountId}/insights`, {
        fields: 'spend,impressions,clicks,ctr,cpc,actions,cost_per_action_type,reach,frequency',
        date_preset: datePreset,
      }) as { data: Array<Record<string, unknown>> }

      if (!result.data || result.data.length === 0) {
        return ok('meta_account_performance', input, null, `No data for ${accountId} in ${datePreset}.`)
      }

      const d = result.data[0]
      const actions = (d.actions as Array<{ action_type: string; value: string }>) ?? []
      const costPer = (d.cost_per_action_type as Array<{ action_type: string; value: string }>) ?? []

      const leads = actions.find((a) => a.action_type === 'lead')?.value ?? '0'
      const purchases = actions.find((a) => a.action_type === 'purchase' || a.action_type === 'omni_purchase')?.value ?? '0'
      const cpl = costPer.find((a) => a.action_type === 'lead')?.value
      const cpp = costPer.find((a) => a.action_type === 'purchase' || a.action_type === 'omni_purchase')?.value

      const metrics = {
        spend: `$${parseFloat(d.spend as string || '0').toFixed(2)}`,
        impressions: d.impressions,
        reach: d.reach,
        clicks: d.clicks,
        ctr: `${parseFloat(d.ctr as string || '0').toFixed(2)}%`,
        cpc: `$${parseFloat(d.cpc as string || '0').toFixed(2)}`,
        leads,
        costPerLead: cpl ? `$${parseFloat(cpl).toFixed(2)}` : 'N/A',
        purchases,
        costPerPurchase: cpp ? `$${parseFloat(cpp).toFixed(2)}` : 'N/A',
      }

      const display = [
        `Performance for ${datePreset}:`,
        `Spend: ${metrics.spend}`,
        `Impressions: ${metrics.impressions} | Reach: ${metrics.reach}`,
        `Clicks: ${metrics.clicks} | CTR: ${metrics.ctr} | CPC: ${metrics.cpc}`,
        `Leads: ${metrics.leads} | CPL: ${metrics.costPerLead}`,
        `Purchases: ${metrics.purchases} | CPP: ${metrics.costPerPurchase}`,
      ].join('\n')

      return ok('meta_account_performance', input, metrics, display)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.error('meta-ads', `account performance failed: ${msg}`)
      return fail('meta_account_performance', input, msg)
    }
  }
)

// ── Campaign Breakdown ──────────────────────────────────────

registerTool(
  {
    name: 'meta_campaign_performance',
    description: 'Break down ad performance by campaign. Shows each campaign name with spend, results, and cost per result. Use when the user asks which campaigns are performing best or worst.',
    input_schema: {
      type: 'object',
      properties: {
        account_id: { type: 'string', description: 'Ad account ID (e.g. act_12345).' },
        date_preset: { type: 'string', description: 'Date range: today, yesterday, last_7d, last_14d, last_30d, this_month, last_month. Default: last_7d' },
        status: { type: 'string', description: 'Filter: ACTIVE, PAUSED, or ALL. Default: ACTIVE' },
      },
      required: ['account_id'],
    },
    category: 'web',
  },
  async (input) => {
    try {
      const accountId = input.account_id as string
      const datePreset = (input.date_preset as string) || 'last_7d'
      const statusFilter = (input.status as string) || 'ACTIVE'

      const params: Record<string, string> = {
        fields: 'campaign_name,spend,impressions,clicks,ctr,actions,cost_per_action_type',
        date_preset: datePreset,
        level: 'campaign',
        limit: '25',
      }
      if (statusFilter !== 'ALL') {
        params.filtering = JSON.stringify([{ field: 'campaign.delivery_info', operator: 'IN', value: [statusFilter] }])
      }

      const result = await metaGet(`/${accountId}/insights`, params) as { data: Array<Record<string, unknown>> }

      if (!result.data || result.data.length === 0) {
        return ok('meta_campaign_performance', input, null, `No campaign data for ${datePreset}.`)
      }

      const campaigns = result.data.map((c) => {
        const actions = (c.actions as Array<{ action_type: string; value: string }>) ?? []
        const costPer = (c.cost_per_action_type as Array<{ action_type: string; value: string }>) ?? []
        const leads = actions.find((a) => a.action_type === 'lead')?.value ?? '0'
        const cpl = costPer.find((a) => a.action_type === 'lead')?.value

        return {
          campaign: c.campaign_name,
          spend: `$${parseFloat(c.spend as string || '0').toFixed(2)}`,
          clicks: c.clicks,
          ctr: `${parseFloat(c.ctr as string || '0').toFixed(2)}%`,
          leads,
          cpl: cpl ? `$${parseFloat(cpl).toFixed(2)}` : 'N/A',
        }
      })

      const display = campaigns
        .map((c) => `- ${c.campaign}: ${c.spend} spent, ${c.leads} leads, CPL ${c.cpl}, CTR ${c.ctr}`)
        .join('\n')

      return ok('meta_campaign_performance', input, campaigns, `${campaigns.length} campaigns (${datePreset}):\n${display}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.error('meta-ads', `campaign performance failed: ${msg}`)
      return fail('meta_campaign_performance', input, msg)
    }
  }
)

// ── Ad-Level Performance ────────────────────────────────────

registerTool(
  {
    name: 'meta_ad_performance',
    description: 'Get performance for individual ads within a campaign or account. Shows each ad with spend, clicks, leads, and CPL. Use when the user wants to see which specific ads are working.',
    input_schema: {
      type: 'object',
      properties: {
        account_id: { type: 'string', description: 'Ad account ID (e.g. act_12345).' },
        date_preset: { type: 'string', description: 'Date range. Default: last_7d' },
      },
      required: ['account_id'],
    },
    category: 'web',
  },
  async (input) => {
    try {
      const accountId = input.account_id as string
      const datePreset = (input.date_preset as string) || 'last_7d'

      const result = await metaGet(`/${accountId}/insights`, {
        fields: 'ad_name,campaign_name,spend,impressions,clicks,actions,cost_per_action_type',
        date_preset: datePreset,
        level: 'ad',
        limit: '20',
        filtering: JSON.stringify([{ field: 'ad.effective_status', operator: 'IN', value: ['ACTIVE'] }]),
      }) as { data: Array<Record<string, unknown>> }

      if (!result.data || result.data.length === 0) {
        return ok('meta_ad_performance', input, null, `No active ad data for ${datePreset}.`)
      }

      const ads = result.data.map((a) => {
        const actions = (a.actions as Array<{ action_type: string; value: string }>) ?? []
        const costPer = (a.cost_per_action_type as Array<{ action_type: string; value: string }>) ?? []
        const leads = actions.find((x) => x.action_type === 'lead')?.value ?? '0'
        const cpl = costPer.find((x) => x.action_type === 'lead')?.value

        return {
          ad: a.ad_name,
          campaign: a.campaign_name,
          spend: `$${parseFloat(a.spend as string || '0').toFixed(2)}`,
          clicks: a.clicks,
          leads,
          cpl: cpl ? `$${parseFloat(cpl).toFixed(2)}` : 'N/A',
        }
      })

      const display = ads
        .map((a) => `- ${a.ad} (${a.campaign}): ${a.spend}, ${a.leads} leads, CPL ${a.cpl}`)
        .join('\n')

      return ok('meta_ad_performance', input, ads, `${ads.length} active ads (${datePreset}):\n${display}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.error('meta-ads', `ad performance failed: ${msg}`)
      return fail('meta_ad_performance', input, msg)
    }
  }
)
