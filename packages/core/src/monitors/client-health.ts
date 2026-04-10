import { clientAccounts } from '@blade/db'
import type { MonitorDefinition, MonitorCheckResult } from './types.js'

/**
 * Client Health Monitor — checks overall health of all active client accounts.
 * Runs every 8 hours. Triggers warning/critical based on how many clients are unhealthy.
 *
 * Thresholds:
 * - ok: 0 clients in critical
 * - warning: 1+ client in critical
 * - critical: 3+ clients in critical OR >50% of clients below healthy
 */
export const clientHealthMonitor: MonitorDefinition = {
  id: 'client-health',
  name: 'Client Health',
  description: 'Monitors aggregate client account health. Alerts when clients have declining metrics or critical health scores.',
  sourceType: 'internal',
  checkSchedule: '0 */8 * * *',
  thresholds: { ok: 0, warning: 1, critical: 3 },

  async check(): Promise<MonitorCheckResult> {
    try {
      const clients = clientAccounts.list({ status: 'active' })

      if (clients.length === 0) {
        return {
          value: 0,
          status: 'ok',
          message: 'No active client accounts to monitor.',
          details: { totalClients: 0 },
        }
      }

      const critical = clients.filter(c => c.healthStatus === 'critical')
      const warning = clients.filter(c => c.healthStatus === 'warning')
      const healthy = clients.filter(c => c.healthStatus === 'healthy')
      const unknown = clients.filter(c => c.healthStatus === 'unknown')

      const criticalCount = critical.length
      const unhealthyPct = clients.length > 0
        ? Math.round(((criticalCount + warning.length) / clients.length) * 100)
        : 0

      let status: 'ok' | 'warning' | 'critical' = 'ok'
      let message: string

      if (criticalCount >= 3 || unhealthyPct > 50) {
        status = 'critical'
        message = `${criticalCount} client(s) in critical state (${unhealthyPct}% unhealthy): ${critical.map(c => c.name).join(', ')}`
      } else if (criticalCount >= 1) {
        status = 'warning'
        message = `${criticalCount} client(s) in critical state: ${critical.map(c => c.name).join(', ')}`
      } else if (warning.length > 0) {
        status = 'warning'
        message = `${warning.length} client(s) in warning state: ${warning.map(c => c.name).join(', ')}`
      } else {
        message = `All ${healthy.length} client(s) healthy. ${unknown.length > 0 ? `${unknown.length} pending first check.` : ''}`
      }

      return {
        value: criticalCount,
        status,
        message,
        details: {
          totalClients: clients.length,
          healthy: healthy.length,
          warning: warning.length,
          critical: criticalCount,
          unknown: unknown.length,
          criticalClients: critical.map(c => ({ name: c.name, score: c.healthScore })),
          warningClients: warning.map(c => ({ name: c.name, score: c.healthScore })),
        },
      }
    } catch (err) {
      // Client accounts table may not exist yet
      return {
        value: 0,
        status: 'ok',
        message: 'Client health monitor: no client accounts configured yet.',
      }
    }
  },
}
