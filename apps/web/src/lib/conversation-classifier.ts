/**
 * Conversation Classifier — AI classification of setter conversations.
 *
 * Design principles (Karpathy Context Engineering):
 * 1. Few-shot examples — 3 diverse examples covering edge cases
 * 2. Domain context — med spa / aesthetic clinic setter knowledge baked in
 * 3. Confidence scoring — explicit 0-100 confidence per field
 * 4. Structured output — strict JSON schema with reasoning
 * 5. Temperature 0 — deterministic classification
 * 6. Heuristic fallback — never fails, degrades gracefully
 */

interface ClassificationResult {
  ctaSent: boolean
  ctaResponse: boolean
  disqualified: boolean
  bookingDiscussed: boolean
  sentiment: 'engaged' | 'lukewarm' | 'dead'
  confidence: number // 0-100 overall confidence
}

interface ConversationMessage {
  direction: 'inbound' | 'outbound'
  body: string
  dateAdded: string
}

// In-memory classification cache — keyed by conversationId + message count
const classificationCache = new Map<string, ClassificationResult>()

function getCacheKey(conversationId: string, messageCount: number): string {
  return `${conversationId}:${messageCount}`
}

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    throw new Error('ANTHROPIC_API_KEY not configured')
  }
  return key
}

function formatConversation(messages: ConversationMessage[]): string {
  return messages
    .filter((m) => m.body)
    .map((m) => {
      const role = m.direction === 'outbound' ? 'AI SETTER' : 'LEAD'
      const body = m.body.length > 600 ? m.body.slice(0, 600) + '...' : m.body
      return `[${role}]: ${body}`
    })
    .join('\n')
}

// ── System prompt with domain context + few-shot examples ────

const SYSTEM_PROMPT = `You are a classifier for medical spa / aesthetic clinic AI setter conversations.

DOMAIN CONTEXT:
- AI setters send the first message after a lead opts in from a Facebook/Instagram ad or landing page
- The goal is: qualify the lead → send a booking CTA → get them to schedule an appointment
- Common services: VI Peel, laser hair removal, microneedling, Botox, facials, body contouring
- CTA = any message containing a booking link (amazingskincaremedspa.com/booking, calendly, etc.) OR a direct ask to schedule/book
- DQ = wrong number, spam, "STOP", not interested, already a patient asking unrelated questions, test contacts

OUTPUT FORMAT:
Return ONLY valid JSON matching this exact schema. No other text.
{
  "reasoning": "1-2 sentence explanation of classification logic",
  "ctaSent": true/false,
  "ctaResponse": true/false,
  "disqualified": true/false,
  "bookingDiscussed": true/false,
  "sentiment": "engaged" | "lukewarm" | "dead",
  "confidence": 0-100
}`

const FEW_SHOT_EXAMPLES = [
  // Example 1: Engaged lead, CTA sent, responded, booking discussed
  {
    role: 'user' as const,
    content: `Classify this conversation:

[AI SETTER]: Hey Sarah! Thanks for your interest in our VI Peel Precision Plus for dark spots. You can skip the line and instantly book your session here: https://amazingskincaremedspa.com/booking Quick question - are you targeting something specific or wanting an overall glow-up?
[LEAD]: Hi! Yes I have some dark spots on my cheeks from sun damage. How many sessions would I need?
[AI SETTER]: Great question! Most clients see amazing results in 1-3 sessions depending on severity. For sun damage spots, I'd recommend starting with one session and we can assess from there. Would you like to come in this week or next?
[LEAD]: Next week works! Do you have anything Thursday afternoon?
[AI SETTER]: Let me check... Yes! We have a 2:30pm and a 4:00pm slot on Thursday. Which works better for you?
[LEAD]: 2:30 works perfect`,
  },
  {
    role: 'assistant' as const,
    content: `{"reasoning":"AI sent booking link (CTA), lead responded with questions and agreed to schedule. Active back-and-forth with specific appointment time discussed.","ctaSent":true,"ctaResponse":true,"disqualified":false,"bookingDiscussed":true,"sentiment":"engaged","confidence":95}`,
  },
  // Example 2: Dead lead, CTA sent, no response
  {
    role: 'user' as const,
    content: `Classify this conversation:

[AI SETTER]: Hey Mike! Ashley here from Amazing Skin Care & Medspa! Thanks for your interest in our VI Peel. You can book your session here: https://amazingskincaremedspa.com/booking Are you looking to target something specific?
[AI SETTER]: Hi Mike, just checking in! Still interested in the VI Peel? We have openings this week.
[AI SETTER]: Last follow-up Mike - we'd love to help you with your skin goals. Book anytime at the link above!`,
  },
  {
    role: 'assistant' as const,
    content: `{"reasoning":"AI sent booking link CTA and two follow-ups. Lead never responded. Classic dead conversation - no inbound messages at all.","ctaSent":true,"ctaResponse":false,"disqualified":false,"bookingDiscussed":false,"sentiment":"dead","confidence":98}`,
  },
  // Example 3: DQ lead — wrong number / not interested
  {
    role: 'user' as const,
    content: `Classify this conversation:

[AI SETTER]: Hey! Thanks for your interest in our laser hair removal. Book here: https://amazingskincaremedspa.com/booking What area are you looking to treat?
[LEAD]: STOP
[LEAD]: wrong number stop texting me`,
  },
  {
    role: 'assistant' as const,
    content: `{"reasoning":"Lead responded with STOP and wrong number complaint. Clear disqualification - not a valid prospect.","ctaSent":true,"ctaResponse":true,"disqualified":true,"bookingDiscussed":false,"sentiment":"dead","confidence":99}`,
  },
]

export async function classifyConversation(
  conversationId: string,
  messages: ConversationMessage[]
): Promise<ClassificationResult> {
  const cacheKey = getCacheKey(conversationId, messages.length)
  const cached = classificationCache.get(cacheKey)
  if (cached) return cached

  // Skip classification for single-message conversations
  if (messages.length <= 1) {
    const result: ClassificationResult = {
      ctaSent: false,
      ctaResponse: false,
      disqualified: false,
      bookingDiscussed: false,
      sentiment: 'dead',
      confidence: 100,
    }
    classificationCache.set(cacheKey, result)
    return result
  }

  const transcript = formatConversation(messages)

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': getApiKey(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [
          ...FEW_SHOT_EXAMPLES,
          {
            role: 'user',
            content: `Classify this conversation:\n\n${transcript}`,
          },
        ],
      }),
    })

    if (!response.ok) {
      const result = heuristicClassify(messages)
      classificationCache.set(cacheKey, result)
      return result
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>
    }
    const text = data.content?.[0]?.text ?? ''

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      const result = heuristicClassify(messages)
      classificationCache.set(cacheKey, result)
      return result
    }

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
    const result: ClassificationResult = {
      ctaSent: Boolean(parsed.ctaSent),
      ctaResponse: Boolean(parsed.ctaResponse),
      disqualified: Boolean(parsed.disqualified),
      bookingDiscussed: Boolean(parsed.bookingDiscussed),
      sentiment: ['engaged', 'lukewarm', 'dead'].includes(parsed.sentiment as string)
        ? (parsed.sentiment as 'engaged' | 'lukewarm' | 'dead')
        : 'dead',
      confidence: typeof parsed.confidence === 'number'
        ? Math.min(100, Math.max(0, parsed.confidence))
        : 50,
    }

    classificationCache.set(cacheKey, result)
    return result
  } catch {
    const result = heuristicClassify(messages)
    classificationCache.set(cacheKey, result)
    return result
  }
}

/**
 * Fallback heuristic classification when the AI API is unavailable.
 * Provides deterministic results with lower confidence.
 */
function heuristicClassify(messages: ConversationMessage[]): ClassificationResult {
  const outboundBodies = messages
    .filter((m) => m.direction === 'outbound' && m.body)
    .map((m) => m.body.toLowerCase())

  const inboundMessages = messages.filter((m) => m.direction === 'inbound')
  const hasInbound = inboundMessages.length > 0

  const bookingPatterns = [
    'book', 'schedule', 'appointment', 'calendar', 'reserve',
    'booking', 'cal.com', 'calendly', 'acuity',
  ]

  const urlPattern = /https?:\/\/\S+/
  const ctaSent = outboundBodies.some(
    (body) =>
      bookingPatterns.some((pattern) => body.includes(pattern)) ||
      urlPattern.test(body)
  )

  let ctaResponse = false
  if (ctaSent && hasInbound) {
    const ctaOutboundIdx = messages.findIndex(
      (m) =>
        m.direction === 'outbound' &&
        (bookingPatterns.some((p) => m.body.toLowerCase().includes(p)) ||
          urlPattern.test(m.body))
    )
    if (ctaOutboundIdx >= 0) {
      ctaResponse = messages
        .slice(ctaOutboundIdx + 1)
        .some((m) => m.direction === 'inbound')
    }
  }

  const dqPatterns = ['stop', 'unsubscribe', 'wrong number', 'not interested', 'remove me']
  const disqualified = inboundMessages.some((m) =>
    m.body && dqPatterns.some((p) => m.body.toLowerCase().includes(p))
  )

  const bookingDiscussed = outboundBodies.some(
    (body) =>
      (body.includes('appointment') || body.includes('booked')) &&
      (body.includes('confirm') || body.includes('see you'))
  )

  let sentiment: 'engaged' | 'lukewarm' | 'dead' = 'dead'
  if (inboundMessages.length >= 3) sentiment = 'engaged'
  else if (inboundMessages.length >= 1) sentiment = 'lukewarm'

  return {
    ctaSent,
    ctaResponse,
    disqualified,
    bookingDiscussed,
    sentiment,
    confidence: 40, // Heuristic = lower confidence
  }
}

export function clearClassificationCache(): void {
  classificationCache.clear()
}

export function getClassificationCacheSize(): number {
  return classificationCache.size
}
