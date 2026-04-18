import { db, uuid, now } from './helpers.js'

export interface GoalRecord {
  id: string
  title: string
  description: string | null
  category: string
  metricName: string
  metricUnit: string
  targetValue: number
  currentValue: number
  status: string
  priority: string
  deadline: string | null
  owner: string | null
  createdAt: string
  updatedAt: string
}

export interface GoalAgentRecord {
  id: string
  goalId: string
  employeeSlug: string
  role: string
  contributionWeight: number
  createdAt: string
}

export interface GoalUpdateRecord {
  id: number
  goalId: string
  previousValue: number
  newValue: number
  delta: number
  source: string
  employeeSlug: string | null
  note: string | null
  createdAt: string
}

export interface CreateGoalParams {
  title: string
  description?: string
  category?: string
  metricName: string
  metricUnit?: string
  targetValue: number
  priority?: string
  deadline?: string
  owner?: string
}

const GOAL_FIELDS = `
  id, title, description, category,
  metric_name as metricName, metric_unit as metricUnit,
  target_value as targetValue, current_value as currentValue,
  status, priority, deadline, owner,
  created_at as createdAt, updated_at as updatedAt
`

const AGENT_FIELDS = `
  id, goal_id as goalId, employee_slug as employeeSlug,
  role, contribution_weight as contributionWeight,
  created_at as createdAt
`

export const goals = {
  create(params: CreateGoalParams): GoalRecord {
    const id = uuid()
    const ts = now()
    db().prepare(
      `INSERT INTO goals (id, title, description, category, metric_name, metric_unit, target_value, current_value, status, priority, deadline, owner, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'active', ?, ?, ?, ?, ?)`
    ).run(id, params.title, params.description ?? null, params.category ?? 'general', params.metricName, params.metricUnit ?? 'count', params.targetValue, params.priority ?? 'medium', params.deadline ?? null, params.owner ?? null, ts, ts)
    return goals.get(id)!
  },

  get(id: string): GoalRecord | undefined {
    return db().prepare(`SELECT ${GOAL_FIELDS} FROM goals WHERE id = ?`).get(id) as GoalRecord | undefined
  },

  list(filters?: { status?: string; category?: string; limit?: number }): GoalRecord[] {
    const conditions: string[] = []
    const params: unknown[] = []
    if (filters?.status) { conditions.push('status = ?'); params.push(filters.status) }
    if (filters?.category) { conditions.push('category = ?'); params.push(filters.category) }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const limit = filters?.limit ?? 50
    return db().prepare(
      `SELECT ${GOAL_FIELDS} FROM goals ${where} ORDER BY
         CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         created_at DESC LIMIT ?`
    ).all(...params, limit) as GoalRecord[]
  },

  updateProgress(id: string, newValue: number, source: string, employeeSlug?: string, note?: string): void {
    const goal = goals.get(id)
    if (!goal) return
    const ts = now()
    const delta = newValue - goal.currentValue
    db().prepare(
      `INSERT INTO goal_updates (goal_id, previous_value, new_value, delta, source, employee_slug, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, goal.currentValue, newValue, delta, source, employeeSlug ?? null, note ?? null, ts)
    db().prepare('UPDATE goals SET current_value = ?, updated_at = ? WHERE id = ?').run(newValue, ts, id)
    if (newValue >= goal.targetValue) {
      db().prepare("UPDATE goals SET status = 'completed', updated_at = ? WHERE id = ? AND status = 'active'").run(ts, id)
    }
  },

  incrementProgress(id: string, delta: number, source: string, employeeSlug?: string, note?: string): void {
    const goal = goals.get(id)
    if (!goal) return
    goals.updateProgress(id, goal.currentValue + delta, source, employeeSlug, note)
  },

  updateStatus(id: string, status: string): void {
    db().prepare('UPDATE goals SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), id)
  },

  delete(id: string): void {
    db().prepare('DELETE FROM goal_agents WHERE goal_id = ?').run(id)
    db().prepare('DELETE FROM goal_updates WHERE goal_id = ?').run(id)
    db().prepare('DELETE FROM goals WHERE id = ?').run(id)
  },

  assignAgent(goalId: string, employeeSlug: string, role?: string, weight?: number): void {
    const id = uuid()
    db().prepare(
      `INSERT INTO goal_agents (id, goal_id, employee_slug, role, contribution_weight, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(goal_id, employee_slug) DO UPDATE SET role = excluded.role, contribution_weight = excluded.contribution_weight`
    ).run(id, goalId, employeeSlug, role ?? 'contributor', weight ?? 1.0, now())
  },

  removeAgent(goalId: string, employeeSlug: string): void {
    db().prepare('DELETE FROM goal_agents WHERE goal_id = ? AND employee_slug = ?').run(goalId, employeeSlug)
  },

  getAgents(goalId: string): GoalAgentRecord[] {
    return db().prepare(`SELECT ${AGENT_FIELDS} FROM goal_agents WHERE goal_id = ?`).all(goalId) as GoalAgentRecord[]
  },

  getGoalsForEmployee(employeeSlug: string): GoalRecord[] {
    return db().prepare(
      `SELECT ${GOAL_FIELDS} FROM goals g
       JOIN goal_agents ga ON ga.goal_id = g.id
       WHERE ga.employee_slug = ? AND g.status = 'active'
       ORDER BY g.priority, g.created_at`
    ).all(employeeSlug) as GoalRecord[]
  },

  getUpdates(goalId: string, limit = 20): GoalUpdateRecord[] {
    return db().prepare(
      `SELECT id, goal_id as goalId, previous_value as previousValue, new_value as newValue,
       delta, source, employee_slug as employeeSlug, note, created_at as createdAt
       FROM goal_updates WHERE goal_id = ? ORDER BY created_at DESC LIMIT ?`
    ).all(goalId, limit) as GoalUpdateRecord[]
  },

  getStats(): { total: number; active: number; completed: number; byCategory: Array<{ category: string; count: number }> } {
    const total = (db().prepare('SELECT COUNT(*) as count FROM goals').get() as { count: number }).count
    const active = (db().prepare("SELECT COUNT(*) as count FROM goals WHERE status = 'active'").get() as { count: number }).count
    const completed = (db().prepare("SELECT COUNT(*) as count FROM goals WHERE status = 'completed'").get() as { count: number }).count
    const byCategory = db().prepare('SELECT category, COUNT(*) as count FROM goals GROUP BY category ORDER BY count DESC').all() as Array<{ category: string; count: number }>
    return { total, active, completed, byCategory }
  },
}
