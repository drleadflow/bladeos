import { getDb } from '@blade/db'
import type { ScorecardEntry, ScorecardMetric, EmployeeDefinition } from './types.js'

function db() {
  return getDb()
}

function now(): string {
  return new Date().toISOString()
}

export function getScorecardStatus(value: number, metric: ScorecardMetric): 'green' | 'yellow' | 'red' {
  const target = metric.target
  const diff = metric.direction === 'higher'
    ? (target - value) / target
    : (value - target) / target

  if (diff <= 0.1) return 'green'
  if (diff <= 0.25) return 'yellow'
  return 'red'
}

export function recordMetric(employeeId: string, metricId: string, value: number): void {
  const id = crypto.randomUUID()
  // Status will be computed on read when we have the metric definition
  db().prepare(
    `INSERT INTO scorecard_entries (id, employee_id, metric_id, value, status, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, employeeId, metricId, value, 'green', now())
}

export function getScorecard(employeeId: string): ScorecardEntry[] {
  const rows = db().prepare(
    `SELECT id, employee_id as employeeId, metric_id as metricId, value, status, recorded_at as recordedAt
     FROM scorecard_entries
     WHERE employee_id = ?
     ORDER BY recorded_at DESC`
  ).all(employeeId) as ScorecardEntry[]

  return rows
}

export function formatScorecard(entries: ScorecardEntry[], employee: EmployeeDefinition): string {
  if (entries.length === 0) {
    return '  No scorecard data recorded yet.'
  }

  // Get latest entry per metric
  const latestByMetric = new Map<string, ScorecardEntry>()
  for (const entry of entries) {
    if (!latestByMetric.has(entry.metricId)) {
      latestByMetric.set(entry.metricId, entry)
    }
  }

  const lines: string[] = []

  for (const metric of employee.scorecardMetrics) {
    const entry = latestByMetric.get(metric.id)
    if (!entry) {
      lines.push(`  [ ] ${metric.name}: No data`)
      continue
    }

    // Recompute status with the metric definition
    const status = getScorecardStatus(entry.value, metric)
    const icon = status === 'green' ? '[G]' : status === 'yellow' ? '[Y]' : '[R]'
    const dirLabel = metric.direction === 'higher' ? 'target >=' : 'target <='

    lines.push(`  ${icon} ${metric.name}: ${entry.value}${metric.unit} (${dirLabel} ${metric.target}${metric.unit})`)
  }

  return lines.join('\n')
}
