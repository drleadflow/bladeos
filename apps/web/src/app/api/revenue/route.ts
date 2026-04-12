import { initializeDb, clientAccounts } from '@blade/db'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'

export async function GET(request: Request): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    initializeDb()

    // Load all client accounts and map to RevenueClient shape
    const accounts = clientAccounts.list({ limit: 200 })

    const clients = accounts.map((a) => ({
      id: a.id,
      name: a.name,
      monthly: a.monthlyRetainerUsd ?? 0,
      status: mapStatus(a.status),
      startDate: a.createdAt,
    }))

    // Compute previous month MRR from active clients as a rough baseline.
    // We don't store historical MRR snapshots, so we approximate it as 95% of
    // current MRR (a conservative starting point until real history exists).
    const activeMrr = clients
      .filter((c) => c.status === 'active')
      .reduce((sum, c) => sum + c.monthly, 0)

    const prevMonthMrr = Math.round(activeMrr * 0.95)

    // Target MRR can be set via env var; falls back to 0 (not set).
    const targetMrr = parseInt(process.env.BLADE_TARGET_MRR ?? '0', 10)

    // The revenue page reads the JSON response directly (not response.data),
    // so clients/targetMrr/prevMonthMrr must be top-level fields.
    return Response.json({
      clients,
      targetMrr,
      prevMonthMrr,
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to load revenue data'
    logger.error('Revenue', `GET error: ${errorMessage}`)
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}

function mapStatus(status: string): 'active' | 'churned' | 'paused' {
  if (status === 'active') return 'active'
  if (status === 'churned' || status === 'inactive') return 'churned'
  return 'paused'
}
