export type { MonitorDefinition, MonitorCheckResult } from './types.js'
export { startMonitorScheduler, runMonitorsNow, stopMonitorScheduler } from './scheduler.js'
export { measureAllKpis, registerMeasurement } from './kpi-measurer.js'
export { costBurnMonitor } from './cost-burn.js'
export { memoryHealthMonitor } from './memory-health.js'
export { employeeHealthMonitor } from './employee-health.js'
export { MonitorChecker } from './checker.js'

import { monitors } from '@blade/db'
import { MonitorChecker } from './checker.js'
import { costBurnMonitor } from './cost-burn.js'
import { memoryHealthMonitor } from './memory-health.js'
import { employeeHealthMonitor } from './employee-health.js'
import type { MonitorDefinition } from './types.js'

const BUILTIN_MONITORS: readonly MonitorDefinition[] = [
  costBurnMonitor,
  memoryHealthMonitor,
  employeeHealthMonitor,
]

export function setupBuiltinMonitors(): MonitorChecker {
  const checker = new MonitorChecker()
  const existing = monitors.list()
  const existingNames = new Set(existing.map(m => m.name))

  for (const def of BUILTIN_MONITORS) {
    if (!existingNames.has(def.id)) {
      monitors.create({
        name: def.id,
        description: def.description,
        sourceType: def.sourceType,
        sourceConfig: { monitorDefinitionId: def.id },
        checkSchedule: def.checkSchedule,
        thresholds: def.thresholds,
      })
    }

    checker.registerMonitor(def)
  }

  return checker
}
