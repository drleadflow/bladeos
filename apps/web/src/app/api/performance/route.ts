import { NextRequest, NextResponse } from 'next/server'
import Database from 'better-sqlite3'
import path from 'path'
import {
  getAllMessages,
  getAllMessagesViaFirebase,
  getContact,
  type GHLMessage,
} from '@/lib/ghl-mcp-client'
import { classifyConversation } from '@/lib/conversation-classifier'

interface ConversationGroup {
  conversationId: string
  contactId: string
  messages: GHLMessage[]
}

interface ConversationSummary {
  conversationId: string
  contactId: string
  contactName: string
  introSent: boolean
  introResponse: boolean
  repliedToIntro: boolean
  repliedToFollowup: boolean
  ctaSent: boolean
  ctaResponse: boolean
  booked: boolean
  disqualified: boolean
  sentiment: string
  confidence: number
  messageCount: number
  firstMessageDate: string
  lastMessageDate: string
  campaign: string | null
}

interface IntroPattern {
  intro: string
  contactName: string
  gotResponse: boolean
  firstResponse: string
  messageCount: number
  conversationId: string
}

interface PerformanceData {
  leadActivations: number
  totalBookings: number
  leadToBooking: number
  leadsToCTA: number
  leadsToCtaCount: number
  introResponseRate: number
  introResponseCount: number
  followupResponseRate: number
  followupResponseCount: number
  neverRepliedRate: number
  neverRepliedCount: number
  responseToCTA: number
  responseToCtaCount: number
  responseToBooking: number
  ctaToBooking: number
  responseNoCTA: number
  responseNoCtaCount: number
  leadsDQ: number
  leadsDqCount: number
  avgInteractions: number
  avgHuntsFired: number
  timeSaved: number
  moneySaved: number
  sparklines: {
    activations: number[]
    responses: number[]
    cta: number[]
  }
  conversations: ConversationSummary[]
  topIntros: IntroPattern[]
}

// Cache with TTL
const cache = new Map<string, { data: PerformanceData; expiry: number }>()
const CACHE_TTL = 15 * 60 * 1000 // 15 minutes

function getCacheKey(accountId: string, startDate: string, endDate: string): string {
  return `${accountId}:${startDate}:${endDate}`
}

function groupByConversation(messages: GHLMessage[]): ConversationGroup[] {
  const groups = new Map<string, ConversationGroup>()

  for (const msg of messages) {
    const existing = groups.get(msg.conversationId)
    if (existing) {
      existing.messages.push(msg)
    } else {
      groups.set(msg.conversationId, {
        conversationId: msg.conversationId,
        contactId: msg.contactId,
        messages: [msg],
      })
    }
  }

  // Sort messages within each group by date (oldest first)
  const result = Array.from(groups.values())
  for (const group of result) {
    group.messages.sort(
      (a: GHLMessage, b: GHLMessage) =>
        new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime()
    )
  }

  return result
}

function buildSparklines(
  conversations: ConversationSummary[],
  startDate: Date,
  endDate: Date
): { activations: number[]; responses: number[]; cta: number[] } {
  const days = Math.ceil(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  )
  const bucketCount = Math.min(days, 14) // Max 14 data points
  const bucketSize = Math.max(1, Math.floor(days / bucketCount))

  const activations = new Array<number>(bucketCount).fill(0)
  const responses = new Array<number>(bucketCount).fill(0)
  const cta = new Array<number>(bucketCount).fill(0)

  for (const conv of conversations) {
    const dayOffset = Math.floor(
      (new Date(conv.firstMessageDate).getTime() - startDate.getTime()) /
        (1000 * 60 * 60 * 24)
    )
    const bucket = Math.min(Math.floor(dayOffset / bucketSize), bucketCount - 1)
    if (bucket >= 0) {
      activations[bucket] += 1
      if (conv.introResponse) responses[bucket] += 1
      if (conv.ctaSent) cta[bucket] += 1
    }
  }

  return { activations, responses, cta }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const accountId = searchParams.get('accountId') ?? ''
  const startDate = searchParams.get('startDate') ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const endDate = searchParams.get('endDate') ?? new Date().toISOString()

  if (!accountId) {
    return NextResponse.json(
      { success: false, error: 'accountId is required' },
      { status: 400 }
    )
  }

  // Check SQLite persistent cache first (instant response)
  try {
    const dbPath = path.resolve(process.cwd(), '../../blade.db')
    const db = new Database(dbPath, { readonly: true })
    const cached = db.prepare(
      `SELECT data_json, datetime(created_at) as synced_at
       FROM performance_cache
       WHERE account_id = ? AND expires_at > datetime('now')
       ORDER BY created_at DESC LIMIT 1`
    ).get(accountId) as { data_json: string; synced_at: string } | undefined

    db.close()

    if (cached) {
      return NextResponse.json({
        success: true,
        data: JSON.parse(cached.data_json),
        cached: true,
        syncedAt: cached.synced_at,
      })
    }
  } catch {
    // SQLite read failed — fall through to live fetch
  }

  // Check in-memory cache
  const cacheKey = getCacheKey(accountId, startDate, endDate)
  const cached = cache.get(cacheKey)
  if (cached && cached.expiry > Date.now()) {
    return NextResponse.json({ success: true, data: cached.data })
  }

  try {
    // 1. Fetch all messages for this account in the date range
    // Try MCP first, fall back to Firebase internal API if MCP fails or returns empty
    let messages: GHLMessage[]
    try {
      messages = await getAllMessages(accountId, startDate, 5)
    } catch {
      // MCP failed — set empty to trigger Firebase fallback below
      messages = []
    }

    // If MCP returned nothing, try Firebase fallback
    if (messages.length === 0) {
      try {
        messages = await getAllMessagesViaFirebase(accountId, startDate)
      } catch {
        // Firebase also failed — return what we have (empty)
      }
    }

    if (!Array.isArray(messages)) {
      return NextResponse.json(
        { success: false, error: `Unexpected messages type: ${typeof messages}` },
        { status: 500 }
      )
    }

    // 2. Group by conversation
    const groups = groupByConversation(messages)

    // 3. Pre-filter: skip pure notification channels before expensive AI calls
    const filteredGroups = groups.filter((group) => {
      const msgs = group.messages
      const hasInbound = msgs.some((m) => m.direction === 'inbound')
      const hasWorkflow = msgs.some(
        (m) => m.direction === 'outbound' && m.source === 'workflow'
      )
      const isNotificationChannel =
        !hasInbound && !hasWorkflow && msgs.length > 5 &&
        msgs.every((m) => m.direction === 'outbound')
      return !isNotificationChannel
    })

    // 4. Run AI classifications in parallel batches (10 concurrent)
    const BATCH_SIZE = 10
    const classificationResults = new Map<string, Awaited<ReturnType<typeof classifyConversation>>>()

    for (let i = 0; i < filteredGroups.length; i += BATCH_SIZE) {
      const batch = filteredGroups.slice(i, i + BATCH_SIZE)
      const results = await Promise.all(
        batch.map((group) =>
          classifyConversation(
            group.conversationId,
            group.messages.map((m) => ({
              direction: m.direction,
              body: m.body,
              dateAdded: m.dateAdded,
            }))
          )
        )
      )
      batch.forEach((group, idx) => {
        classificationResults.set(group.conversationId, results[idx])
      })
    }

    // 5. Fetch unique contact attributions in parallel (skip appointments for speed)
    const uniqueContactIds = Array.from(new Set(filteredGroups.map((g) => g.contactId)))
    const contactCache = new Map<string, string | null>()

    for (let i = 0; i < uniqueContactIds.length; i += BATCH_SIZE) {
      const batch = uniqueContactIds.slice(i, i + BATCH_SIZE)
      const results = await Promise.all(batch.map((id) => getContact(id)))
      batch.forEach((id, idx) => {
        const contact = results[idx]
        const attr = contact?.attributionSource ?? contact?.lastAttributionSource
        contactCache.set(id, attr?.campaign ?? attr?.utmCampaign ?? null)
      })
    }

    // 6. Assemble summaries (pure computation, no more API calls)
    const summaries: ConversationSummary[] = filteredGroups.map((group) => {
      const { messages: msgs, conversationId, contactId } = group
      const classification = classificationResults.get(conversationId)!

      const firstOutbound = msgs.find((m) => m.direction === 'outbound')
      const introSent = msgs.some(
        (m) => m.direction === 'outbound' && m.source === 'workflow'
      )

      let introResponse = false
      let repliedToIntro = false
      let repliedToFollowup = false

      if (firstOutbound) {
        const firstOutboundTime = new Date(firstOutbound.dateAdded).getTime()
        introResponse = msgs.some(
          (m) =>
            m.direction === 'inbound' &&
            new Date(m.dateAdded).getTime() > firstOutboundTime
        )

        // Find second outbound (first follow-up) to distinguish intro vs followup response
        const secondOutbound = msgs.find(
          (m) =>
            m.direction === 'outbound' &&
            m.body &&
            new Date(m.dateAdded).getTime() > firstOutboundTime
        )
        const secondOutTime = secondOutbound
          ? new Date(secondOutbound.dateAdded).getTime()
          : Infinity

        // Did they reply BEFORE the follow-up was sent?
        repliedToIntro = msgs.some(
          (m) =>
            m.direction === 'inbound' &&
            new Date(m.dateAdded).getTime() > firstOutboundTime &&
            new Date(m.dateAdded).getTime() < secondOutTime
        )

        // Did they reply to a later message but NOT the intro?
        repliedToFollowup = !repliedToIntro && introResponse
      }

      return {
        conversationId,
        contactId,
        contactName: '',
        introSent,
        introResponse,
        repliedToIntro,
        repliedToFollowup,
        ctaSent: classification.ctaSent,
        ctaResponse: classification.ctaResponse,
        booked: classification.bookingDiscussed,
        disqualified: classification.disqualified,
        sentiment: classification.sentiment,
        confidence: classification.confidence,
        messageCount: msgs.length,
        firstMessageDate: msgs[0]?.dateAdded ?? '',
        lastMessageDate: msgs[msgs.length - 1]?.dateAdded ?? '',
        campaign: contactCache.get(contactId) ?? null,
      }
    })

    // 7. Extract intro patterns — what first messages got replies vs didn't
    const introPatterns: IntroPattern[] = []
    for (const group of filteredGroups) {
      const { messages: msgs, conversationId } = group
      const firstOut = msgs.find((m) => m.direction === 'outbound' && m.body)
      if (!firstOut) continue

      // Skip system/notification messages
      const body = firstOut.body
      if (body.startsWith('Opportunity ') || body.startsWith('New Lead Signed Up')) continue

      const firstOutTime = new Date(firstOut.dateAdded).getTime()
      const inboundAfter = msgs.filter(
        (m) => m.direction === 'inbound' && new Date(m.dateAdded).getTime() > firstOutTime
      )
      const firstReply = inboundAfter.find((m) => m.body) ?? inboundAfter[0]

      introPatterns.push({
        intro: body.slice(0, 400),
        contactName: contactCache.get(group.contactId) ? '' : '',
        gotResponse: inboundAfter.length > 0,
        firstResponse: firstReply?.body?.slice(0, 200) ?? '',
        messageCount: msgs.length,
        conversationId,
      })
    }

    // Sort: winning intros first (got response), then by message count (engagement depth)
    const topIntros = introPatterns
      .sort((a, b) => {
        if (a.gotResponse !== b.gotResponse) return a.gotResponse ? -1 : 1
        return b.messageCount - a.messageCount
      })
      .slice(0, 20)

    // 4. Aggregate metrics
    const total = summaries.length
    const withIntroResponse = summaries.filter((c) => c.introSent && c.introResponse)
    const withRepliedToIntro = summaries.filter((c) => c.repliedToIntro)
    const withRepliedToFollowup = summaries.filter((c) => c.repliedToFollowup)
    const withNeverReplied = summaries.filter((c) => !c.introResponse && !c.disqualified)
    const withCta = summaries.filter((c) => c.ctaSent)
    const withCtaResponse = summaries.filter((c) => c.ctaSent && c.ctaResponse)
    const withBooking = summaries.filter((c) => c.booked)
    const withDq = summaries.filter((c) => c.disqualified)
    const withResponseNoCta = summaries.filter(
      (c) => c.introResponse && !c.ctaSent
    )

    const totalMessages = summaries.reduce((sum, c) => sum + c.messageCount, 0)
    const outboundCount = messages.filter((m) => m.direction === 'outbound').length

    // Calculate efficiency metrics
    const avgInteractions = total > 0 ? totalMessages / total : 0
    const avgHuntsFired = total > 0 ? outboundCount / total : 0
    const estimatedMinutesPerMessage = 2 // Average time a human would spend per message
    const timeSaved = Math.round((outboundCount * estimatedMinutesPerMessage) / 60)
    const hourlyRate = 20 // Estimated hourly cost of a human setter
    const moneySaved = timeSaved * hourlyRate

    const pct = (num: number, den: number): number =>
      den > 0 ? Math.round((num / den) * 10000) / 100 : 0

    const sparklines = buildSparklines(
      summaries,
      new Date(startDate),
      new Date(endDate)
    )

    const data: PerformanceData = {
      leadActivations: total,
      totalBookings: withBooking.length,
      leadToBooking: pct(withBooking.length, total),
      leadsToCTA: pct(withCta.length, total),
      leadsToCtaCount: withCta.length,
      introResponseRate: pct(withRepliedToIntro.length, total),
      introResponseCount: withRepliedToIntro.length,
      followupResponseRate: pct(withRepliedToFollowup.length, total),
      followupResponseCount: withRepliedToFollowup.length,
      neverRepliedRate: pct(withNeverReplied.length, total),
      neverRepliedCount: withNeverReplied.length,
      responseToCTA: pct(withCtaResponse.length, withCta.length),
      responseToCtaCount: withCtaResponse.length,
      responseToBooking: pct(withBooking.length, withIntroResponse.length),
      ctaToBooking: pct(withBooking.length, withCta.length),
      responseNoCTA: pct(withResponseNoCta.length, withIntroResponse.length),
      responseNoCtaCount: withResponseNoCta.length,
      leadsDQ: pct(withDq.length, total),
      leadsDqCount: withDq.length,
      avgInteractions: Math.round(avgInteractions * 100) / 100,
      avgHuntsFired: Math.round(avgHuntsFired * 100) / 100,
      timeSaved,
      moneySaved,
      sparklines,
      conversations: summaries,
      topIntros,
    }

    // Cache in memory
    cache.set(cacheKey, { data, expiry: Date.now() + CACHE_TTL })

    // Persist to SQLite for instant loads on next visit
    try {
      const dbPath = path.resolve(process.cwd(), '../../blade.db')
      const db = new Database(dbPath)
      db.prepare(
        `INSERT OR REPLACE INTO performance_cache (id, account_id, account_name, data_json, created_at, expires_at)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now', '+1 hour'))`
      ).run(`${accountId}-30d`, accountId, accountId, JSON.stringify(data))
      db.close()
    } catch {
      // SQLite write failed — in-memory cache still works
    }

    return NextResponse.json({ success: true, data })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to compute performance data'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
