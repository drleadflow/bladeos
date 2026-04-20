import { db, uuid, now } from './helpers.js'

// ============================================================
// MISSIONS — Task queue for the command center
// ============================================================

export interface MissionRecord {
  id: string
  title: string
  description: string | null
  priority: string
  status: string
  assignedEmployee: string | null
  createdBy: string
  result: string | null
  resultSummary: string | null
  costUsd: number
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  questions: string | null
  questionAskedAt: string | null
  userResponse: string | null
  retryCount: number
}

export interface CreateMissionParams {
  title: string
  description?: string
  priority?: string
  createdBy?: string
  assignedEmployee?: string
}

const SELECT_FIELDS = `
  id, title, description, priority, status,
  assigned_employee as assignedEmployee,
  created_by as createdBy,
  result, result_summary as resultSummary,
  cost_usd as costUsd,
  started_at as startedAt,
  completed_at as completedAt,
  created_at as createdAt,
  updated_at as updatedAt,
  questions, question_asked_at as questionAskedAt,
  user_response as userResponse,
  retry_count as retryCount
`

export const missions = {
  create(params: CreateMissionParams): MissionRecord {
    const id = uuid()
    const ts = now()
    db().prepare(
      `INSERT INTO missions (id, title, description, priority, assigned_employee, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      params.title,
      params.description ?? null,
      params.priority ?? 'medium',
      params.assignedEmployee ?? null,
      params.createdBy ?? 'user',
      ts,
      ts
    )
    return missions.get(id)!
  },

  get(id: string): MissionRecord | undefined {
    return db().prepare(`SELECT ${SELECT_FIELDS} FROM missions WHERE id = ?`).get(id) as MissionRecord | undefined
  },

  list(filters?: { status?: string; employeeId?: string; limit?: number }): MissionRecord[] {
    const conditions: string[] = []
    const params: unknown[] = []

    if (filters?.status) {
      conditions.push('status = ?')
      params.push(filters.status)
    }
    if (filters?.employeeId) {
      conditions.push('assigned_employee = ?')
      params.push(filters.employeeId)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const limit = filters?.limit ?? 100

    return db().prepare(
      `SELECT ${SELECT_FIELDS} FROM missions ${where} ORDER BY
         CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         created_at DESC
       LIMIT ?`
    ).all(...params, limit) as MissionRecord[]
  },

  assign(id: string, employeeSlug: string): void {
    db().prepare(
      'UPDATE missions SET assigned_employee = ?, updated_at = ? WHERE id = ?'
    ).run(employeeSlug, now(), id)
  },

  start(id: string): void {
    const ts = now()
    db().prepare(
      "UPDATE missions SET status = 'live', started_at = ?, updated_at = ? WHERE id = ?"
    ).run(ts, ts, id)
  },

  complete(id: string, result: string, summary?: string, costUsd?: number): void {
    const ts = now()
    db().prepare(
      "UPDATE missions SET status = 'done', result = ?, result_summary = ?, cost_usd = ?, completed_at = ?, updated_at = ? WHERE id = ?"
    ).run(result, summary ?? null, costUsd ?? 0, ts, ts, id)
  },

  fail(id: string, reason: string): void {
    const ts = now()
    db().prepare(
      "UPDATE missions SET status = 'failed', result = ?, completed_at = ?, updated_at = ? WHERE id = ?"
    ).run(reason, ts, ts, id)
  },

  updateStatus(id: string, status: string): void {
    db().prepare(
      'UPDATE missions SET status = ?, updated_at = ? WHERE id = ?'
    ).run(status, now(), id)
  },

  delete(id: string): void {
    db().prepare('DELETE FROM missions WHERE id = ?').run(id)
  },

  countByStatus(): { status: string; count: number }[] {
    return db().prepare(
      'SELECT status, COUNT(*) as count FROM missions GROUP BY status'
    ).all() as { status: string; count: number }[]
  },

  countByEmployee(): { assignedEmployee: string; count: number }[] {
    return db().prepare(
      `SELECT assigned_employee as assignedEmployee, COUNT(*) as count
       FROM missions WHERE assigned_employee IS NOT NULL
       GROUP BY assigned_employee ORDER BY count DESC`
    ).all() as { assignedEmployee: string; count: number }[]
  },

  getActiveForEmployee(employeeSlug: string): MissionRecord[] {
    return db().prepare(
      `SELECT ${SELECT_FIELDS} FROM missions
       WHERE assigned_employee = ? AND status IN ('queued', 'live')
       ORDER BY priority, created_at`
    ).all(employeeSlug) as MissionRecord[]
  },

  getNextQueued(busyEmployees: string[]): MissionRecord | undefined {
    const placeholders = busyEmployees.length > 0
      ? busyEmployees.map(() => '?').join(',')
      : "'__none__'"
    const excludeClause = busyEmployees.length > 0
      ? `AND assigned_employee NOT IN (${placeholders})`
      : ''
    return db().prepare(
      `SELECT ${SELECT_FIELDS} FROM missions
       WHERE status = 'queued' AND assigned_employee IS NOT NULL ${excludeClause}
       ORDER BY
         CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         created_at ASC
       LIMIT 1`
    ).get(...busyEmployees) as MissionRecord | undefined
  },

  setAwaitingInput(id: string, question: string): void {
    const ts = now()
    db().prepare(
      `UPDATE missions SET status = 'awaiting_input', questions = ?, question_asked_at = ?, updated_at = ? WHERE id = ?`
    ).run(question, ts, ts, id)
  },

  submitResponse(id: string, response: string): void {
    db().prepare(
      `UPDATE missions SET status = 'live', user_response = ?, questions = NULL, question_asked_at = NULL, updated_at = ? WHERE id = ?`
    ).run(response, now(), id)
  },

  setPendingReview(id: string, result: string, summary: string, costUsd: number): void {
    const ts = now()
    db().prepare(
      `UPDATE missions SET status = 'pending_review', result = ?, result_summary = ?, cost_usd = ?, completed_at = ?, updated_at = ? WHERE id = ?`
    ).run(result, summary, costUsd, ts, ts, id)
  },

  approve(id: string): void {
    db().prepare(
      `UPDATE missions SET status = 'done', updated_at = ? WHERE id = ?`
    ).run(now(), id)
  },

  reject(id: string, reason: string): void {
    db().prepare(
      `UPDATE missions SET status = 'rejected', result = ?, updated_at = ? WHERE id = ?`
    ).run(reason, now(), id)
  },

  incrementRetry(id: string): number {
    db().prepare(
      `UPDATE missions SET retry_count = retry_count + 1, status = 'queued', updated_at = ? WHERE id = ?`
    ).run(now(), id)
    const row = missions.get(id)
    return row?.retryCount ?? 0
  },

  getAwaitingInput(): MissionRecord[] {
    return db().prepare(
      `SELECT ${SELECT_FIELDS} FROM missions WHERE status = 'awaiting_input' ORDER BY question_asked_at ASC`
    ).all() as MissionRecord[]
  },

  resetStaleLive(olderThanMs: number): number {
    const cutoff = new Date(Date.now() - olderThanMs).toISOString()
    const result = db().prepare(
      `UPDATE missions SET status = 'queued', updated_at = ? WHERE status = 'live' AND started_at < ?`
    ).run(now(), cutoff)
    return result.changes
  },
}
