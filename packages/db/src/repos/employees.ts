import { db, uuid, now } from './helpers.js'

// ============================================================
// EMPLOYEES
// ============================================================

export const employees = {
  upsert(params: {
    slug: string; name: string; title: string; pillar: string; description: string;
    icon?: string; active?: boolean; archetype?: string; onboardingAnswers?: Record<string, string>;
    department?: string; objective?: string; managerId?: string;
    allowedToolsJson?: string[]; blockedToolsJson?: string[];
    modelPreference?: string; maxBudgetPerRun?: number;
    escalationPolicyJson?: unknown; handoffRulesJson?: unknown[];
    memoryScope?: string; outputChannelsJson?: string[];
  }): { id: string } {
    const id = uuid()
    const ts = now()
    const existing = db().prepare('SELECT id FROM employees WHERE slug = ?').get(params.slug) as { id: string } | undefined
    const effectiveId = existing?.id ?? id
    db().prepare(
      `INSERT INTO employees (id, slug, name, title, pillar, description, icon, active, archetype, onboarding_answers_json,
         department, objective, manager_id, allowed_tools_json, blocked_tools_json,
         model_preference, max_budget_per_run, escalation_policy_json, handoff_rules_json,
         memory_scope, output_channels_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(slug) DO UPDATE SET
         name = excluded.name, title = excluded.title, pillar = excluded.pillar,
         description = excluded.description, icon = excluded.icon,
         active = excluded.active, archetype = excluded.archetype,
         onboarding_answers_json = excluded.onboarding_answers_json,
         department = excluded.department, objective = excluded.objective,
         manager_id = excluded.manager_id, allowed_tools_json = excluded.allowed_tools_json,
         blocked_tools_json = excluded.blocked_tools_json, model_preference = excluded.model_preference,
         max_budget_per_run = excluded.max_budget_per_run, escalation_policy_json = excluded.escalation_policy_json,
         handoff_rules_json = excluded.handoff_rules_json, memory_scope = excluded.memory_scope,
         output_channels_json = excluded.output_channels_json,
         updated_at = excluded.updated_at`
    ).run(effectiveId, params.slug, params.name, params.title, params.pillar, params.description,
      params.icon ?? '', params.active ? 1 : 0, params.archetype ?? null,
      JSON.stringify(params.onboardingAnswers ?? {}),
      params.department ?? 'general', params.objective ?? null, params.managerId ?? null,
      JSON.stringify(params.allowedToolsJson ?? []), JSON.stringify(params.blockedToolsJson ?? []),
      params.modelPreference ?? 'standard', params.maxBudgetPerRun ?? 1.0,
      params.escalationPolicyJson ? JSON.stringify(params.escalationPolicyJson) : null,
      JSON.stringify(params.handoffRulesJson ?? []),
      params.memoryScope ?? 'own', JSON.stringify(params.outputChannelsJson ?? ['web']),
      ts, ts)
    return { id: effectiveId }
  },

  get(slug: string) {
    return db().prepare(
      `SELECT id, slug, name, title, pillar, description, icon, active, archetype,
       onboarding_answers_json as onboardingAnswersJson, created_at as createdAt, updated_at as updatedAt
       FROM employees WHERE slug = ?`
    ).get(slug) as { id: string; slug: string; name: string; title: string; pillar: string; description: string; icon: string; active: number; archetype: string | null; onboardingAnswersJson: string; createdAt: string; updatedAt: string } | undefined
  },

  list() {
    return db().prepare(
      `SELECT id, slug, name, title, pillar, description, icon, active, archetype,
       onboarding_answers_json as onboardingAnswersJson, created_at as createdAt
       FROM employees ORDER BY pillar, name`
    ).all() as { id: string; slug: string; name: string; title: string; pillar: string; description: string; icon: string; active: number; archetype: string | null; onboardingAnswersJson: string; createdAt: string }[]
  },

  listActive() {
    return db().prepare(
      `SELECT id, slug, name, title, pillar, description, icon, archetype,
       onboarding_answers_json as onboardingAnswersJson
       FROM employees WHERE active = 1 ORDER BY pillar, name`
    ).all() as { id: string; slug: string; name: string; title: string; pillar: string; description: string; icon: string; archetype: string | null; onboardingAnswersJson: string }[]
  },

  activate(slug: string, archetype: string, answers: Record<string, string>): void {
    db().prepare(
      'UPDATE employees SET active = 1, archetype = ?, onboarding_answers_json = ?, updated_at = ? WHERE slug = ?'
    ).run(archetype, JSON.stringify(answers), now(), slug)
  },

  deactivate(slug: string): void {
    db().prepare('UPDATE employees SET active = 0, updated_at = ? WHERE slug = ?').run(now(), slug)
  },
}

// ============================================================
// ACTIVE EMPLOYEES (convenience wrapper)
// ============================================================

export const activeEmployees = {
  activate(slug: string, archetype: string): void {
    db().prepare(
      'UPDATE employees SET active = 1, archetype = ?, updated_at = ? WHERE slug = ?'
    ).run(archetype, now(), slug)
  },

  deactivate(slug: string): void {
    db().prepare('UPDATE employees SET active = 0, updated_at = ? WHERE slug = ?').run(now(), slug)
  },

  getActive() {
    return db().prepare(
      `SELECT id, slug, name, title, pillar, description, icon, archetype,
       onboarding_answers_json as onboardingAnswersJson
       FROM employees WHERE active = 1 ORDER BY pillar, name`
    ).all()
  },
}

// ============================================================
// HANDOFFS
// ============================================================

export const handoffs = {
  create(params: { id: string; fromEmployee: string; toEmployee: string; reason: string; context: string; priority: string }): void {
    db().prepare(
      'INSERT INTO handoffs (id, from_employee, to_employee, reason, context, priority, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(params.id, params.fromEmployee, params.toEmployee, params.reason, params.context, params.priority, 'pending', now())
  },

  get(id: string) {
    return db().prepare(
      `SELECT id, from_employee as fromEmployee, to_employee as toEmployee, reason, context, priority, status, created_at as createdAt, completed_at as completedAt
       FROM handoffs WHERE id = ?`
    ).get(id) as { id: string; fromEmployee: string; toEmployee: string; reason: string; context: string; priority: string; status: string; createdAt: string; completedAt: string | null } | undefined
  },

  listPendingForEmployee(toEmployee: string) {
    return db().prepare(
      `SELECT id, from_employee as fromEmployee, to_employee as toEmployee, reason, context, priority, status, created_at as createdAt, completed_at as completedAt
       FROM handoffs WHERE to_employee = ? AND status = 'pending' ORDER BY
         CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`
    ).all(toEmployee) as { id: string; fromEmployee: string; toEmployee: string; reason: string; context: string; priority: string; status: string; createdAt: string; completedAt: string | null }[]
  },

  updateStatus(id: string, status: string): void {
    const completedAt = status === 'completed' ? now() : null
    db().prepare(
      'UPDATE handoffs SET status = ?, completed_at = ? WHERE id = ?'
    ).run(status, completedAt, id)
  },

  clear(): void {
    db().prepare('DELETE FROM handoffs').run()
  },
}

// ============================================================
// EVOLUTION EVENTS
// ============================================================

export const evolutionEvents = {
  record(params: { type: string; description: string; before?: string; after?: string; impact?: string }): void {
    db().prepare(
      'INSERT INTO evolution_events (id, type, description, before_value, after_value, impact, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(uuid(), params.type, params.description, params.before ?? null, params.after ?? null, params.impact ?? null, now())
  },

  recent(limit = 20): { id: string; type: string; description: string; beforeValue: string | null; afterValue: string | null; impact: string | null; createdAt: string }[] {
    return db().prepare(
      `SELECT id, type, description, before_value as beforeValue, after_value as afterValue, impact, created_at as createdAt
       FROM evolution_events ORDER BY created_at DESC LIMIT ?`
    ).all(limit) as { id: string; type: string; description: string; beforeValue: string | null; afterValue: string | null; impact: string | null; createdAt: string }[]
  },

  countByType(): Record<string, number> {
    const rows = db().prepare(
      'SELECT type, COUNT(*) as count FROM evolution_events GROUP BY type'
    ).all() as { type: string; count: number }[]

    const result: Record<string, number> = {}
    for (const row of rows) {
      result[row.type] = row.count
    }
    return result
  },
}
