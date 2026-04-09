import cron from 'node-cron'

/**
 * Validate a cron expression.
 */
export function isValidCron(expression: string): boolean {
  return cron.validate(expression)
}

/**
 * Calculate the next run time from a cron expression.
 *
 * Uses a simple field-matching approach against minute-level granularity.
 * Returns an ISO-8601 string of the next matching datetime (UTC).
 */
export function getNextRun(cronExpression: string): string {
  if (!cron.validate(cronExpression)) {
    throw new Error(`Invalid cron expression: ${cronExpression}`)
  }

  const parts = cronExpression.trim().split(/\s+/)
  const [minuteField, hourField, domField, monthField, dowField] = parts

  const now = new Date()
  // Start from the next minute
  const candidate = new Date(now)
  candidate.setUTCSeconds(0, 0)
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1)

  // Try up to 525960 minutes (~1 year) to find a match
  const maxAttempts = 525_960
  for (let i = 0; i < maxAttempts; i++) {
    if (
      matchField(minuteField, candidate.getUTCMinutes(), 0, 59) &&
      matchField(hourField, candidate.getUTCHours(), 0, 23) &&
      matchField(domField, candidate.getUTCDate(), 1, 31) &&
      matchField(monthField, candidate.getUTCMonth() + 1, 1, 12) &&
      matchField(dowField, candidate.getUTCDay(), 0, 6)
    ) {
      return candidate.toISOString()
    }
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1)
  }

  // Fallback — should not happen for valid expressions
  return new Date(now.getTime() + 3_600_000).toISOString()
}

/** Check whether a cron field matches a given value. Supports *, numbers, ranges, steps, and lists. */
function matchField(field: string | undefined, value: number, min: number, max: number): boolean {
  if (!field || field === '*') return true

  const segments = field.split(',')
  for (const segment of segments) {
    if (matchSegment(segment.trim(), value, min, max)) return true
  }
  return false
}

function matchSegment(segment: string, value: number, min: number, max: number): boolean {
  // Step: */n or range/n
  if (segment.includes('/')) {
    const [rangeStr, stepStr] = segment.split('/')
    const step = Number(stepStr)
    if (Number.isNaN(step) || step <= 0) return false

    let start = min
    let end = max
    if (rangeStr !== '*') {
      const rangeParts = rangeStr.split('-')
      start = Number(rangeParts[0])
      end = rangeParts.length > 1 ? Number(rangeParts[1]) : max
    }

    for (let v = start; v <= end; v += step) {
      if (v === value) return true
    }
    return false
  }

  // Range: a-b
  if (segment.includes('-')) {
    const [startStr, endStr] = segment.split('-')
    const start = Number(startStr)
    const end = Number(endStr)
    return value >= start && value <= end
  }

  // Exact number
  return Number(segment) === value
}
