import type Database from 'better-sqlite3'
import { getDb } from './sqlite.js'

function db(): Database.Database {
  return getDb()
}

function uuid(): string {
  return crypto.randomUUID()
}

function now(): string {
  return new Date().toISOString()
}

// ============================================================
// CONVERSATIONS
// ============================================================

export const conversations = {
  create(title?: string): { id: string; title?: string; createdAt: string; updatedAt: string } {
    const id = uuid()
    const ts = now()
    db().prepare('INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, title ?? null, ts, ts)
    return { id, title, createdAt: ts, updatedAt: ts }
  },

  get(id: string) {
    return db().prepare('SELECT id, title, created_at as createdAt, updated_at as updatedAt FROM conversations WHERE id = ?').get(id) as { id: string; title?: string; createdAt: string; updatedAt: string } | undefined
  },

  list(limit = 50) {
    return db().prepare('SELECT id, title, created_at as createdAt, updated_at as updatedAt FROM conversations ORDER BY updated_at DESC LIMIT ?').all(limit) as { id: string; title?: string; createdAt: string; updatedAt: string }[]
  },

  updateTitle(id: string, title: string): void {
    db().prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?').run(title, now(), id)
  },
}

// ============================================================
// MESSAGES
// ============================================================

export const messages = {
  create(params: { conversationId: string; role: string; content: string; model?: string; inputTokens?: number; outputTokens?: number }): { id: string } {
    const id = uuid()
    db().prepare(
      'INSERT INTO messages (id, conversation_id, role, content, model, input_tokens, output_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, params.conversationId, params.role, params.content, params.model ?? null, params.inputTokens ?? 0, params.outputTokens ?? 0, now())
    return { id }
  },

  listByConversation(conversationId: string, limit = 100) {
    return db().prepare(
      'SELECT id, conversation_id as conversationId, role, content, model, input_tokens as inputTokens, output_tokens as outputTokens, created_at as createdAt FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?'
    ).all(conversationId, limit) as { id: string; conversationId: string; role: string; content: string; model?: string; inputTokens: number; outputTokens: number; createdAt: string }[]
  },
}

// ============================================================
// TOOL CALLS
// ============================================================

export const toolCalls = {
  create(params: { messageId: string; conversationId: string; toolName: string; input: unknown; success: boolean; result?: unknown; display?: string; durationMs?: number }): void {
    db().prepare(
      'INSERT INTO tool_calls (id, message_id, conversation_id, tool_name, input_json, success, result_json, display, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(uuid(), params.messageId, params.conversationId, params.toolName, JSON.stringify(params.input), params.success ? 1 : 0, params.result ? JSON.stringify(params.result) : null, params.display ?? null, params.durationMs ?? 0, now())
  },

  listByConversation(conversationId: string) {
    return db().prepare('SELECT * FROM tool_calls WHERE conversation_id = ? ORDER BY created_at ASC').all(conversationId)
  },
}

// ============================================================
// JOBS
// ============================================================

export const jobs = {
  create(params: { title: string; description: string; repoUrl: string; branch: string; baseBranch?: string; agentModel?: string }) {
    const id = uuid()
    const ts = now()
    db().prepare(
      'INSERT INTO jobs (id, title, description, status, repo_url, branch, base_branch, agent_model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, params.title, params.description, 'queued', params.repoUrl, params.branch, params.baseBranch ?? 'main', params.agentModel ?? 'claude-sonnet-4-20250514', ts, ts)
    return { id }
  },

  get(id: string) {
    return db().prepare(
      `SELECT id, title, description, status, repo_url as repoUrl, branch, base_branch as baseBranch,
       container_name as containerName, pr_url as prUrl, pr_number as prNumber, agent_model as agentModel,
       total_cost_usd as totalCost, total_tool_calls as totalToolCalls, total_iterations as totalIterations,
       error, created_at as createdAt, updated_at as updatedAt, completed_at as completedAt
       FROM jobs WHERE id = ?`
    ).get(id)
  },

  list(limit = 50) {
    return db().prepare(
      `SELECT id, title, status, repo_url as repoUrl, branch, pr_url as prUrl, total_cost_usd as totalCost,
       created_at as createdAt, completed_at as completedAt
       FROM jobs ORDER BY created_at DESC LIMIT ?`
    ).all(limit)
  },

  updateStatus(id: string, status: string, extra?: Record<string, unknown>): void {
    const sets = ['status = ?', 'updated_at = ?']
    const values: unknown[] = [status, now()]

    if (extra) {
      for (const [key, value] of Object.entries(extra)) {
        const col = key.replace(/([A-Z])/g, '_$1').toLowerCase()
        sets.push(`${col} = ?`)
        values.push(value)
      }
    }

    values.push(id)
    db().prepare(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  },
}

// ============================================================
// JOB LOGS
// ============================================================

export const jobLogs = {
  add(jobId: string, level: string, message: string, data?: unknown): void {
    db().prepare(
      'INSERT INTO job_logs (job_id, level, message, data_json, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(jobId, level, message, data ? JSON.stringify(data) : null, now())
  },

  listByJob(jobId: string, limit = 200) {
    return db().prepare('SELECT * FROM job_logs WHERE job_id = ? ORDER BY created_at ASC LIMIT ?').all(jobId, limit)
  },
}

// ============================================================
// MEMORIES
// ============================================================

export const memories = {
  create(params: { type: string; content: string; tags: string[]; source: string; confidence?: number }): { id: string } {
    const id = uuid()
    const ts = now()
    db().prepare(
      'INSERT INTO memories (id, type, content, tags_json, source, confidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, params.type, params.content, JSON.stringify(params.tags), params.source, params.confidence ?? 0.5, ts, ts)
    return { id }
  },

  search(query: string, limit = 10) {
    return db().prepare(
      `SELECT m.id, m.type, m.content, m.tags_json as tagsJson, m.source, m.confidence,
       m.access_count as accessCount, m.created_at as createdAt
       FROM memories m
       JOIN memories_fts fts ON m.rowid = fts.rowid
       WHERE memories_fts MATCH ?
       ORDER BY rank
       LIMIT ?`
    ).all(query, limit)
  },

  getAll(limit = 100) {
    return db().prepare(
      `SELECT id, type, content, tags_json as tagsJson, source, confidence,
       access_count as accessCount, created_at as createdAt
       FROM memories ORDER BY confidence DESC, updated_at DESC LIMIT ?`
    ).all(limit)
  },

  reinforce(id: string): void {
    db().prepare(
      'UPDATE memories SET confidence = MIN(confidence + 0.1, 1.0), access_count = access_count + 1, last_accessed_at = ?, updated_at = ? WHERE id = ?'
    ).run(now(), now(), id)
  },

  decay(id: string): void {
    db().prepare(
      'UPDATE memories SET confidence = MAX(confidence - 0.1, 0.0), updated_at = ? WHERE id = ?'
    ).run(now(), id)
  },

  delete(id: string): void {
    db().prepare('DELETE FROM memories WHERE id = ?').run(id)
  },

  prune(minConfidence = 0.1): number {
    const result = db().prepare('DELETE FROM memories WHERE confidence < ?').run(minConfidence)
    return result.changes
  },
}

// ============================================================
// SKILLS
// ============================================================

export const skills = {
  upsert(params: { id?: string; name: string; description: string; systemPrompt: string; tools: string[]; examples?: unknown[]; source?: string }): { id: string } {
    const id = params.id ?? uuid()
    const ts = now()
    db().prepare(
      `INSERT INTO skills (id, name, description, system_prompt, tools_json, examples_json, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET
         description = excluded.description,
         system_prompt = excluded.system_prompt,
         tools_json = excluded.tools_json,
         examples_json = excluded.examples_json,
         version = version + 1,
         updated_at = excluded.updated_at`
    ).run(id, params.name, params.description, params.systemPrompt, JSON.stringify(params.tools), JSON.stringify(params.examples ?? []), params.source ?? 'builtin', ts, ts)
    return { id }
  },

  get(name: string) {
    return db().prepare('SELECT * FROM skills WHERE name = ?').get(name)
  },

  list() {
    return db().prepare('SELECT id, name, description, version, success_rate as successRate, total_uses as totalUses, source FROM skills ORDER BY total_uses DESC').all()
  },

  recordUse(name: string, success: boolean): void {
    const skill = db().prepare('SELECT success_rate, total_uses FROM skills WHERE name = ?').get(name) as { success_rate: number; total_uses: number } | undefined
    if (!skill) return

    const newTotal = skill.total_uses + 1
    const newRate = ((skill.success_rate * skill.total_uses) + (success ? 1 : 0)) / newTotal

    db().prepare('UPDATE skills SET success_rate = ?, total_uses = ?, updated_at = ? WHERE name = ?').run(newRate, newTotal, now(), name)
  },
}

// ============================================================
// COST ENTRIES
// ============================================================

export const costEntries = {
  record(params: { model: string; inputTokens: number; outputTokens: number; inputCostUsd: number; outputCostUsd: number; totalCostUsd: number; jobId?: string; conversationId?: string }): void {
    db().prepare(
      'INSERT INTO cost_entries (model, input_tokens, output_tokens, input_cost_usd, output_cost_usd, total_cost_usd, job_id, conversation_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(params.model, params.inputTokens, params.outputTokens, params.inputCostUsd, params.outputCostUsd, params.totalCostUsd, params.jobId ?? null, params.conversationId ?? null, now())
  },

  summary(days = 30) {
    const since = new Date(Date.now() - days * 86400000).toISOString()
    const rows = db().prepare(
      `SELECT model, SUM(input_tokens) as inputTokens, SUM(output_tokens) as outputTokens,
       SUM(total_cost_usd) as totalUsd, DATE(created_at) as day
       FROM cost_entries WHERE created_at >= ? GROUP BY model, day ORDER BY day DESC`
    ).all(since) as { model: string; inputTokens: number; outputTokens: number; totalUsd: number; day: string }[]

    const byModel: Record<string, number> = {}
    const byDay: Record<string, number> = {}
    let totalUsd = 0
    let totalInput = 0
    let totalOutput = 0

    for (const row of rows) {
      byModel[row.model] = (byModel[row.model] ?? 0) + row.totalUsd
      byDay[row.day] = (byDay[row.day] ?? 0) + row.totalUsd
      totalUsd += row.totalUsd
      totalInput += row.inputTokens
      totalOutput += row.outputTokens
    }

    return { totalUsd, byModel, byDay, tokenCount: { input: totalInput, output: totalOutput } }
  },
}

// ============================================================
// EMPLOYEES
// ============================================================

export const employees = {
  upsert(params: { slug: string; name: string; title: string; pillar: string; description: string; icon?: string; active?: boolean; archetype?: string; onboardingAnswers?: Record<string, string> }): { id: string } {
    const id = uuid()
    const ts = now()
    db().prepare(
      `INSERT INTO employees (id, slug, name, title, pillar, description, icon, active, archetype, onboarding_answers_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(slug) DO UPDATE SET
         active = excluded.active,
         archetype = excluded.archetype,
         onboarding_answers_json = excluded.onboarding_answers_json,
         updated_at = excluded.updated_at`
    ).run(id, params.slug, params.name, params.title, params.pillar, params.description, params.icon ?? '', params.active ? 1 : 0, params.archetype ?? null, JSON.stringify(params.onboardingAnswers ?? {}), ts, ts)
    return { id }
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
// NOTIFICATIONS
// ============================================================

export const notifications = {
  create(params: { title: string; message: string; type?: string; employeeSlug?: string }): { id: string } {
    const id = uuid()
    db().prepare(
      'INSERT INTO notifications (id, title, message, type, employee_slug, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, params.title, params.message, params.type ?? 'info', params.employeeSlug ?? null, now())
    return { id }
  },

  list(limit = 50) {
    return db().prepare(
      `SELECT id, title, message, type, read, employee_slug as employeeSlug, created_at as createdAt
       FROM notifications ORDER BY created_at DESC LIMIT ?`
    ).all(limit) as { id: string; title: string; message: string; type: string; read: number; employeeSlug: string | null; createdAt: string }[]
  },

  markRead(id: string): void {
    db().prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(id)
  },

  markAllRead(): void {
    db().prepare('UPDATE notifications SET read = 1 WHERE read = 0').run()
  },

  unreadCount(): number {
    const row = db().prepare('SELECT COUNT(*) as count FROM notifications WHERE read = 0').get() as { count: number }
    return row.count
  },
}

// ============================================================
// XP EVENTS
// ============================================================

export const xpEvents = {
  record(params: { action: string; xp: number; employeeId?: string }): { id: string } {
    const id = uuid()
    db().prepare(
      'INSERT INTO xp_events (id, action, xp, employee_id, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, params.action, params.xp, params.employeeId ?? null, now())
    return { id }
  },

  total(): number {
    const row = db().prepare('SELECT COALESCE(SUM(xp), 0) as total FROM xp_events').get() as { total: number }
    return row.total
  },

  recent(limit = 20) {
    return db().prepare(
      `SELECT id, action, xp, employee_id as employeeId, created_at as createdAt
       FROM xp_events ORDER BY created_at DESC LIMIT ?`
    ).all(limit) as { id: string; action: string; xp: number; employeeId: string | null; createdAt: string }[]
  },
}

// ============================================================
// STREAKS
// ============================================================

export const streaks = {
  get(id: string) {
    return db().prepare(
      `SELECT id, name, current_streak as currentStreak, longest_streak as longestStreak,
       last_checked_in as lastCheckedIn, employee_id as employeeId
       FROM streaks WHERE id = ?`
    ).get(id) as { id: string; name: string; currentStreak: number; longestStreak: number; lastCheckedIn: string; employeeId: string } | undefined
  },

  upsert(params: { id: string; name: string; currentStreak: number; longestStreak: number; lastCheckedIn: string; employeeId: string }): void {
    db().prepare(
      `INSERT INTO streaks (id, name, current_streak, longest_streak, last_checked_in, employee_id)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         current_streak = excluded.current_streak,
         longest_streak = excluded.longest_streak,
         last_checked_in = excluded.last_checked_in`
    ).run(params.id, params.name, params.currentStreak, params.longestStreak, params.lastCheckedIn, params.employeeId)
  },

  list(employeeId?: string) {
    if (employeeId) {
      return db().prepare(
        `SELECT id, name, current_streak as currentStreak, longest_streak as longestStreak,
         last_checked_in as lastCheckedIn, employee_id as employeeId
         FROM streaks WHERE employee_id = ? ORDER BY name`
      ).all(employeeId) as { id: string; name: string; currentStreak: number; longestStreak: number; lastCheckedIn: string; employeeId: string }[]
    }
    return db().prepare(
      `SELECT id, name, current_streak as currentStreak, longest_streak as longestStreak,
       last_checked_in as lastCheckedIn, employee_id as employeeId
       FROM streaks ORDER BY name`
    ).all() as { id: string; name: string; currentStreak: number; longestStreak: number; lastCheckedIn: string; employeeId: string }[]
  },
}

// ============================================================
// ACHIEVEMENTS
// ============================================================

export const achievements = {
  unlock(id: string, name: string): void {
    db().prepare(
      `INSERT OR IGNORE INTO achievements (id, name, unlocked_at) VALUES (?, ?, ?)`
    ).run(id, name, now())
  },

  list() {
    return db().prepare(
      `SELECT id, name, unlocked_at as unlockedAt FROM achievements ORDER BY unlocked_at DESC`
    ).all() as { id: string; name: string; unlockedAt: string }[]
  },

  isUnlocked(id: string): boolean {
    const row = db().prepare('SELECT id FROM achievements WHERE id = ?').get(id)
    return !!row
  },
}

// ============================================================
// WORKFLOW RUNS
// ============================================================

export const workflowRuns = {
  create(params: { id: string; workflowId: string }): void {
    db().prepare(
      'INSERT INTO workflow_runs (id, workflow_id, status, step_results_json, total_cost, started_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(params.id, params.workflowId, 'running', '{}', 0, now())
  },

  get(id: string) {
    return db().prepare(
      `SELECT id, workflow_id as workflowId, status, step_results_json as stepResultsJson,
       total_cost as totalCost, started_at as startedAt, completed_at as completedAt
       FROM workflow_runs WHERE id = ?`
    ).get(id) as { id: string; workflowId: string; status: string; stepResultsJson: string; totalCost: number; startedAt: string; completedAt: string | null } | undefined
  },

  update(id: string, params: { status?: string; stepResultsJson?: string; totalCost?: number; completedAt?: string }): void {
    const sets: string[] = []
    const values: unknown[] = []

    if (params.status !== undefined) {
      sets.push('status = ?')
      values.push(params.status)
    }
    if (params.stepResultsJson !== undefined) {
      sets.push('step_results_json = ?')
      values.push(params.stepResultsJson)
    }
    if (params.totalCost !== undefined) {
      sets.push('total_cost = ?')
      values.push(params.totalCost)
    }
    if (params.completedAt !== undefined) {
      sets.push('completed_at = ?')
      values.push(params.completedAt)
    }

    if (sets.length === 0) return

    values.push(id)
    db().prepare(`UPDATE workflow_runs SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  },

  list(limit = 50) {
    return db().prepare(
      `SELECT id, workflow_id as workflowId, status, step_results_json as stepResultsJson,
       total_cost as totalCost, started_at as startedAt, completed_at as completedAt
       FROM workflow_runs ORDER BY started_at DESC LIMIT ?`
    ).all(limit) as { id: string; workflowId: string; status: string; stepResultsJson: string; totalCost: number; startedAt: string; completedAt: string | null }[]
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

// ============================================================
// USER PROFILE
// ============================================================

export const userProfile = {
  get() {
    return db().prepare(
      `SELECT id, total_xp as totalXp, level, created_at as createdAt
       FROM user_profile WHERE id = 'default'`
    ).get() as { id: string; totalXp: number; level: number; createdAt: string } | undefined
  },

  update(params: { totalXp: number; level: number }): void {
    db().prepare(
      `INSERT INTO user_profile (id, total_xp, level, created_at)
       VALUES ('default', ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         total_xp = excluded.total_xp,
         level = excluded.level`
    ).run(params.totalXp, params.level, now())
  },
}
