import { db, uuid, now } from './helpers.js'

// ============================================================
// ROUTINES (v2 control plane)
// ============================================================

export const routines = {
  create(params: {
    employeeId: string
    name: string
    description?: string
    schedule: string
    task: string
    tools?: string[]
    outputChannel?: string
    timeoutSeconds?: number
  }): { id: string } {
    const id = uuid()
    db().prepare(
      `INSERT INTO routines (id, employee_id, name, description, schedule, task, tools_json, output_channel, timeout_seconds, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, params.employeeId, params.name, params.description ?? null,
      params.schedule, params.task, JSON.stringify(params.tools ?? []),
      params.outputChannel ?? 'web', params.timeoutSeconds ?? 300, now())
    return { id }
  },

  listByEmployee(employeeId: string) {
    return db().prepare(
      `SELECT id, employee_id as employeeId, name, description, schedule, task,
       tools_json as toolsJson, output_channel as outputChannel,
       timeout_seconds as timeoutSeconds, enabled, last_run_at as lastRunAt,
       next_run_at as nextRunAt, run_count as runCount, last_status as lastStatus,
       created_at as createdAt
       FROM routines WHERE employee_id = ? ORDER BY name`
    ).all(employeeId) as {
      id: string; employeeId: string; name: string; description: string | null
      schedule: string; task: string; toolsJson: string; outputChannel: string
      timeoutSeconds: number; enabled: number; lastRunAt: string | null
      nextRunAt: string | null; runCount: number; lastStatus: string | null; createdAt: string
    }[]
  },

  listEnabled() {
    return db().prepare(
      `SELECT id, employee_id as employeeId, name, schedule, task,
       tools_json as toolsJson, timeout_seconds as timeoutSeconds,
       next_run_at as nextRunAt
       FROM routines WHERE enabled = 1 ORDER BY next_run_at ASC`
    ).all() as {
      id: string; employeeId: string; name: string; schedule: string; task: string
      toolsJson: string; timeoutSeconds: number; nextRunAt: string | null
    }[]
  },

  recordRun(id: string, status: string, nextRunAt?: string): void {
    db().prepare(
      'UPDATE routines SET last_run_at = ?, last_status = ?, run_count = run_count + 1, next_run_at = ? WHERE id = ?'
    ).run(now(), status, nextRunAt ?? null, id)
  },

  toggle(id: string, enabled: boolean): void {
    db().prepare('UPDATE routines SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id)
  },
}

// ============================================================
// DAILY PRIORITIES
// ============================================================

export const priorities = {
  create(params: { title: string; description?: string; emoji?: string; urgency?: string }): { id: string } {
    const id = uuid()
    const today = new Date().toISOString().slice(0, 10)
    db().prepare(
      'INSERT INTO daily_priorities (id, title, description, emoji, urgency, date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, params.title, params.description ?? null, params.emoji ?? '\u26A1', params.urgency ?? 'normal', today, now())
    return { id }
  },

  listToday() {
    const today = new Date().toISOString().slice(0, 10)
    return db().prepare(
      `SELECT id, title, description, emoji, urgency, completed, date, created_at as createdAt
       FROM daily_priorities WHERE date = ? ORDER BY
       CASE urgency WHEN 'urgent' THEN 0 WHEN 'important' THEN 1 ELSE 2 END,
       created_at ASC`
    ).all(today) as { id: string; title: string; description: string | null; emoji: string; urgency: string; completed: number; date: string; createdAt: string }[]
  },

  complete(id: string): void {
    db().prepare('UPDATE daily_priorities SET completed = 1 WHERE id = ?').run(id)
  },

  uncomplete(id: string): void {
    db().prepare('UPDATE daily_priorities SET completed = 0 WHERE id = ?').run(id)
  },

  delete(id: string): void {
    db().prepare('DELETE FROM daily_priorities WHERE id = ?').run(id)
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
// KPI DEFINITIONS (v2 control plane)
// ============================================================

export const kpiDefinitions = {
  create(params: {
    employeeId: string
    name: string
    description?: string
    source: unknown
    target: number
    unit?: string
    frequency?: string
    direction?: string
    thresholds: { green: number; yellow: number; red: number }
  }): { id: string } {
    const id = uuid()
    db().prepare(
      `INSERT INTO kpi_definitions (id, employee_id, name, description, source_json, target, unit, frequency, direction, thresholds_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, params.employeeId, params.name, params.description ?? null,
      JSON.stringify(params.source), params.target, params.unit ?? 'count',
      params.frequency ?? 'weekly', params.direction ?? 'higher_is_better',
      JSON.stringify(params.thresholds), now())
    return { id }
  },

  listByEmployee(employeeId: string) {
    return db().prepare(
      `SELECT id, employee_id as employeeId, name, description, source_json as sourceJson,
       target, unit, frequency, direction, thresholds_json as thresholdsJson,
       created_at as createdAt
       FROM kpi_definitions WHERE employee_id = ? ORDER BY name`
    ).all(employeeId) as {
      id: string; employeeId: string; name: string; description: string | null
      sourceJson: string; target: number; unit: string; frequency: string
      direction: string; thresholdsJson: string; createdAt: string
    }[]
  },

  get(id: string) {
    return db().prepare(
      `SELECT id, employee_id as employeeId, name, description, source_json as sourceJson,
       target, unit, frequency, direction, thresholds_json as thresholdsJson,
       created_at as createdAt
       FROM kpi_definitions WHERE id = ?`
    ).get(id) as {
      id: string; employeeId: string; name: string; description: string | null
      sourceJson: string; target: number; unit: string; frequency: string
      direction: string; thresholdsJson: string; createdAt: string
    } | undefined
  },

  delete(id: string): void {
    db().prepare('DELETE FROM kpi_definitions WHERE id = ?').run(id)
  },
}

// ============================================================
// KPI MEASUREMENTS (v2 control plane)
// ============================================================

export const kpiMeasurements = {
  record(params: { kpiId: string; employeeId: string; value: number; status: string; source?: string }): number {
    const result = db().prepare(
      'INSERT INTO kpi_measurements (kpi_id, employee_id, value, status, measured_at, source) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(params.kpiId, params.employeeId, params.value, params.status, now(), params.source ?? null)
    return Number(result.lastInsertRowid)
  },

  latest(kpiId: string) {
    return db().prepare(
      `SELECT id, kpi_id as kpiId, employee_id as employeeId, value, status,
       measured_at as measuredAt, source
       FROM kpi_measurements WHERE kpi_id = ? ORDER BY measured_at DESC LIMIT 1`
    ).get(kpiId) as {
      id: number; kpiId: string; employeeId: string; value: number; status: string
      measuredAt: string; source: string | null
    } | undefined
  },

  history(kpiId: string, limit = 30) {
    return db().prepare(
      `SELECT id, value, status, measured_at as measuredAt
       FROM kpi_measurements WHERE kpi_id = ? ORDER BY measured_at DESC LIMIT ?`
    ).all(kpiId, limit) as { id: number; value: number; status: string; measuredAt: string }[]
  },

  latestByEmployee(employeeId: string) {
    return db().prepare(
      `SELECT km.kpi_id as kpiId, kd.name, km.value, km.status, km.measured_at as measuredAt
       FROM kpi_measurements km
       JOIN kpi_definitions kd ON km.kpi_id = kd.id
       WHERE km.employee_id = ? AND km.id IN (
         SELECT MAX(id) FROM kpi_measurements GROUP BY kpi_id
       )
       ORDER BY kd.name`
    ).all(employeeId) as { kpiId: string; name: string; value: number; status: string; measuredAt: string }[]
  },
}
