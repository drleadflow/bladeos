import { initializeDb, getDb, kpiMeasurements } from '@blade/db'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'

export const runtime = 'nodejs'

interface KpiDefinitionRow {
  id: string
  employeeId: string
  name: string
  unit: string
  target: number
  thresholdsJson: string
}

export async function GET(request: Request): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    initializeDb()
    const db = getDb()

    const definitions = db.prepare(
      `SELECT id, employee_id as employeeId, name, unit, target, thresholds_json as thresholdsJson
       FROM kpi_definitions ORDER BY employee_id, name`
    ).all() as KpiDefinitionRow[]

    const scorecard = definitions.map(kpi => {
      const latest = kpiMeasurements.latest(kpi.id)
      return {
        id: kpi.id,
        employeeId: kpi.employeeId,
        name: kpi.name,
        unit: kpi.unit,
        target: kpi.target,
        currentValue: latest?.value ?? null,
        status: latest?.status ?? 'unknown',
        measuredAt: latest?.measuredAt ?? null,
      }
    })

    return Response.json({ success: true, data: scorecard })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to load scorecard'
    logger.error('Scorecard', `GET error: ${errorMessage}`)
    return Response.json({ success: false, error: errorMessage }, { status: 500 })
  }
}
