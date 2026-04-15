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
  updated_at as updatedAt
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
}
