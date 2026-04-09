import { employees, activityEvents } from '@blade/db'
import type { MonitorDefinition, MonitorCheckResult } from './types.js'

export const employeeHealthMonitor: MonitorDefinition = {
  id: 'employee-health',
  name: 'Employee Health',
  description: 'Checks whether active employees have recent activity within the last 24 hours',
  sourceType: 'internal',
  checkSchedule: '0 */8 * * *',
  thresholds: { ok: 0, warning: 1, critical: 3 },

  async check(): Promise<MonitorCheckResult> {
    const activeEmployees = employees.listActive() as ReadonlyArray<{
      readonly id: string
      readonly slug: string
      readonly name: string
    }>

    if (activeEmployees.length === 0) {
      return {
        value: 0,
        status: 'ok',
        message: 'No active employees configured',
        details: { totalActive: 0, idleEmployees: [] },
      }
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const idleEmployees: string[] = []

    for (const emp of activeEmployees) {
      const recentEvents = activityEvents.list({
        actorId: emp.slug,
        since,
        limit: 1,
      })
      if (recentEvents.length === 0) {
        idleEmployees.push(emp.name)
      }
    }

    const idleCount = idleEmployees.length

    const status: MonitorCheckResult['status'] =
      idleCount >= employeeHealthMonitor.thresholds.critical ? 'critical' :
      idleCount >= employeeHealthMonitor.thresholds.warning ? 'warning' :
      'ok'

    const message =
      status === 'critical'
        ? `${idleCount} employees idle in last 24h: ${idleEmployees.join(', ')}`
        : status === 'warning'
          ? `${idleCount} employee(s) idle in last 24h: ${idleEmployees.join(', ')}`
          : `All ${activeEmployees.length} active employees have recent activity`

    return {
      value: idleCount,
      status,
      message,
      details: {
        totalActive: activeEmployees.length,
        idleCount,
        idleEmployees,
      },
    }
  },
}
