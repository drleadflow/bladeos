import type { ActiveEmployee } from './types.js'
import { getEmployee } from './registry.js'
import { getScorecard, formatScorecard } from './scorecard.js'
import { getAllPredictions, formatPredictions } from '../intelligence/predictions.js'

interface BriefingItem {
  employeeName: string
  icon: string
  pillar: string
  summary: string
  priority: number
}

function computePriority(entry: { status: string }): number {
  switch (entry.status) {
    case 'red': return 3
    case 'yellow': return 2
    case 'green': return 1
    default: return 0
  }
}

export async function generateMorningBriefing(activeEmployees: ActiveEmployee[]): Promise<string> {
  const items: BriefingItem[] = []

  for (const active of activeEmployees) {
    const def = getEmployee(active.employeeId)
    if (!def) continue

    const entries = getScorecard(active.employeeId)
    const scorecardText = formatScorecard(entries, def)

    const maxPriority = entries.reduce(
      (max, e) => Math.max(max, computePriority(e)),
      0
    )

    const redCount = entries.filter(e => e.status === 'red').length
    const yellowCount = entries.filter(e => e.status === 'yellow').length

    let statusLine: string
    if (redCount > 0) {
      statusLine = `${redCount} metric(s) need attention`
    } else if (yellowCount > 0) {
      statusLine = `${yellowCount} metric(s) trending off-target`
    } else if (entries.length > 0) {
      statusLine = 'All metrics on track'
    } else {
      statusLine = 'No scorecard data yet'
    }

    items.push({
      employeeName: def.name,
      icon: def.icon,
      pillar: def.pillar,
      summary: `${statusLine}\n${scorecardText}`,
      priority: maxPriority,
    })
  }

  // Sort by priority descending (most urgent first)
  const sorted = [...items].sort((a, b) => b.priority - a.priority)

  const lines: string[] = []
  lines.push('--- MORNING BRIEFING ---')
  lines.push(`Date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`)
  lines.push(`Active employees: ${activeEmployees.length}`)
  lines.push('')

  // Top 3 priorities
  const top3 = sorted.slice(0, 3)
  if (top3.length > 0) {
    lines.push('TOP PRIORITIES:')
    for (let i = 0; i < top3.length; i++) {
      const item = top3[i]
      lines.push(`${i + 1}. ${item.icon} ${item.employeeName} [${item.pillar}]`)
      lines.push(`   ${item.summary.split('\n')[0]}`)
    }
    lines.push('')
  }

  // Full updates
  lines.push('EMPLOYEE UPDATES:')
  for (const item of sorted) {
    lines.push(`${item.icon} ${item.employeeName} [${item.pillar}]`)
    lines.push(item.summary.split('\n').map(l => `  ${l}`).join('\n'))
    lines.push('')
  }

  // Predictions section
  const predictions = getAllPredictions()
  const predText = formatPredictions(predictions, 3)
  if (predText) {
    lines.push(predText)
    lines.push('')
  }

  lines.push('--- END BRIEFING ---')

  return lines.join('\n')
}
