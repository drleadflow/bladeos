import { initializeDb, employees, approvals, activityEvents, monitorAlerts, costEntries, jobEvals } from '@blade/db'
import { logger } from '@blade/shared'
import { NextResponse } from 'next/server'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'

export const runtime = 'nodejs'

interface BriefingStats {
  employees: number
  approvals: number
  activities: number
  criticalAlerts: number
  warningAlerts: number
  todaySpend: number
  evalSuccessRate: number
  evalTotalJobs: number
  evalAvgCost: number
}

interface BriefingCache {
  briefing: string
  generated_at: string
  stats: BriefingStats
  expiresAt: number
}

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>
}

let cache: BriefingCache | null = null
const CACHE_TTL_MS = 300_000 // 5 minutes

function cachePayload(c: BriefingCache): Omit<BriefingCache, 'expiresAt'> {
  return { briefing: c.briefing, generated_at: c.generated_at, stats: c.stats }
}

function gatherStats(): BriefingStats {
  const employeeList = employees.listActive()
  const pendingCount = approvals.countPending()
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const recentCount = activityEvents.countSince(todayStart.toISOString())

  // Monitor alerts
  const recentAlerts = monitorAlerts.listRecent(20)
  const unacknowledged = recentAlerts.filter(a => a.acknowledged === 0)
  const criticalAlerts = unacknowledged.filter(a => ['critical', 'error'].includes(a.severity)).length
  const warningAlerts = unacknowledged.filter(a => ['warning', 'high'].includes(a.severity)).length

  // Cost
  const todayCost = costEntries.summary(1)

  // Eval summary
  let evalSuccessRate = 0
  let evalTotalJobs = 0
  let evalAvgCost = 0
  try {
    const evalData = jobEvals.successRate({ days: 30 })
    evalSuccessRate = evalData.successRatePct ?? 0
    evalTotalJobs = evalData.totalJobs ?? 0
    evalAvgCost = evalData.avgCostUsd ?? 0
  } catch { /* table may not exist */ }

  return {
    employees: employeeList.length,
    approvals: pendingCount,
    activities: recentCount,
    criticalAlerts,
    warningAlerts,
    todaySpend: todayCost.totalUsd,
    evalSuccessRate,
    evalTotalJobs,
    evalAvgCost,
  }
}

function getFallbackBriefing(stats: BriefingStats): BriefingCache {
  const now = new Date().toISOString()
  const parts: string[] = []

  parts.push(`Good morning. Your system is operational with ${stats.employees} active employee${stats.employees !== 1 ? 's' : ''}.`)

  if (stats.criticalAlerts > 0) {
    parts.push(`ATTENTION: ${stats.criticalAlerts} critical alert${stats.criticalAlerts !== 1 ? 's' : ''} need immediate review.`)
  } else if (stats.warningAlerts > 0) {
    parts.push(`${stats.warningAlerts} warning${stats.warningAlerts !== 1 ? 's' : ''} in the monitor queue.`)
  }

  if (stats.approvals > 0) {
    parts.push(`${stats.approvals} approval${stats.approvals !== 1 ? 's' : ''} awaiting your decision.`)
  }

  if (stats.evalTotalJobs > 0) {
    parts.push(`Agent success rate: ${stats.evalSuccessRate}% across ${stats.evalTotalJobs} jobs (30d), avg $${stats.evalAvgCost.toFixed(4)}/job.`)
  }

  parts.push(`Today's spend: $${stats.todaySpend.toFixed(2)}. ${stats.activities} events logged.`)

  return { briefing: parts.join(' '), generated_at: now, stats, expiresAt: Date.now() + CACHE_TTL_MS }
}

export async function GET(request: Request): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  if (cache !== null && Date.now() < cache.expiresAt) {
    return NextResponse.json({ success: true, ...cachePayload(cache) })
  }

  try {
    initializeDb()
    const stats = gatherStats()

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey || apiKey.startsWith('sk-ant-oat01-')) {
      // No direct API key (or OAuth token which can't be used for API calls)
      cache = getFallbackBriefing(stats)
      return NextResponse.json({ success: true, ...cachePayload(cache) })
    }

    const prompt =
      `You are the briefing system for Blade OS, an AI-powered command center for a business owner named Emeka. ` +
      `Write a morning briefing in 4-6 sentences. Be direct, concise, and action-oriented. ` +
      `Lead with the most important item. Use no markdown, no bullet points, no headers. ` +
      `Address Emeka by name in the opening sentence.\n\n` +
      `Current operational data:\n` +
      `- Active employees: ${stats.employees}\n` +
      `- Pending approvals: ${stats.approvals}\n` +
      `- Activities today: ${stats.activities}\n` +
      `- Critical alerts: ${stats.criticalAlerts}\n` +
      `- Warning alerts: ${stats.warningAlerts}\n` +
      `- Today's AI spend: $${stats.todaySpend.toFixed(2)}\n` +
      `- Agent job success rate (30d): ${stats.evalSuccessRate}% across ${stats.evalTotalJobs} jobs\n` +
      `- Average cost per job: $${stats.evalAvgCost.toFixed(4)}\n\n` +
      `If there are critical alerts, lead with those. If approvals are pending, mention them as blockers. ` +
      `Comment on the success rate trend if there are enough jobs. End with a recommended focus area.`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('Briefing', `Anthropic API error ${response.status}: ${errorText}`)
      cache = getFallbackBriefing(stats)
      return NextResponse.json({ success: true, ...cachePayload(cache) })
    }

    const result = (await response.json()) as AnthropicResponse
    const briefingText = result.content?.[0]?.text?.trim() ?? ''

    if (!briefingText) {
      cache = getFallbackBriefing(stats)
      return NextResponse.json({ success: true, ...cachePayload(cache) })
    }

    const generated_at = new Date().toISOString()
    cache = { briefing: briefingText, generated_at, stats, expiresAt: Date.now() + CACHE_TTL_MS }

    return NextResponse.json({ success: true, briefing: briefingText, generated_at, stats })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate briefing'
    logger.error('Briefing', `GET error: ${errorMessage}`)
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}
