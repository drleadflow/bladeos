import { escalationRules, costEntries, employees, activityEvents, notifications } from '@blade/db'
import { logger } from '@blade/shared'

export interface EvaluationResult {
  ruleId: string
  ruleName: string
  triggered: boolean
  conditionValue: string
  actionTaken: string | null
}

/**
 * Evaluate all enabled rules against current system state.
 * Call this periodically (every 60 seconds) or after significant events.
 */
export function evaluateAllRules(): EvaluationResult[] {
  const rules = escalationRules.list({ enabled: true })
  const results: EvaluationResult[] = []

  for (const rule of rules) {
    if (rule.lastTriggeredAt) {
      const cooldownMs = rule.cooldownMinutes * 60 * 1000
      const elapsed = Date.now() - new Date(rule.lastTriggeredAt).getTime()
      if (elapsed < cooldownMs) continue
    }

    const conditionConfig = JSON.parse(rule.conditionConfigJson) as Record<string, unknown>
    const actionConfig = JSON.parse(rule.actionConfigJson) as Record<string, unknown>

    const conditionMet = checkCondition(rule.conditionType, conditionConfig)

    if (conditionMet.triggered) {
      const actionResult = executeAction(rule.actionType, actionConfig, rule.name)

      escalationRules.recordTrigger(rule.id)
      escalationRules.logEvent({
        ruleId: rule.id,
        ruleName: rule.name,
        conditionType: rule.conditionType,
        conditionValue: conditionMet.value,
        actionType: rule.actionType,
        actionResult,
      })

      activityEvents.emit({
        eventType: 'escalation_triggered',
        actorType: 'system',
        actorId: 'escalation-engine',
        summary: `Rule "${rule.name}" triggered: ${actionResult}`,
        detail: { ruleId: rule.id, condition: rule.conditionType, action: rule.actionType },
      })

      logger.warn('Escalation', `Rule "${rule.name}" triggered: ${conditionMet.value} → ${actionResult}`)

      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        triggered: true,
        conditionValue: conditionMet.value,
        actionTaken: actionResult,
      })
    } else {
      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        triggered: false,
        conditionValue: conditionMet.value,
        actionTaken: null,
      })
    }
  }

  return results
}

function checkCondition(
  type: string,
  config: Record<string, unknown>
): { triggered: boolean; value: string } {
  const threshold = config.threshold as number | string

  switch (type) {
    case 'cost_daily': {
      const summary = costEntries.summary(1)
      const todayCost = summary.totalUsd
      return {
        triggered: todayCost > (threshold as number),
        value: `$${todayCost.toFixed(2)}`,
      }
    }
    case 'success_rate': {
      const empList = employees.list() as unknown as Array<{ slug: string; successRate: number | null }>
      const lowPerformers = empList.filter(
        (e) => e.successRate !== null && e.successRate < (threshold as number)
      )
      return {
        triggered: lowPerformers.length > 0,
        value:
          lowPerformers.length > 0
            ? `${lowPerformers.map((e) => e.slug).join(', ')} below ${threshold}`
            : 'all above threshold',
      }
    }
    case 'security_severity': {
      const today = new Date().toISOString().split('T')[0]
      const events = activityEvents.list({
        eventType: 'injection_detected',
        since: `${today}T00:00:00.000Z`,
        limit: 100,
      })
      const count = events.length
      const severity = count >= 10 ? 'critical' : count >= 3 ? 'elevated' : 'clear'
      const thresholdStr = threshold as string
      const severityOrder = ['clear', 'elevated', 'critical']
      return {
        triggered: severityOrder.indexOf(severity) >= severityOrder.indexOf(thresholdStr),
        value: `${severity} (${count} events)`,
      }
    }
    default:
      return { triggered: false, value: 'unknown condition type' }
  }
}

function executeAction(
  type: string,
  config: Record<string, unknown>,
  ruleName: string
): string {
  const message = (config.message as string) ?? `Escalation rule "${ruleName}" triggered`

  switch (type) {
    case 'notify': {
      notifications.create({ title: 'Escalation Alert', message, type: 'warning' })
      return `Notification sent: ${message}`
    }
    case 'pause_employee': {
      const slug = config.employeeSlug as string
      if (slug) {
        notifications.create({
          title: 'Employee Pause Recommended',
          message: `Rule suggests pausing ${slug}: ${message}`,
          type: 'warning',
        })
        return `Pause recommended for ${slug}`
      }
      return 'No employee specified'
    }
    case 'pause_all': {
      notifications.create({ title: 'System Pause Recommended', message, type: 'critical' })
      return 'System pause notification sent'
    }
    case 'escalate_to_owner': {
      notifications.create({ title: 'Owner Escalation', message, type: 'critical' })
      return `Escalated to owner: ${message}`
    }
    default:
      return 'unknown action type'
  }
}
