import { initializeDb, plugins } from '@blade/db'
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
    const type = url.searchParams.get('type') ?? undefined
    const enabledParam = url.searchParams.get('enabled')
    const enabled = enabledParam === null ? undefined : enabledParam === 'true'

    const list = plugins.list({ type, enabled })

    return Response.json(
      { success: true, data: { plugins: list, total: list.length } },
      { headers: corsHeaders() }
    )
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to list plugins'
    logger.error('Plugins', `GET error: ${errorMessage}`)
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500, headers: corsHeaders() }
    )
  }
}

interface PluginControlBody {
  name: string
  action: 'enable' | 'disable'
}

export async function POST(request: Request): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    initializeDb()
    const body = (await request.json()) as PluginControlBody

    if (!body.name) {
      return Response.json(
        { success: false, error: 'name is required' },
        { status: 400, headers: corsHeaders() }
      )
    }

    if (body.action === 'enable') {
      plugins.enable(body.name)
    } else if (body.action === 'disable') {
      plugins.disable(body.name)
    } else {
      return Response.json(
        { success: false, error: 'action must be enable or disable' },
        { status: 400, headers: corsHeaders() }
      )
    }

    const updated = plugins.get(body.name)
    return Response.json(
      { success: true, data: updated },
      { headers: corsHeaders() }
    )
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to update plugin'
    logger.error('Plugins', `POST error: ${errorMessage}`)
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500, headers: corsHeaders() }
    )
  }
}
