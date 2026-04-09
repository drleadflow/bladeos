import cron, { type ScheduledTask } from 'node-cron'
import { notifications } from '@blade/db'
import { runAgentLoop } from '../agent-loop.js'
import { getAllToolDefinitions } from '../tool-registry.js'
import { getEmployee, getActiveEmployees } from './registry.js'
import { getScorecard, getScorecardStatus } from './scorecard.js'
import type { ExecutionContext } from '../types.js'
import type { ProactiveBehavior, EmployeeDefinition } from './types.js'

// ============================================================
// COOLDOWN TRACKING
// ============================================================

const lastRunMap = new Map<string, number>()

function cooldownKey(employeeSlug: string, behaviorId: string): string {
  return `${employeeSlug}:${behaviorId}`
}

function isOnCooldown(employeeSlug: string, behavior: ProactiveBehavior): boolean {
  const key = cooldownKey(employeeSlug, behavior.id)
  const lastRun = lastRunMap.get(key)
  if (!lastRun) return false
  const elapsedHours = (Date.now() - lastRun) / (1000 * 60 * 60)
  return elapsedHours < behavior.cooldownHours
}

function recordRun(employeeSlug: string, behaviorId: string): void {
  lastRunMap.set(cooldownKey(employeeSlug, behaviorId), Date.now())
}

// ============================================================
// BEHAVIOR PROMPT BUILDERS
// ============================================================

/**
 * Build specialized prompts for known behavior actions. Falls back to a
 * generic prompt built from the behavior description.
 */
function buildBehaviorPrompt(
  employee: EmployeeDefinition,
  behavior: ProactiveBehavior,
): string {
  const base = employee.systemPrompt.operator

  switch (behavior.action) {
    case 'scan_stale_prs':
      return `${base}

You are running a scheduled proactive check. ${behavior.description}.

Scan for any GitHub pull requests that have been open for more than 48 hours without review activity. For each stale PR found, note:
- Repository name
- PR title and number
- How long it has been open
- Recommended action

Produce a concise summary report of stale PRs. If none are found, state clearly that all PRs are within SLA. End your report with a short recommendation.`

    case 'audit_conversations':
    case 'scan_recurring_issues':
      return `${base}

You are running a scheduled proactive check. ${behavior.description}.

Review recent customer support conversations and identify:
- Any unread or unanswered conversations older than 1 hour
- Recurring issue patterns (same question asked 3+ times)
- Any escalation signals (caps, negative keywords, urgency)

Produce a concise summary with counts and recommended actions. Be specific and actionable.`

    case 'check_metrics':
    case 'scan_bottlenecks': {
      const scorecardSummary = buildScorecardSummary(employee)
      return `${base}

You are running a scheduled proactive check. ${behavior.description}.

Current scorecard data:
${scorecardSummary}

Review these metrics and:
1. Flag any that are RED (significantly off target)
2. Flag any that are YELLOW (at risk)
3. Identify the highest-leverage action to improve the worst metric
4. Produce a concise operations report with prioritized recommendations.`
    }

    case 'scan_stale_deals':
    case 'scan_cold_relationships':
      return `${base}

You are running a scheduled proactive check. ${behavior.description}.

Identify any deals or relationships that have had no activity for 7+ days. For each:
- Note the contact or deal name
- Days since last activity
- Recommended follow-up action (message, call, email)

Produce a prioritized follow-up list sorted by urgency. Keep it concise.`

    case 'check_open_proposals':
    case 'scan_stale_nurture_leads':
      return `${base}

You are running a scheduled proactive check. ${behavior.description}.

Review all open proposals and nurture sequences. Flag any that:
- Have had no response in 5+ days
- Are approaching a decision deadline
- Need a follow-up touchpoint

Draft a concise action list with specific next steps for each flagged item.`

    case 'review_ad_performance':
    case 'suggest_content_ideas':
      return `${base}

You are running a scheduled proactive check. ${behavior.description}.

Analyze current marketing performance and content pipeline. Identify:
- Any underperforming campaigns (CTR below benchmark, high CPC)
- Content gaps in the publishing schedule
- Quick-win opportunities for the next 7 days

Produce a prioritized marketing action list.`

    case 'suggest_fast_cash_play':
    case 'trigger_subscription_audit':
      return `${base}

You are running a scheduled proactive check. ${behavior.description}.

Review current revenue streams and identify:
- Highest-probability short-term revenue opportunities
- Any subscriptions or recurring revenue at risk
- Quick actions that could generate cash within 7 days

Produce a concise revenue opportunity report with estimated impact.`

    case 'check_habit_streaks':
    case 'recommend_recovery':
      return `${base}

You are running a scheduled proactive check. ${behavior.description}.

Review the current wellness and habit data. Identify:
- Which habits are on track vs. broken streaks
- Any recovery actions needed (sleep, exercise, nutrition)
- Top priority recommendation for today

Produce a brief, encouraging wellness check-in report.`

    case 'prompt_weekly_reflection':
    case 'flag_values_misalignment':
      return `${base}

You are running a scheduled proactive check. ${behavior.description}.

Prompt a structured weekly reflection covering:
- Top wins from the past week
- Key lessons learned
- Areas where actions may have diverged from stated values
- Single most important priority for the coming week

Frame this as a thoughtful, non-judgmental reflection guide.`

    case 'check_upcoming_dates':
    case 'prepare_quarterly_event':
      return `${base}

You are running a scheduled proactive check. ${behavior.description}.

Review upcoming important dates, milestones, and relationship events. For each:
- Note the date and what it is
- Recommended preparation or outreach action
- Time-sensitive items flagged first

Produce a concise upcoming events and relationship calendar summary.`

    case 'analyze_coverage_drop':
    case 'analyze_income_decline':
    case 'analyze_csat_decline':
    case 'analyze_show_rate_decline': {
      const scorecardSummary = buildScorecardSummary(employee)
      return `${base}

You are running a scheduled proactive check. ${behavior.description}.

Current metrics:
${scorecardSummary}

Analyze the declining metric and:
1. Identify likely root causes (at least 2-3 hypotheses)
2. Rank by probability
3. Recommend the single most impactful corrective action
4. Suggest a measurement checkpoint to verify improvement

Produce a structured root cause analysis.`
    }

    case 'suggest_sop_creation':
      return `${base}

You are running a scheduled proactive check. ${behavior.description}.

A process has been repeated without formal documentation. Draft a structured SOP template including:
- Process name and trigger condition
- Step-by-step numbered instructions
- Definition of "done"
- Owner and stakeholders
- Common failure points and how to handle them

Keep it practical and actionable — this should be usable by anyone on the team.`

    default:
      // Generic fallback for any unrecognized action
      return `${base}

You are running a scheduled proactive check. Task: ${behavior.description}

Perform the following action: ${behavior.action}

Produce a concise summary of your findings and any recommended actions. Be specific and actionable.`
  }
}

function buildScorecardSummary(employee: EmployeeDefinition): string {
  try {
    const entries = getScorecard(employee.id)
    if (entries.length === 0) return '  No scorecard data recorded yet.'

    const latestByMetric = new Map<string, number>()
    for (const entry of entries) {
      if (!latestByMetric.has(entry.metricId)) {
        latestByMetric.set(entry.metricId, entry.value)
      }
    }

    return employee.scorecardMetrics.map(metric => {
      const value = latestByMetric.get(metric.id)
      if (value === undefined) return `  [ ] ${metric.name}: No data`
      const status = getScorecardStatus(value, metric)
      const icon = status === 'green' ? '[G]' : status === 'yellow' ? '[Y]' : '[R]'
      return `  ${icon} ${metric.name}: ${value}${metric.unit} (target: ${metric.target}${metric.unit})`
    }).join('\n')
  } catch {
    return '  Unable to load scorecard data.'
  }
}

// ============================================================
// CORE EXECUTION
// ============================================================

/**
 * Run a single proactive behavior for the given employee.
 * Returns success/failure with a result string summary.
 */
export async function runProactiveBehavior(
  employeeSlug: string,
  behaviorId: string,
  context: ExecutionContext,
): Promise<{ success: boolean; result: string }> {
  const employee = getEmployee(employeeSlug)
  if (!employee) {
    return { success: false, result: `Employee "${employeeSlug}" not found in registry` }
  }

  const behavior = employee.proactiveBehaviors.find(b => b.id === behaviorId)
  if (!behavior) {
    return { success: false, result: `Behavior "${behaviorId}" not found on employee "${employeeSlug}"` }
  }

  if (isOnCooldown(employeeSlug, behavior)) {
    return { success: false, result: `Behavior "${behaviorId}" is on cooldown (${behavior.cooldownHours}h)` }
  }

  const systemPrompt = buildBehaviorPrompt(employee, behavior)
  const toolDefs = getAllToolDefinitions()

  try {
    const loopResult = await runAgentLoop({
      systemPrompt,
      messages: [{ role: 'user', content: `Run your proactive behavior: ${behavior.description}` }],
      tools: toolDefs,
      context: {
        ...context,
        conversationId: `proactive-${employeeSlug}-${behaviorId}-${Date.now()}`,
      },
      maxIterations: 8,
    })

    const resultText = loopResult.turns
      .flatMap(t => t.response.content)
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim()

    const summary = resultText.slice(0, 500) || `Completed behavior: ${behavior.description}`

    // Store result as a notification so users can see it
    notifications.create({
      title: `${employee.name}: ${behavior.description}`,
      message: summary,
      type: 'proactive',
      employeeSlug,
    })

    recordRun(employeeSlug, behaviorId)

    return { success: true, result: resultText || 'Completed successfully' }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[proactive] ${employeeSlug}/${behaviorId} failed: ${message}`)

    notifications.create({
      title: `${employee.name}: Behavior check failed`,
      message: `"${behavior.description}" encountered an error: ${message}`,
      type: 'error',
      employeeSlug,
    })

    return { success: false, result: message }
  }
}

// ============================================================
// SCHEDULER WIRING
// ============================================================

const scheduledBehaviorTasks: Map<string, ScheduledTask> = new Map()

/**
 * Register cron jobs for all active employees' proactive behaviors.
 * Call this once at startup, after employees are registered and activated.
 */
export async function scheduleEmployeeBehaviors(): Promise<void> {
  // Stop any previously registered tasks before re-scheduling
  for (const [key, task] of scheduledBehaviorTasks) {
    task.stop()
    scheduledBehaviorTasks.delete(key)
  }

  const activeEmployees = getActiveEmployees()

  if (activeEmployees.length === 0) {
    console.log('[proactive] No active employees — skipping behavior scheduling')
    return
  }

  let scheduled = 0

  for (const active of activeEmployees) {
    const employee = getEmployee(active.employeeId)
    if (!employee) continue

    for (const behavior of employee.proactiveBehaviors) {
      // Only schedule cron-triggered behaviors; event/threshold triggers need
      // to be wired into specific event handlers in the application layer.
      if (behavior.trigger !== 'cron') {
        console.log(`[proactive] Skipping ${active.employeeId}/${behavior.id} (trigger: ${behavior.trigger} — wire via event system)`)
        continue
      }

      if (!behavior.schedule) {
        console.warn(`[proactive] ${active.employeeId}/${behavior.id} has trigger=cron but no schedule — skipping`)
        continue
      }

      if (!cron.validate(behavior.schedule)) {
        console.error(`[proactive] Invalid cron schedule for ${active.employeeId}/${behavior.id}: "${behavior.schedule}"`)
        continue
      }

      const taskKey = `${active.employeeId}:${behavior.id}`

      const task = cron.schedule(behavior.schedule, async () => {
        console.log(`[proactive] Firing: ${active.employeeId}/${behavior.id}`)

        const context: ExecutionContext = {
          conversationId: `proactive-${active.employeeId}-${behavior.id}-${Date.now()}`,
          userId: 'system',
          modelId: 'claude-sonnet-4-20250514',
          maxIterations: 8,
          costBudget: 0,
        }

        const result = await runProactiveBehavior(active.employeeId, behavior.id, context)
        if (result.success) {
          console.log(`[proactive] ${active.employeeId}/${behavior.id} completed`)
        } else {
          console.warn(`[proactive] ${active.employeeId}/${behavior.id} skipped/failed: ${result.result}`)
        }
      })

      scheduledBehaviorTasks.set(taskKey, task)
      scheduled++
      console.log(`[proactive] Scheduled ${active.employeeId}/${behavior.id} [${behavior.schedule}]`)
    }
  }

  console.log(`[proactive] ${scheduled} behavior(s) scheduled across ${activeEmployees.length} active employee(s)`)
}

/**
 * Stop all scheduled proactive behavior tasks.
 */
export function stopEmployeeBehaviors(): void {
  for (const [key, task] of scheduledBehaviorTasks) {
    task.stop()
    console.log(`[proactive] Stopped: ${key}`)
  }
  scheduledBehaviorTasks.clear()
}
