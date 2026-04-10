import { initializeDb, clientAccounts } from '@blade/db'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'

export async function GET(request: Request): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    initializeDb()
    const url = new URL(request.url)
    const status = url.searchParams.get('status') ?? undefined
    const clients = clientAccounts.list({ status })
    return Response.json({ success: true, data: clients })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to list clients'
    logger.error('Clients', `GET error: ${msg}`)
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}

export async function POST(request: Request): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    initializeDb()
    const body = await request.json() as Record<string, unknown>

    const name = body.name as string
    const slug = body.slug as string
    if (!name || !slug) {
      return Response.json({ success: false, error: 'name and slug are required' }, { status: 400 })
    }

    // Check for duplicate slug
    const existing = clientAccounts.get(slug)
    if (existing) {
      return Response.json({ success: false, error: `Client with slug "${slug}" already exists` }, { status: 409 })
    }

    const { id } = clientAccounts.create({
      name,
      slug,
      serviceType: (body.serviceType as string) ?? 'ads',
      industry: body.industry as string | undefined,
      contactName: body.contactName as string | undefined,
      contactEmail: body.contactEmail as string | undefined,
      slackChannelId: body.slackChannelId as string | undefined,
      slackChannelName: body.slackChannelName as string | undefined,
      monthlyRetainerUsd: body.monthlyRetainerUsd as number | undefined,
      platforms: body.platforms as Record<string, unknown> | undefined,
      kpiTargets: body.kpiTargets as Array<{ metric: string; target: number; warning: number; critical: number; direction: string }> | undefined,
      notes: body.notes as string | undefined,
    })

    return Response.json({ success: true, id })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to create client'
    logger.error('Clients', `POST error: ${msg}`)
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}
