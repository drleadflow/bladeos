import { db, uuid, now } from './helpers.js'

// ============================================================
// ROUTING — Q-Learning routing table and episode log
// ============================================================

export interface QValueRecord {
  id: string
  taskType: string
  employeeSlug: string
  qValue: number
  visitCount: number
  lastReward: number | null
  lastUpdatedAt: string
  createdAt: string
}

export interface RoutingEpisode {
  id: string
  taskType: string
  taskDescription: string
  selectedEmployee: string
  selectionMethod: string
  reward: number | null
  outcomeStatus: string | null
  outcomeCostUsd: number | null
  outcomeDurationMs: number | null
  missionId: string | null
  createdAt: string
  resolvedAt: string | null
}

export interface CreateEpisodeParams {
  taskType: string
  taskDescription: string
  selectedEmployee: string
  selectionMethod: string
  missionId?: string
}

const Q_FIELDS = `
  id, task_type as taskType, employee_slug as employeeSlug,
  q_value as qValue, visit_count as visitCount,
  last_reward as lastReward,
  last_updated_at as lastUpdatedAt, created_at as createdAt
`

const EPISODE_FIELDS = `
  id, task_type as taskType, task_description as taskDescription,
  selected_employee as selectedEmployee, selection_method as selectionMethod,
  reward, outcome_status as outcomeStatus,
  outcome_cost_usd as outcomeCostUsd, outcome_duration_ms as outcomeDurationMs,
  mission_id as missionId, created_at as createdAt, resolved_at as resolvedAt
`

export const routing = {
  getQValue(taskType: string, employeeSlug: string): QValueRecord | undefined {
    return db().prepare(
      `SELECT ${Q_FIELDS} FROM q_routing_table WHERE task_type = ? AND employee_slug = ?`
    ).get(taskType, employeeSlug) as QValueRecord | undefined
  },

  getAllQValues(taskType: string): QValueRecord[] {
    return db().prepare(
      `SELECT ${Q_FIELDS} FROM q_routing_table WHERE task_type = ? ORDER BY q_value DESC`
    ).all(taskType) as QValueRecord[]
  },

  upsertQValue(taskType: string, employeeSlug: string, qValue: number, reward: number | null): void {
    const ts = now()
    const existing = routing.getQValue(taskType, employeeSlug)
    if (existing) {
      db().prepare(
        `UPDATE q_routing_table
         SET q_value = ?, visit_count = visit_count + 1, last_reward = ?, last_updated_at = ?
         WHERE task_type = ? AND employee_slug = ?`
      ).run(qValue, reward, ts, taskType, employeeSlug)
    } else {
      db().prepare(
        `INSERT INTO q_routing_table (id, task_type, employee_slug, q_value, visit_count, last_reward, last_updated_at, created_at)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?)`
      ).run(uuid(), taskType, employeeSlug, qValue, reward, ts, ts)
    }
  },

  createEpisode(params: CreateEpisodeParams): RoutingEpisode {
    const id = uuid()
    const ts = now()
    db().prepare(
      `INSERT INTO routing_episodes (id, task_type, task_description, selected_employee, selection_method, mission_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, params.taskType, params.taskDescription, params.selectedEmployee, params.selectionMethod, params.missionId ?? null, ts)
    return routing.getEpisode(id)!
  },

  getEpisode(id: string): RoutingEpisode | undefined {
    return db().prepare(
      `SELECT ${EPISODE_FIELDS} FROM routing_episodes WHERE id = ?`
    ).get(id) as RoutingEpisode | undefined
  },

  resolveEpisode(episodeId: string, reward: number, outcomeStatus: string, costUsd: number, durationMs: number): void {
    db().prepare(
      `UPDATE routing_episodes
       SET reward = ?, outcome_status = ?, outcome_cost_usd = ?, outcome_duration_ms = ?, resolved_at = ?
       WHERE id = ?`
    ).run(reward, outcomeStatus, costUsd, durationMs, now(), episodeId)
  },

  getUnresolvedEpisodes(limit = 50): RoutingEpisode[] {
    return db().prepare(
      `SELECT ${EPISODE_FIELDS} FROM routing_episodes
       WHERE resolved_at IS NULL ORDER BY created_at ASC LIMIT ?`
    ).all(limit) as RoutingEpisode[]
  },

  getEpisodeByMission(missionId: string): RoutingEpisode | undefined {
    return db().prepare(
      `SELECT ${EPISODE_FIELDS} FROM routing_episodes WHERE mission_id = ? LIMIT 1`
    ).get(missionId) as RoutingEpisode | undefined
  },

  getTaskTypeStats(): { taskType: string; totalVisits: number }[] {
    return db().prepare(
      `SELECT task_type as taskType, SUM(visit_count) as totalVisits
       FROM q_routing_table GROUP BY task_type`
    ).all() as { taskType: string; totalVisits: number }[]
  },
}
