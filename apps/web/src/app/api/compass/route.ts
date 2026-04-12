import { requireAuth, unauthorizedResponse } from '@/lib/auth'

export const runtime = 'nodejs'

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>
}

interface CompassAnalysis {
  bestCase: string
  worstCase: string
  mostLikely: string
  doNothing: string
  recommendation: string
  confidence: 'high' | 'medium' | 'low'
}

const SYSTEM_PROMPT = `You are a strategic advisor. Analyze the user's decision through 4 cases. Return ONLY valid JSON with this exact shape:
{
  "bestCase": "2-3 sentence analysis of the best possible outcome",
  "worstCase": "2-3 sentence analysis of the worst possible outcome",
  "mostLikely": "2-3 sentence analysis of the most probable outcome",
  "doNothing": "2-3 sentence analysis of what happens with inaction",
  "recommendation": "1-2 sentence clear recommendation",
  "confidence": "high"
}

The confidence field must be one of: "high", "medium", or "low". Return nothing except the JSON object.`

export async function POST(request: Request): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  const body = await request.json() as { decision?: string }
  const { decision } = body

  if (!decision || decision.trim().length < 10) {
    return Response.json(
      { success: false, error: 'Please describe the decision in more detail' },
      { status: 400 }
    )
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || apiKey.startsWith('sk-ant-oat01-')) {
    return Response.json(
      { success: false, error: 'No API key configured. Set ANTHROPIC_API_KEY in your environment.' },
      { status: 500 }
    )
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Analyze this decision: ${decision.trim()}` }],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return Response.json(
        { success: false, error: `Model API error ${response.status}: ${errorText}` },
        { status: 502 }
      )
    }

    const result = (await response.json()) as AnthropicResponse
    const text = result.content
      ?.filter(b => b.type === 'text')
      .map(b => b.text)
      .join('') ?? ''

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return Response.json(
        { success: false, error: 'Could not parse analysis from model response' },
        { status: 500 }
      )
    }

    const analysis = JSON.parse(jsonMatch[0]) as CompassAnalysis
    return Response.json({ success: true, data: analysis })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Analysis failed'
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}
