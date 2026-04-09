import { memories } from '@blade/db'
import type { MonitorDefinition, MonitorCheckResult } from './types.js'

export const memoryHealthMonitor: MonitorDefinition = {
  id: 'memory-health',
  name: 'Memory Health',
  description: 'Tracks average confidence of stored memories and flags low-quality entries',
  sourceType: 'internal',
  checkSchedule: '0 */12 * * *',
  thresholds: { ok: 0.5, warning: 0.3, critical: 0.2 },

  async check(): Promise<MonitorCheckResult> {
    const allMemories = memories.getAll(1000) as ReadonlyArray<{
      readonly id: string
      readonly confidence: number
    }>

    const totalCount = allMemories.length

    if (totalCount === 0) {
      return {
        value: 1,
        status: 'ok',
        message: 'No memories stored yet',
        details: { totalCount: 0, avgConfidence: 0, lowConfidenceCount: 0 },
      }
    }

    const avgConfidence = allMemories.reduce((sum, m) => sum + m.confidence, 0) / totalCount
    const lowConfidenceCount = allMemories.filter(m => m.confidence < 0.2).length

    const status: MonitorCheckResult['status'] =
      avgConfidence < memoryHealthMonitor.thresholds.critical ? 'critical' :
      avgConfidence < memoryHealthMonitor.thresholds.ok ? 'warning' :
      'ok'

    const message =
      status === 'critical'
        ? `Memory health critical: avg confidence ${avgConfidence.toFixed(2)}, ${lowConfidenceCount} low-confidence entries out of ${totalCount}`
        : status === 'warning'
          ? `Memory health degraded: avg confidence ${avgConfidence.toFixed(2)}, ${lowConfidenceCount} low-confidence entries out of ${totalCount}`
          : `Memory health good: avg confidence ${avgConfidence.toFixed(2)}, ${totalCount} total memories`

    return {
      value: avgConfidence,
      status,
      message,
      details: {
        totalCount,
        avgConfidence,
        lowConfidenceCount,
      },
    }
  },
}
