import { monitors, monitorAlerts, activityEvents } from '@blade/db'
import type { MonitorDefinition, MonitorCheckResult } from './types.js'

export class MonitorChecker {
  private readonly registry = new Map<string, MonitorDefinition>()
  private readonly results = new Map<string, MonitorCheckResult>()

  registerMonitor(def: MonitorDefinition): void {
    this.registry.set(def.id, def)
  }

  async runAll(): Promise<ReadonlyMap<string, MonitorCheckResult>> {
    for (const [id] of this.registry) {
      await this.runOne(id)
    }
    return this.results
  }

  async runOne(monitorId: string): Promise<MonitorCheckResult | undefined> {
    const def = this.registry.get(monitorId)
    if (!def) {
      return undefined
    }

    const dbMonitor = findDbMonitor(def.id)
    const result = await def.check()
    this.results.set(monitorId, result)

    if (dbMonitor) {
      monitors.updateCheck(dbMonitor.id, String(result.value), result.status)

      if (result.status === 'warning' || result.status === 'critical') {
        monitorAlerts.create({
          monitorId: dbMonitor.id,
          severity: result.status,
          message: result.message,
          value: String(result.value),
        })
      }
    }

    activityEvents.emit({
      eventType: 'monitor.check',
      actorType: 'system',
      actorId: 'monitor-checker',
      summary: `Monitor "${def.name}" check: ${result.status}`,
      targetType: 'monitor',
      targetId: monitorId,
      detail: {
        value: result.value,
        status: result.status,
        message: result.message,
        details: result.details,
      },
    })

    return result
  }

  getResults(): ReadonlyMap<string, MonitorCheckResult> {
    return this.results
  }
}

function findDbMonitor(definitionId: string): { readonly id: string } | undefined {
  const all = monitors.list()
  return all.find(m => m.name === definitionId) as { readonly id: string } | undefined
}
