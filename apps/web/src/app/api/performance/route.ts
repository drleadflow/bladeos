import { NextRequest, NextResponse } from 'next/server'
import {
  getAllMessages,
  getAllMessagesViaFirebase, // eslint-disable-line @typescript-eslint/no-unused-vars -- used in catch fallback
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

interface PerformanceData {
  leadActivations: number
  totalBookings: number
  leadToBooking: number
  leadsToCTA: number
  leadsToCtaCount: number
  introResponseRate: number
  introResponseCount: number
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

  // Check cache
  const cacheKey = getCacheKey(accountId, startDate, endDate)
  const cached = cache.get(cacheKey)
  if (cached && cached.expiry > Date.now()) {
    return NextResponse.json({ success: true, data: cached.data })
  }

  try {
    // 1. Fetch all messages for this account in the date range
    // Try MCP first, fall back to Firebase internal API if MCP fails or returns empty
    let messages: GHLMessage[]
    let usedFirebase = false
    try {
      messages = await getAllMessages(accountId, startDate, 5)
    } catch (mcpError: unknown) {
      // MCP failed — set empty to trigger Firebase fallback below
      messages = []
    }

    // If MCP returned nothing, try Firebase fallback
    if (messages.length === 0) {
      try {
        messages = await getAllMessagesViaFirebase(accountId, startDate)
        usedFirebase = true
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
      if (firstOutbound) {
        const firstOutboundTime = new Date(firstOutbound.dateAdded).getTime()
        introResponse = msgs.some(
          (m) =>
            m.direction === 'inbound' &&
            new Date(m.dateAdded).getTime() > firstOutboundTime
        )
      }

      return {
        conversationId,
        contactId,
        contactName: '',
        introSent,
        introResponse,
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

    // 4. Aggregate metrics
    const total = summaries.length
    const withIntroSent = summaries.filter((c) => c.introSent)
    const withIntroResponse = summaries.filter((c) => c.introSent && c.introResponse)
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
      introResponseRate: pct(withIntroResponse.length, withIntroSent.length),
      introResponseCount: withIntroResponse.length,
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
    }

    // Cache result
    cache.set(cacheKey, { data, expiry: Date.now() + CACHE_TTL })

    return NextResponse.json({ success: true, data })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to compute performance data'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
