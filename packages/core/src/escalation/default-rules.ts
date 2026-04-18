import { escalationRules } from '@blade/db'
import { logger } from '@blade/shared'

/**
 * Seed default escalation rules if none exist.
 * Called once during initialization.
 */
export function seedDefaultRules(): void {
  const existing = escalationRules.list()
  if (existing.length > 0) return

  const defaults = [
    {
      name: 'Daily cost limit',
      description: 'Alert when daily spending exceeds $5',
      conditionType: 'cost_daily',
      conditionConfig: { threshold: 5.0 },
      actionType: 'notify',
      actionConfig: { message: 'Daily cost has exceeded $5.00. Review active agents.' },
      cooldownMinutes: 240,
    },
    {
      name: 'Low success rate',
      description: 'Alert when any employee success rate drops below 50%',
      conditionType: 'success_rate',
      conditionConfig: { threshold: 0.5 },
      actionType: 'notify',
      actionConfig: { message: 'Employee success rate below 50%. Review recent failures.' },
      cooldownMinutes: 120,
    },
    {
      name: 'Security threat elevated',
      description: 'Escalate when security severity reaches elevated',
      conditionType: 'security_severity',
      conditionConfig: { threshold: 'elevated' },
      actionType: 'escalate_to_owner',
      actionConfig: { message: 'Multiple injection attempts detected. Review security events.' },
      cooldownMinutes: 60,
    },
  ]

  for (const rule of defaults) {
    escalationRules.create({
      name: rule.name,
      description: rule.description,
      conditionType: rule.conditionType,
      conditionConfigJson: JSON.stringify(rule.conditionConfig),
      actionType: rule.actionType,
      actionConfigJson: JSON.stringify(rule.actionConfig),
      cooldownMinutes: rule.cooldownMinutes,
    })
  }

  logger.info('Escalation', `Seeded ${defaults.length} default escalation rules`)
}
