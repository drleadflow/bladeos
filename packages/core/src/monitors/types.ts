export interface MonitorDefinition {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly sourceType: 'internal'
  readonly checkSchedule: string
  readonly thresholds: { ok: number; warning: number; critical: number }
  check(): Promise<MonitorCheckResult>
}

export interface MonitorCheckResult {
  readonly value: number
  readonly status: 'ok' | 'warning' | 'critical'
  readonly message: string
  readonly details?: Record<string, unknown>
}
