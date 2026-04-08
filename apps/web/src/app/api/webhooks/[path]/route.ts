import { NextRequest, NextResponse } from 'next/server'
import { getTriggerByPath, handleWebhookTrigger } from '@blade/core'

export const runtime = 'nodejs'

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET

function validateWebhookSecret(request: NextRequest): boolean {
  if (!WEBHOOK_SECRET) {
    // If no secret is configured, reject all requests
    return false
  }

  const providedSecret = request.headers.get('x-webhook-secret')
  if (!providedSecret) {
    return false
  }

  // Constant-time comparison to prevent timing attacks
  if (providedSecret.length !== WEBHOOK_SECRET.length) {
    return false
  }

  let mismatch = 0
  for (let i = 0; i < providedSecret.length; i++) {
    mismatch |= providedSecret.charCodeAt(i) ^ WEBHOOK_SECRET.charCodeAt(i)
  }

  return mismatch === 0
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string }> }
) {
  const { path } = await params

  if (!validateWebhookSecret(request)) {
    return NextResponse.json(
      { error: 'Unauthorized: invalid or missing webhook secret' },
      { status: 401 }
    )
  }

  const triggerPath = `/webhooks/${path}`
  const trigger = getTriggerByPath(triggerPath)

  if (!trigger) {
    return NextResponse.json(
      { error: `No trigger registered for path: ${triggerPath}` },
      { status: 404 }
    )
  }

  if (!trigger.enabled) {
    return NextResponse.json(
      { error: `Trigger "${trigger.id}" is currently disabled` },
      { status: 403 }
    )
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON payload' },
      { status: 400 }
    )
  }

  const result = await handleWebhookTrigger(trigger.id, payload)

  const status = result.success ? 200 : 500

  return NextResponse.json(
    {
      triggerId: result.triggerId,
      employeeId: result.employeeId,
      success: result.success,
      response: result.response,
      timestamp: result.timestamp,
    },
    { status }
  )
}
