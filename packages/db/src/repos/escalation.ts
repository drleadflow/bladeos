import { db, uuid, now } from './helpers.js'

// ============================================================
// ESCALATION RULES ENGINE
// ============================================================

// condition_type values:
//   'cost_daily'         — trigger when daily cost > threshold (USD)
//   'cost_per_job'       — trigger when per-job cost > threshold (USD)
//   'success_rate'       — trigger when employee success rate < threshold (0–1)
//   'mission_duration'   — trigger when mission runs > threshold ms
//   'security_severity'  — trigger when security level >= threshold ('elevated'|'critical')
//   'batch_stall'        — trigger when batch has stalled
//   'memory_low'         — trigger when memory usage > threshold (0–1)

// action_type values:
//   'notify'             — create a notification
//   'pause_employee'     — recommend pausing a specific employee
//   'pause_all'          — recommend pausing all non-critical agents
//   'stop_batch'         — recommend stopping the active batch
//   'escalate_to_owner'  — critical escalation notification

export interface EscalationRuleRecord {
  id: string
  name: string
  description: string | null
  conditionType: string
  conditionConfigJson: string
  actionType: string
  actionConfigJson: string
  enabled: number
  cooldownMinutes: number
  lastTriggeredAt: string | null
  triggerCount: number
  createdAt: string
  updatedAt: string
}

export interface EscalationEventRecord {
  id: number
  ruleId: string
  ruleName: string
  conditionType: string
  conditionValue: string | null
  actionType: string
  actionResult: string | null
  resolved: number
  createdAt: string
}

export interface CreateRuleParams {
  name: string
  description?: string
  conditionType: string
  conditionConfigJson: string
  actionType: string
  actionConfigJson: string
  enabled?: number
  cooldownMinutes?: number
}

const SELECT_RULE_FIELDS = `
  id, name, description,
  condition_type as conditionType,
  condition_config_json as conditionConfigJson,
  action_type as actionType,
  action_config_json as actionConfigJson,
  enabled,
  cooldown_minutes as cooldownMinutes,
  last_triggered_at as lastTriggeredAt,
  trigger_count as triggerCount,
  created_at as createdAt,
  updated_at as updatedAt
`

const SELECT_EVENT_FIELDS = `
  id, rule_id as ruleId, rule_name as ruleName,
  condition_type as conditionType,
  condition_value as conditionValue,
  action_type as actionType,
  action_result as actionResult,
  resolved, created_at as createdAt
`

export const escalationRules = {
  create(params: CreateRuleParams): EscalationRuleRecord {
    const id = uuid()
    const ts = now()
    db().prepare(
      `INSERT INTO escalation_rules
         (id, name, description, condition_type, condition_config_json,
          action_type, action_config_json, enabled, cooldown_minutes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      params.name,
      params.description ?? null,
      params.conditionType,
      params.conditionConfigJson,
      params.actionType,
      params.actionConfigJson,
      params.enabled ?? 1,
      params.cooldownMinutes ?? 60,
      ts,
      ts
    )
    return escalationRules.get(id)!
  },

  get(id: string): EscalationRuleRecord | undefined {
    return db()
      .prepare(`SELECT ${SELECT_RULE_FIELDS} FROM escalation_rules WHERE id = ?`)
      .get(id) as EscalationRuleRecord | undefined
  },

  list(filters?: { enabled?: boolean }): EscalationRuleRecord[] {
    if (filters?.enabled !== undefined) {
      return db()
        .prepare(`SELECT ${SELECT_RULE_FIELDS} FROM escalation_rules WHERE enabled = ? ORDER BY created_at ASC`)
        .all(filters.enabled ? 1 : 0) as EscalationRuleRecord[]
    }
    return db()
      .prepare(`SELECT ${SELECT_RULE_FIELDS} FROM escalation_rules ORDER BY created_at ASC`)
      .all() as EscalationRuleRecord[]
  },

  update(
    id: string,
    updates: Partial<{
      name: string
      description: string
      conditionConfigJson: string
      actionConfigJson: string
      enabled: number
      cooldownMinutes: number
    }>
  ): void {
    const fields: string[] = []
    const values: unknown[] = []

    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name) }
    if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description) }
    if (updates.conditionConfigJson !== undefined) { fields.push('condition_config_json = ?'); values.push(updates.conditionConfigJson) }
    if (updates.actionConfigJson !== undefined) { fields.push('action_config_json = ?'); values.push(updates.actionConfigJson) }
    if (updates.enabled !== undefined) { fields.push('enabled = ?'); values.push(updates.enabled) }
    if (updates.cooldownMinutes !== undefined) { fields.push('cooldown_minutes = ?'); values.push(updates.cooldownMinutes) }

    if (fields.length === 0) return

    fields.push('updated_at = ?')
    values.push(now(), id)

    db().prepare(`UPDATE escalation_rules SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  },

  enable(id: string): void {
    db().prepare('UPDATE escalation_rules SET enabled = 1, updated_at = ? WHERE id = ?').run(now(), id)
  },

  disable(id: string): void {
    db().prepare('UPDATE escalation_rules SET enabled = 0, updated_at = ? WHERE id = ?').run(now(), id)
  },

  delete(id: string): void {
    db().prepare('DELETE FROM escalation_rules WHERE id = ?').run(id)
  },

  recordTrigger(id: string): void {
    db()
      .prepare(
        'UPDATE escalation_rules SET trigger_count = trigger_count + 1, last_triggered_at = ?, updated_at = ? WHERE id = ?'
      )
      .run(now(), now(), id)
  },

  // Events

  logEvent(params: {
    ruleId: string
    ruleName: string
    conditionType: string
    conditionValue?: string
    actionType: string
    actionResult?: string
  }): number {
    const result = db()
      .prepare(
        `INSERT INTO escalation_events
           (rule_id, rule_name, condition_type, condition_value, action_type, action_result, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        params.ruleId,
        params.ruleName,
        params.conditionType,
        params.conditionValue ?? null,
        params.actionType,
        params.actionResult ?? null,
        now()
      )
    return Number(result.lastInsertRowid)
  },

  getEvents(filters?: { ruleId?: string; resolved?: boolean; limit?: number }): EscalationEventRecord[] {
    const conditions: string[] = []
    const values: unknown[] = []

    if (filters?.ruleId !== undefined) { conditions.push('rule_id = ?'); values.push(filters.ruleId) }
    if (filters?.resolved !== undefined) { conditions.push('resolved = ?'); values.push(filters.resolved ? 1 : 0) }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const limit = filters?.limit ?? 100
    values.push(limit)

    return db()
      .prepare(`SELECT ${SELECT_EVENT_FIELDS} FROM escalation_events ${where} ORDER BY created_at DESC LIMIT ?`)
      .all(...values) as EscalationEventRecord[]
  },

  resolveEvent(id: number): void {
    db().prepare('UPDATE escalation_events SET resolved = 1 WHERE id = ?').run(id)
  },

  getUnresolved(): EscalationEventRecord[] {
    return db()
      .prepare(`SELECT ${SELECT_EVENT_FIELDS} FROM escalation_events WHERE resolved = 0 ORDER BY created_at DESC`)
      .all() as EscalationEventRecord[]
  },
}
