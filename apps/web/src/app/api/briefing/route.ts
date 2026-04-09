import { initializeDb, employees, approvals, activityEvents } from '@blade/db'
import { logger } from '@blade/shared'
import { NextResponse } from 'next/server'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'

export const runtime = 'nodejs'

interface BriefingCache {
  briefing: string
  generated_at: string
  stats: { employees: number; approvals: number; activities: number }
  expiresAt: number
}

interface AnthropicMessage {
  role: string
  content: string
}

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>
}

let cache: BriefingCache | null = null
const CACHE_TTL_MS = 60_000 // 60 seconds

function cachePayload(c: BriefingCache): Omit<BriefingCache, 'expiresAt'> {
  return { briefing: c.briefing, generated_at: c.generated_at, stats: c.stats }
}

function getFallbackBriefing(stats: BriefingCache['stats']): BriefingCache {
  const now = new Date().toISOString()
  const briefing =
    `Good morning, Dr. Blade. Your system is operational with ${stats.employees} active employee${stats.employees !== 1 ? 's' : ''} running. ` +
    `You have ${stats.approvals} pending approval${stats.approvals !== 1 ? 's' : ''} awaiting your decision. ` +
    `There ${stats.activities !== 1 ? 'are' : 'is'} ${stats.activities} recent activit${stats.activities !== 1 ? 'ies' : 'y'} in your timeline. ` +
    `ANTHROPIC_API_KEY is not configured — connect it to enable AI-generated briefings.`

  return { briefing, generated_at: now, stats, expiresAt: Date.now() + CACHE_TTL_MS }
}

export async function GET(request: Request): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  // Serve from cache if still fresh
  if (cache !== null && Date.now() < cache.expiresAt) {
    return NextResponse.json({ success: true, ...cachePayload(cache) })
  }

  try {
    initializeDb()

    const employeeList = employees.listActive()
    const pendingCount = approvals.countPending()
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const recentCount = activityEvents.countSince(todayStart.toISOString())

    const stats = {
      employees: employeeList.length,
      approvals: pendingCount,
      activities: recentCount,
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      cache = getFallbackBriefing(stats)
      return NextResponse.json({ success: true, ...cachePayload(cache) })
    }

    const prompt =
      `You are the briefing system for Blade OS, an AI-powered command center. ` +
      `Write a morning briefing for Dr. Blade in 3-4 sentences. ` +
      `Be direct and concise. Use no markdown, no bullet points, no headers. ` +
      `Address Dr. Blade by name in the opening sentence.\n\n` +
      `Current operational data:\n` +
      `- Active employees: ${stats.employees}\n` +
      `- Pending approvals: ${stats.approvals}\n` +
      `- Activities today: ${stats.activities}`

    const messages: AnthropicMessage[] = [{ role: 'user', content: prompt }]

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages,
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
      logger.error('Briefing', 'Empty response from Anthropic API')
      cache = getFallbackBriefing(stats)
      return NextResponse.json({ success: true, ...cachePayload(cache) })
    }

    const generated_at = new Date().toISOString()
    cache = { briefing: briefingText, generated_at, stats, expiresAt: Date.now() + CACHE_TTL_MS }

    return NextResponse.json({
      success: true,
      briefing: briefingText,
      generated_at,
      stats,
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate briefing'
    logger.error('Briefing', `GET error: ${errorMessage}`)
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}
