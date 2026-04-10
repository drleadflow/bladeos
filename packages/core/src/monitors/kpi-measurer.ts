import { costEntries, activityEvents, kpiDefinitions, kpiMeasurements, jobEvals } from '@blade/db'
import { logger } from '@blade/shared'

/**
 * Auto-measure internal KPIs that can be computed from existing data.
 * Runs on schedule to populate kpi_measurements with real values.
 */

type MeasurementFn = () => { value: number; status: 'green' | 'yellow' | 'red' }

/** Built-in measurement functions keyed by KPI source type */
const MEASUREMENT_FUNCTIONS: Record<string, MeasurementFn> = {
  'cost.daily_spend': () => {
    const summary = costEntries.summary(1)
    const value = summary.totalUsd
    return { value, status: value < 5 ? 'green' : value < 20 ? 'yellow' : 'red' }
  },

  'cost.weekly_spend': () => {
    const summary = costEntries.summary(7)
    return { value: summary.totalUsd, status: summary.totalUsd < 30 ? 'green' : summary.totalUsd < 100 ? 'yellow' : 'red' }
  },

  'activity.events_today': () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const count = activityEvents.countSince(today.toISOString())
    return { value: count, status: count > 0 ? 'green' : 'yellow' }
  },

  'jobs.success_rate_30d': () => {
    try {
      const summary = jobEvals.successRate({ days: 30 })
      const rate = summary.successRatePct ?? 0
      return { value: rate, status: rate >= 80 ? 'green' : rate >= 50 ? 'yellow' : 'red' }
    } catch {
      return { value: 0, status: 'yellow' }
    }
  },

  'jobs.avg_cost': () => {
    try {
      const summary = jobEvals.successRate({ days: 30 })
      return { value: summary.avgCostUsd ?? 0, status: (summary.avgCostUsd ?? 0) < 1 ? 'green' : 'yellow' }
    } catch {
      return { value: 0, status: 'yellow' }
    }
  },

  'jobs.total_30d': () => {
    try {
      const summary = jobEvals.successRate({ days: 30 })
      return { value: summary.totalJobs ?? 0, status: (summary.totalJobs ?? 0) > 0 ? 'green' : 'yellow' }
    } catch {
      return { value: 0, status: 'yellow' }
    }
  },
}

/**
 * Measure all KPI definitions that have a matching measurement function.
 * Records results to kpi_measurements table.
 */
export async function measureAllKpis(): Promise<number> {
  let measured = 0

  try {
    // Get all KPI definitions from DB
    const allDefs = getAllKpiDefinitions()

    for (const def of allDefs) {
      try {
        // Parse source to find measurement function key
        const source = JSON.parse(def.sourceJson) as { type?: string; key?: string }
        const measureKey = source.key ?? source.type ?? def.name

        const measureFn = MEASUREMENT_FUNCTIONS[measureKey]
        if (!measureFn) continue

        const { value, status } = measureFn()

        // Apply custom thresholds if defined
        let finalStatus = status
        if (def.thresholdsJson) {
          const thresholds = JSON.parse(def.thresholdsJson) as { green: number; yellow: number; red: number }
          const direction = def.direction ?? 'higher_is_better'

          if (direction === 'higher_is_better') {
            finalStatus = value >= thresholds.green ? 'green' : value >= thresholds.yellow ? 'yellow' : 'red'
          } else {
            finalStatus = value <= thresholds.green ? 'green' : value <= thresholds.yellow ? 'yellow' : 'red'
          }
        }

        kpiMeasurements.record({
          kpiId: def.id,
          employeeId: def.employeeId,
          value,
          status: finalStatus,
          source: 'auto-measurer',
        })

        measured++
      } catch (err) {
        logger.debug('KPIMeasurer', `Failed to measure KPI "${def.name}": ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    if (measured > 0) {
      logger.info('KPIMeasurer', `Measured ${measured} KPIs`)
    }
  } catch (err) {
    logger.error('KPIMeasurer', `Measurement cycle failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  return measured
}

function getAllKpiDefinitions(): { id: string; employeeId: string; name: string; sourceJson: string; direction: string; thresholdsJson: string }[] {
  try {
    const { getDb } = require('@blade/db')
    const db = getDb()
    return db.prepare(
      'SELECT id, employee_id as employeeId, name, source_json as sourceJson, direction, thresholds_json as thresholdsJson FROM kpi_definitions'
    ).all() as { id: string; employeeId: string; name: string; sourceJson: string; direction: string; thresholdsJson: string }[]
  } catch {
    return []
  }
}

/**
 * Register a custom measurement function for a KPI source key.
 */
export function registerMeasurement(key: string, fn: MeasurementFn): void {
  MEASUREMENT_FUNCTIONS[key] = fn
}
