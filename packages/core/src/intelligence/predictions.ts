import { getDb } from '@blade/db'
import { getEmployee, getActiveEmployees } from '../employees/registry.js'
import { getScorecard, getScorecardStatus } from '../employees/scorecard.js'
import type { ScorecardEntry, EmployeeDefinition, ScorecardMetric } from '../employees/types.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Prediction {
  id: string
  employeeId: string
  type: 'risk' | 'opportunity' | 'reminder' | 'trend' | 'milestone'
  title: string
  detail: string
  confidence: number // 0-1
  actionSuggestion: string
  urgency: 'low' | 'medium' | 'high' | 'urgent'
  createdAt: string
  expiresAt?: string
}

// ---------------------------------------------------------------------------
// In-memory dismissed set (per session)
// ---------------------------------------------------------------------------

const dismissed = new Set<string>()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function db() {
  return getDb()
}

function uuid(): string {
  return crypto.randomUUID()
}

function nowIso(): string {
  return new Date().toISOString()
}

function daysAgo(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86_400_000
}

function hoursToday(): number {
  return new Date().getHours()
}

/** Fetch all memories for a given employee (by tag or source). */
function getMemoriesForEmployee(employeeId: string): Array<{ content: string; createdAt: string; tagsJson: string }> {
  try {
    return db().prepare(
      `SELECT content, created_at as createdAt, tags_json as tagsJson
       FROM memories
       WHERE source = ? OR tags_json LIKE ?
       ORDER BY created_at DESC
       LIMIT 200`
    ).all(employeeId, `%"${employeeId}"%`) as Array<{ content: string; createdAt: string; tagsJson: string }>
  } catch {
    return []
  }
}

/** Get the latest N scorecard entries for a metric, ordered oldest-first. */
function recentEntries(entries: ScorecardEntry[], metricId: string, n: number): ScorecardEntry[] {
  return entries
    .filter(e => e.metricId === metricId)
    .slice(0, n)
    .reverse()
}

/** Simple linear projection: given values over time, project when target is reached. */
function projectDaysToTarget(values: number[], target: number, direction: 'higher' | 'lower'): number | null {
  if (values.length < 2) return null
  const first = values[0]
  const last = values[values.length - 1]
  const rate = (last - first) / (values.length - 1)
  if (rate === 0) return null
  const remaining = target - last
  if (direction === 'higher' && rate <= 0) return null
  if (direction === 'lower' && rate >= 0) return null
  const days = Math.abs(remaining / rate)
  return Math.round(days)
}

/** Rolling average of the last N values. */
function rollingAverage(values: number[], n: number): number {
  const slice = values.slice(-n)
  if (slice.length === 0) return 0
  return slice.reduce((a, b) => a + b, 0) / slice.length
}

/** Percentage change between two rolling windows. */
function percentChange(recent: number, previous: number): number {
  if (previous === 0) return 0
  return ((recent - previous) / Math.abs(previous)) * 100
}

// ---------------------------------------------------------------------------
// Per-employee prediction generators
// ---------------------------------------------------------------------------

function closerPredictions(employeeId: string, entries: ScorecardEntry[], def: EmployeeDefinition): Prediction[] {
  const preds: Prediction[] = []
  const memories = getMemoriesForEmployee(employeeId)

  // Deal going cold — any memory mentioning "deal" that's > 7 days old with no newer mention
  const dealMemories = memories.filter(m => /deal|prospect|lead|pipeline/i.test(m.content))
  for (const dm of dealMemories.slice(0, 5)) {
    const age = daysAgo(dm.createdAt)
    if (age >= 7) {
      const snippet = dm.content.slice(0, 60)
      preds.push({
        id: uuid(),
        employeeId,
        type: 'risk',
        title: `Deal hasn't been touched in ${Math.round(age)} days`,
        detail: `"${snippet}..." was last referenced ${Math.round(age)} days ago. It may be going cold.`,
        confidence: Math.min(0.5 + (age - 7) * 0.05, 0.95),
        actionSuggestion: 'Follow up today with a quick check-in message or call.',
        urgency: age > 14 ? 'urgent' : 'high',
        createdAt: nowIso(),
        expiresAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      })
    }
  }

  // Pipeline gap
  const pipelineMetric = def.scorecardMetrics.find(m => /pipeline|revenue|deals/i.test(m.name))
  if (pipelineMetric) {
    const latest = recentEntries(entries, pipelineMetric.id, 1)
    if (latest.length > 0) {
      const current = latest[0].value
      const gap = pipelineMetric.target - current
      if (gap > 0) {
        const avgDealSize = current > 0 ? current / Math.max(entries.filter(e => e.metricId === pipelineMetric.id).length, 1) : 5000
        const dealsNeeded = Math.ceil(gap / avgDealSize)
        preds.push({
          id: uuid(),
          employeeId,
          type: 'risk',
          title: `Pipeline gap: $${Math.round(gap).toLocaleString()} below target`,
          detail: `Current pipeline is $${Math.round(current).toLocaleString()}, target is $${Math.round(pipelineMetric.target).toLocaleString()}. You need ~${dealsNeeded} more deals at avg size to hit goal.`,
          confidence: 0.8,
          actionSuggestion: `Focus on generating ${dealsNeeded} new qualified opportunities this period.`,
          urgency: gap / pipelineMetric.target > 0.5 ? 'urgent' : 'high',
          createdAt: nowIso(),
        })
      }
    }
  }

  return preds
}

function operatorPredictions(employeeId: string, entries: ScorecardEntry[], def: EmployeeDefinition): Prediction[] {
  const preds: Prediction[] = []

  // Revenue trajectory
  const revenueMetric = def.scorecardMetrics.find(m => /revenue|income|mrr/i.test(m.name))
  if (revenueMetric) {
    const vals = recentEntries(entries, revenueMetric.id, 10).map(e => e.value)
    if (vals.length >= 3) {
      const projected = projectDaysToTarget(vals, revenueMetric.target, revenueMetric.direction)
      if (projected === null) {
        preds.push({
          id: uuid(),
          employeeId,
          type: 'risk',
          title: 'Revenue trajectory is flat or declining',
          detail: `At current velocity, you won't hit your $${revenueMetric.target.toLocaleString()} target. The trend is moving the wrong direction.`,
          confidence: 0.75,
          actionSuggestion: 'Review your revenue drivers and identify quick wins to reverse the trend.',
          urgency: 'urgent',
          createdAt: nowIso(),
        })
      } else if (projected > 90) {
        preds.push({
          id: uuid(),
          employeeId,
          type: 'trend',
          title: `Revenue target is ${projected} days away at current pace`,
          detail: `Linear projection says you'll reach $${revenueMetric.target.toLocaleString()} in ~${projected} days. Consider accelerating.`,
          confidence: 0.65,
          actionSuggestion: 'Look for ways to increase velocity — new channels, upsells, or pricing changes.',
          urgency: projected > 180 ? 'high' : 'medium',
          createdAt: nowIso(),
        })
      }
    }
  }

  // Task / meeting load — check for tasks metric
  const taskMetric = def.scorecardMetrics.find(m => /task|meeting|blocked/i.test(m.name))
  if (taskMetric) {
    const vals = recentEntries(entries, taskMetric.id, 8).map(e => e.value)
    if (vals.length >= 4) {
      const recentAvg = rollingAverage(vals, 4)
      const prevAvg = rollingAverage(vals.slice(0, -4), 4)
      const change = percentChange(recentAvg, prevAvg)
      if (change > 25) {
        preds.push({
          id: uuid(),
          employeeId,
          type: 'risk',
          title: `Workload increased ${Math.round(change)}% recently`,
          detail: `Your recent metric average (${Math.round(recentAvg)}) is up ${Math.round(change)}% from the prior period (${Math.round(prevAvg)}). Consider a 30-day stop test.`,
          confidence: 0.7,
          actionSuggestion: 'Audit your calendar for low-value commitments and consider delegating or eliminating.',
          urgency: change > 50 ? 'high' : 'medium',
          createdAt: nowIso(),
        })
      }
    }
  }

  // Blocked items from memories
  const memories = getMemoriesForEmployee(employeeId)
  const blockedMemories = memories.filter(m => /blocked|stuck|waiting|bottleneck/i.test(m.content))
  const recentBlocked = blockedMemories.filter(m => daysAgo(m.createdAt) <= 2)
  if (recentBlocked.length >= 3) {
    preds.push({
      id: uuid(),
      employeeId,
      type: 'risk',
      title: `${recentBlocked.length} items blocked for 48+ hours`,
      detail: 'Multiple tasks have been stuck for over 2 days. This indicates a bottleneck that needs intervention.',
      confidence: 0.8,
      actionSuggestion: 'Identify the common blocker and escalate or reassign to unblock progress.',
      urgency: 'high',
      createdAt: nowIso(),
    })
  }

  return preds
}

function wellnessCoachPredictions(employeeId: string, entries: ScorecardEntry[], def: EmployeeDefinition): Prediction[] {
  const preds: Prediction[] = []

  // Sleep trend
  const sleepMetric = def.scorecardMetrics.find(m => /sleep/i.test(m.name))
  if (sleepMetric) {
    const vals = recentEntries(entries, sleepMetric.id, 7).map(e => e.value)
    if (vals.length >= 3) {
      const recentAvg = rollingAverage(vals, 3)
      const prevAvg = rollingAverage(vals.slice(0, -3), 3)
      const change = percentChange(recentAvg, prevAvg)
      if (change < -15) {
        preds.push({
          id: uuid(),
          employeeId,
          type: 'risk',
          title: `Sleep dropped ${Math.round(Math.abs(change))}% this week`,
          detail: `Average sleep went from ${prevAvg.toFixed(1)}${sleepMetric.unit} to ${recentAvg.toFixed(1)}${sleepMetric.unit}. Historically this precedes productivity dips.`,
          confidence: 0.7,
          actionSuggestion: 'Prioritize sleep tonight. Set a wind-down alarm 1 hour before target bedtime.',
          urgency: Math.abs(change) > 30 ? 'urgent' : 'high',
          createdAt: nowIso(),
        })
      }
    }
  }

  // Work hours / burnout (late-night check)
  if (hoursToday() >= 21) {
    const memories = getMemoriesForEmployee(employeeId)
    const recentWorkMentions = memories.filter(
      m => daysAgo(m.createdAt) < 1 && /work|task|deadline|meeting|code|build/i.test(m.content)
    )
    if (recentWorkMentions.length >= 3) {
      preds.push({
        id: uuid(),
        employeeId,
        type: 'risk',
        title: 'Burnout risk: working late with high activity today',
        detail: `It's ${new Date().toLocaleTimeString()} and you've had ${recentWorkMentions.length} work-related activities today. Suggest winding down.`,
        confidence: 0.65,
        actionSuggestion: 'Close the laptop. Take 10 minutes to decompress before bed.',
        urgency: 'high',
        createdAt: nowIso(),
      })
    }
  }

  // Workout streak
  const workoutMetric = def.scorecardMetrics.find(m => /workout|exercise|gym|steps/i.test(m.name))
  if (workoutMetric) {
    const vals = recentEntries(entries, workoutMetric.id, 10).map(e => e.value)
    // Count consecutive days hitting target
    let streak = 0
    for (let i = vals.length - 1; i >= 0; i--) {
      if (workoutMetric.direction === 'higher' ? vals[i] >= workoutMetric.target : vals[i] <= workoutMetric.target) {
        streak++
      } else {
        break
      }
    }
    if (streak >= 5) {
      preds.push({
        id: uuid(),
        employeeId,
        type: 'milestone',
        title: `Workout streak: ${streak} days! Keep it going!`,
        detail: `You've hit your ${workoutMetric.name} target ${streak} days in a row. Tomorrow makes ${streak + 1}. Don't break it!`,
        confidence: 0.9,
        actionSuggestion: `Lock in day ${streak + 1} — even a lighter session counts.`,
        urgency: 'medium',
        createdAt: nowIso(),
      })
    }
  }

  return preds
}

function wealthStrategistPredictions(employeeId: string, entries: ScorecardEntry[], def: EmployeeDefinition): Prediction[] {
  const preds: Prediction[] = []

  // Savings projection
  const savingsMetric = def.scorecardMetrics.find(m => /saving|net.?worth|invested/i.test(m.name))
  if (savingsMetric) {
    const vals = recentEntries(entries, savingsMetric.id, 10).map(e => e.value)
    if (vals.length >= 3) {
      const projected = projectDaysToTarget(vals, savingsMetric.target, savingsMetric.direction)
      if (projected !== null && projected > 0) {
        const months = Math.round(projected / 30)
        preds.push({
          id: uuid(),
          employeeId,
          type: 'trend',
          title: `On track to hit $${savingsMetric.target.toLocaleString()} goal in ~${months} months`,
          detail: `At your current savings rate, you'll reach your target in approximately ${projected} days (${months} months).`,
          confidence: 0.7,
          actionSuggestion: months > 12 ? 'Look for ways to increase your savings rate to accelerate the timeline.' : 'Great pace! Stay consistent.',
          urgency: 'low',
          createdAt: nowIso(),
        })
      }
    }
  }

  // Spending spike
  const spendMetric = def.scorecardMetrics.find(m => /spend|expense/i.test(m.name))
  if (spendMetric) {
    const vals = recentEntries(entries, spendMetric.id, 8).map(e => e.value)
    if (vals.length >= 4) {
      const recentAvg = rollingAverage(vals, 4)
      const prevAvg = rollingAverage(vals.slice(0, -4), 4)
      const change = percentChange(recentAvg, prevAvg)
      if (change > 10) {
        preds.push({
          id: uuid(),
          employeeId,
          type: 'risk',
          title: `Spending is ${Math.round(change)}% above last period's average`,
          detail: `Recent average: $${Math.round(recentAvg).toLocaleString()} vs prior: $${Math.round(prevAvg).toLocaleString()}. Investigate the increase.`,
          confidence: 0.75,
          actionSuggestion: 'Review recent transactions for unusual or discretionary spending you can cut.',
          urgency: change > 25 ? 'high' : 'medium',
          createdAt: nowIso(),
        })
      }
    }
  }

  // Rule of 100 streak (from memories)
  const memories = getMemoriesForEmployee(employeeId)
  const rule100 = memories.filter(m => /rule.?of.?100|daily.?metric|streak/i.test(m.content))
  if (rule100.length > 0) {
    // Count consecutive recent days
    let streak = 0
    for (const m of rule100) {
      if (daysAgo(m.createdAt) <= streak + 1.5) {
        streak++
      } else {
        break
      }
    }
    if (streak >= 5) {
      preds.push({
        id: uuid(),
        employeeId,
        type: 'milestone',
        title: `Rule of 100 streak: ${streak} days!`,
        detail: `You've maintained your Rule of 100 discipline for ${streak} consecutive days. Push for a new personal record!`,
        confidence: 0.85,
        actionSuggestion: `Day ${streak + 1} tomorrow. Keep the streak alive.`,
        urgency: 'low',
        createdAt: nowIso(),
      })
    }
  }

  return preds
}

function connectorPredictions(employeeId: string, _entries: ScorecardEntry[], _def: EmployeeDefinition): Prediction[] {
  const preds: Prediction[] = []
  const memories = getMemoriesForEmployee(employeeId)

  // Upcoming dates (birthdays, anniversaries) — scan memories for date patterns
  const datePattern = /(?:birthday|anniversary|bday|b-day).*?(\d{1,2}[/-]\d{1,2})/i
  for (const m of memories.slice(0, 50)) {
    const match = m.content.match(datePattern)
    if (match) {
      // Try to parse the date for this year
      const [monthDay] = match[1].split(/[/-]/)
      const person = m.content.slice(0, 40)
      preds.push({
        id: uuid(),
        employeeId,
        type: 'reminder',
        title: `Upcoming date detected: "${person.trim()}..."`,
        detail: `Found a mention of a special date (${match[1]}) in your memories. Make sure you're prepared.`,
        confidence: 0.6,
        actionSuggestion: 'Set a reminder and prepare a thoughtful gesture ahead of time.',
        urgency: 'medium',
        createdAt: nowIso(),
        expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      })
    }
  }

  // Relationship cooling — people mentioned long ago but not recently
  const personPattern = /(?:talked? to|met with|called|texted|reached out to|coffee with|lunch with)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/g
  const personLastSeen = new Map<string, number>()
  for (const m of memories) {
    let personMatch: RegExpExecArray | null
    personPattern.lastIndex = 0
    while ((personMatch = personPattern.exec(m.content)) !== null) {
      const name = personMatch[1]
      const age = daysAgo(m.createdAt)
      const existing = personLastSeen.get(name)
      if (existing === undefined || age < existing) {
        personLastSeen.set(name, age)
      }
    }
  }

  for (const [name, lastDays] of personLastSeen) {
    if (lastDays >= 60) {
      preds.push({
        id: uuid(),
        employeeId,
        type: 'risk',
        title: `Haven't connected with ${name} in ${Math.round(lastDays)} days`,
        detail: `Your last interaction with ${name} was ~${Math.round(lastDays)} days ago. Relationships fade without nurture.`,
        confidence: 0.6,
        actionSuggestion: `Send ${name} a quick message or schedule a catch-up call.`,
        urgency: lastDays > 90 ? 'high' : 'medium',
        createdAt: nowIso(),
      })
    }
  }

  return preds
}

function reflectorPredictions(employeeId: string, entries: ScorecardEntry[], def: EmployeeDefinition): Prediction[] {
  const preds: Prediction[] = []

  // Values alignment drop
  const alignmentMetric = def.scorecardMetrics.find(m => /alignment|values|purpose|fulfillment/i.test(m.name))
  if (alignmentMetric) {
    const vals = recentEntries(entries, alignmentMetric.id, 7).map(e => e.value)
    if (vals.length >= 3) {
      const recentAvg = rollingAverage(vals, 3)
      const prevAvg = rollingAverage(vals.slice(0, -3), 3)
      const change = percentChange(recentAvg, prevAvg)
      if (change < -10) {
        preds.push({
          id: uuid(),
          employeeId,
          type: 'risk',
          title: 'Values alignment score has dropped this week',
          detail: `Your alignment score dropped ${Math.round(Math.abs(change))}% — you may be spending more time on urgencies than priorities.`,
          confidence: 0.65,
          actionSuggestion: 'Take 15 minutes to review your top 3 values and compare against this week\'s calendar.',
          urgency: Math.abs(change) > 25 ? 'high' : 'medium',
          createdAt: nowIso(),
        })
      }
    }
  }

  // Operator mode streak — check if wellness/reflector metrics are stale
  const memories = getMemoriesForEmployee(employeeId)
  const recentReflections = memories.filter(m => /reflect|journal|gratitude|meditat/i.test(m.content) && daysAgo(m.createdAt) <= 14)
  const recentOperator = memories.filter(m => /task|project|deadline|meeting|revenue|deal/i.test(m.content) && daysAgo(m.createdAt) <= 14)

  if (recentOperator.length > 10 && recentReflections.length < 3) {
    preds.push({
      id: uuid(),
      employeeId,
      type: 'trend',
      title: 'Heavy Operator mode detected — consider switching to Coach',
      detail: `In the last 14 days: ${recentOperator.length} work-related activities vs only ${recentReflections.length} reflective ones. You may be running on autopilot.`,
      confidence: 0.6,
      actionSuggestion: 'Switch to Coach archetype for a day. Journal, meditate, or do a weekly review.',
      urgency: 'medium',
      createdAt: nowIso(),
    })
  }

  return preds
}

// Catch-all for employees without specialized logic
function genericPredictions(employeeId: string, entries: ScorecardEntry[], def: EmployeeDefinition): Prediction[] {
  const preds: Prediction[] = []

  for (const metric of def.scorecardMetrics) {
    const vals = recentEntries(entries, metric.id, 5).map(e => e.value)
    if (vals.length < 2) continue

    const latest = vals[vals.length - 1]
    const status = getScorecardStatus(latest, metric)

    if (status === 'red') {
      preds.push({
        id: uuid(),
        employeeId,
        type: 'risk',
        title: `${metric.name} is in the red zone`,
        detail: `Current value: ${latest}${metric.unit}, target: ${metric.target}${metric.unit}. Needs immediate attention.`,
        confidence: 0.8,
        actionSuggestion: `Create a plan to get ${metric.name} back on track this week.`,
        urgency: 'high',
        createdAt: nowIso(),
      })
    }
  }

  return preds
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const EMPLOYEE_GENERATORS: Record<string, (id: string, entries: ScorecardEntry[], def: EmployeeDefinition) => Prediction[]> = {
  closer: closerPredictions,
  operator: operatorPredictions,
  'wellness-coach': wellnessCoachPredictions,
  'wealth-strategist': wealthStrategistPredictions,
  connector: connectorPredictions,
  reflector: reflectorPredictions,
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generatePredictions(employeeId: string): Prediction[] {
  const def = getEmployee(employeeId)
  if (!def) return []

  const entries = getScorecard(employeeId)
  const generator = EMPLOYEE_GENERATORS[employeeId] ?? genericPredictions
  const preds = generator(employeeId, entries, def)

  // Always include generic red-zone checks for employees that have specialized logic
  const generic = EMPLOYEE_GENERATORS[employeeId] ? genericPredictions(employeeId, entries, def) : []
  const allPreds = [...preds, ...generic]

  // Filter dismissed
  return allPreds.filter(p => !dismissed.has(p.id))
}

export function getAllPredictions(): Prediction[] {
  const active = getActiveEmployees()
  const all: Prediction[] = []

  for (const emp of active) {
    const preds = generatePredictions(emp.employeeId)
    all.push(...preds)
  }

  // Sort by urgency (urgent > high > medium > low), then by confidence descending
  const urgencyOrder: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 }
  return [...all].sort((a, b) => {
    const urgDiff = (urgencyOrder[b.urgency] ?? 0) - (urgencyOrder[a.urgency] ?? 0)
    if (urgDiff !== 0) return urgDiff
    return b.confidence - a.confidence
  })
}

export function dismissPrediction(id: string): void {
  dismissed.add(id)
}

export function formatPredictions(predictions: Prediction[], limit = 3): string {
  if (predictions.length === 0) return ''

  const lines: string[] = []
  lines.push('PREDICTIONS:')
  const top = predictions.slice(0, limit)

  for (const p of top) {
    const urgencyIcon = p.urgency === 'urgent' || p.urgency === 'high' ? '[!]' : p.urgency === 'medium' ? '[~]' : '[ ]'
    lines.push(`  ${urgencyIcon} ${p.title} -- ${p.actionSuggestion}`)
  }

  const remaining = predictions.length - limit
  if (remaining > 0) {
    lines.push(`  (+${remaining} more predictions)`)
  }

  return lines.join('\n')
}
