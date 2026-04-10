import { initializeDb, clientAccounts, clientHealthSnapshots } from '@blade/db'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    initializeDb()
    const { id } = await params
    const client = clientAccounts.get(id)
    if (!client) {
      return Response.json({ success: false, error: 'Client not found' }, { status: 404 })
    }

    const history = clientHealthSnapshots.history(client.id, 30)

    return Response.json({
      success: true,
      data: {
        ...client,
        platforms: JSON.parse(client.platformsJson),
        kpiTargets: JSON.parse(client.kpiTargetsJson),
        healthHistory: history.map(h => ({
          ...h,
          metrics: JSON.parse(h.metricsJson),
          alerts: h.alertsJson ? JSON.parse(h.alertsJson) : [],
        })),
      },
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to get client'
    logger.error('Clients', `GET [id] error: ${msg}`)
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    initializeDb()
    const { id } = await params
    const body = await request.json() as Record<string, unknown>

    const client = clientAccounts.get(id)
    if (!client) {
      return Response.json({ success: false, error: 'Client not found' }, { status: 404 })
    }

    if (body.status) {
      clientAccounts.updateStatus(client.id, body.status as string)
    }

    return Response.json({ success: true })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to update client'
    logger.error('Clients', `PATCH error: ${msg}`)
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}
