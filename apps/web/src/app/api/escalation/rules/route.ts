import { initializeDb, escalationRules } from '@blade/db'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'
import { corsHeaders, corsOptionsResponse } from '@/lib/cors'

export const runtime = 'nodejs'

export async function OPTIONS(): Promise<Response> {
  return corsOptionsResponse()
}

export async function GET(request: Request): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    initializeDb()
    const url = new URL(request.url)
    const enabledParam = url.searchParams.get('enabled')

    const filters =
      enabledParam !== null ? { enabled: enabledParam === 'true' } : undefined

    const list = escalationRules.list(filters)

    return Response.json({ success: true, data: list }, { headers: corsHeaders() })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to list escalation rules'
    logger.error('Escalation', `GET rules error: ${errorMessage}`)
    return Response.json({ success: false, error: errorMessage }, { status: 500, headers: corsHeaders() })
  }
}

export async function POST(request: Request): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    initializeDb()
    const body = await request.json() as {
      name: string
      description?: string
      conditionType: string
      conditionConfigJson: string
      actionType: string
      actionConfigJson: string
      enabled?: number
      cooldownMinutes?: number
    }

    if (!body.name || !body.conditionType || !body.conditionConfigJson || !body.actionType || !body.actionConfigJson) {
      return Response.json(
        { success: false, error: 'Missing required fields: name, conditionType, conditionConfigJson, actionType, actionConfigJson' },
        { status: 400, headers: corsHeaders() }
      )
    }

    const rule = escalationRules.create({
      name: body.name,
      description: body.description,
      conditionType: body.conditionType,
      conditionConfigJson: body.conditionConfigJson,
      actionType: body.actionType,
      actionConfigJson: body.actionConfigJson,
      enabled: body.enabled,
      cooldownMinutes: body.cooldownMinutes,
    })

    return Response.json({ success: true, data: rule }, { status: 201, headers: corsHeaders() })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to create escalation rule'
    logger.error('Escalation', `POST rules error: ${errorMessage}`)
    return Response.json({ success: false, error: errorMessage }, { status: 500, headers: corsHeaders() })
  }
}
