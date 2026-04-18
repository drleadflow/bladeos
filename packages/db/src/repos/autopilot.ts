import { db, uuid, now } from './helpers.js'

// ============================================================
// AUTOPILOT — Batch job runner with stall detection & budgets
// ============================================================

export interface BatchRunRecord {
  id: string
  name: string
  status: string
  totalJobs: number
  completedJobs: number
  failedJobs: number
  totalCostUsd: number
  maxConcurrent: number
  maxCostUsd: number | null
  stallTimeoutMs: number
  createdAt: string
  completedAt: string | null
  createdBy: string | null
}

export interface BatchJobEntry {
  id: string
  batchRunId: string
  jobId: string | null
  missionId: string | null
  title: string
  description: string
  status: string
  priority: number
  assignedEmployee: string | null
  costUsd: number
  startedAt: string | null
  completedAt: string | null
  error: string | null
  retryCount: number
  maxRetries: number
  lastActivityAt: string | null
  createdAt: string
}

export interface CreateBatchParams {
  name: string
  maxConcurrent?: number
  maxCostUsd?: number
  stallTimeoutMs?: number
  createdBy?: string
}

export interface AddBatchJobParams {
  batchRunId: string
  title: string
  description: string
  priority?: number
  assignedEmployee?: string
  maxRetries?: number
}

const BATCH_FIELDS = `
  id, name, status,
  total_jobs as totalJobs,
  completed_jobs as completedJobs,
  failed_jobs as failedJobs,
  total_cost_usd as totalCostUsd,
  max_concurrent as maxConcurrent,
  max_cost_usd as maxCostUsd,
  stall_timeout_ms as stallTimeoutMs,
  created_at as createdAt,
  completed_at as completedAt,
  created_by as createdBy
`

const JOB_FIELDS = `
  id,
  batch_run_id as batchRunId,
  job_id as jobId,
  mission_id as missionId,
  title, description, status, priority,
  assigned_employee as assignedEmployee,
  cost_usd as costUsd,
  started_at as startedAt,
  completed_at as completedAt,
  error,
  retry_count as retryCount,
  max_retries as maxRetries,
  last_activity_at as lastActivityAt,
  created_at as createdAt
`

export const autopilot = {
  // ---- Batch runs ----

  createBatch(params: CreateBatchParams): BatchRunRecord {
    const id = uuid()
    const ts = now()
    db().prepare(
      `INSERT INTO batch_runs (id, name, status, max_concurrent, max_cost_usd, stall_timeout_ms, created_at, created_by)
       VALUES (?, ?, 'running', ?, ?, ?, ?, ?)`
    ).run(
      id,
      params.name,
      params.maxConcurrent ?? 2,
      params.maxCostUsd ?? null,
      params.stallTimeoutMs ?? 300_000,
      ts,
      params.createdBy ?? null
    )
    return autopilot.getBatch(id)!
  },

  getBatch(id: string): BatchRunRecord | undefined {
    return db().prepare(
      `SELECT ${BATCH_FIELDS} FROM batch_runs WHERE id = ?`
    ).get(id) as BatchRunRecord | undefined
  },

  listBatches(filters?: { status?: string; limit?: number }): BatchRunRecord[] {
    const conditions: string[] = []
    const params: unknown[] = []

    if (filters?.status) {
      conditions.push('status = ?')
      params.push(filters.status)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const limit = filters?.limit ?? 50

    return db().prepare(
      `SELECT ${BATCH_FIELDS} FROM batch_runs ${where} ORDER BY created_at DESC LIMIT ?`
    ).all(...params, limit) as BatchRunRecord[]
  },

  updateBatchStatus(id: string, status: string): void {
    const ts = now()
    const isTerminal = ['completed', 'cancelled', 'budget_exceeded'].includes(status)
    if (isTerminal) {
      db().prepare(
        'UPDATE batch_runs SET status = ?, completed_at = COALESCE(completed_at, ?) WHERE id = ?'
      ).run(status, ts, id)
    } else {
      db().prepare('UPDATE batch_runs SET status = ? WHERE id = ?').run(status, id)
    }
  },

  incrementCompleted(batchId: string, costUsd: number): void {
    db().prepare(
      `UPDATE batch_runs
       SET completed_jobs = completed_jobs + 1,
           total_cost_usd = total_cost_usd + ?
       WHERE id = ?`
    ).run(costUsd, batchId)
  },

  incrementFailed(batchId: string): void {
    db().prepare(
      'UPDATE batch_runs SET failed_jobs = failed_jobs + 1 WHERE id = ?'
    ).run(batchId)
  },

  // ---- Batch job entries ----

  addJob(params: AddBatchJobParams): BatchJobEntry {
    const id = uuid()
    const ts = now()
    db().prepare(
      `INSERT INTO batch_job_entries
         (id, batch_run_id, title, description, priority, assigned_employee, max_retries, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      params.batchRunId,
      params.title,
      params.description,
      params.priority ?? 5,
      params.assignedEmployee ?? null,
      params.maxRetries ?? 2,
      ts
    )
    // Increment total_jobs on the batch run
    db().prepare(
      'UPDATE batch_runs SET total_jobs = total_jobs + 1 WHERE id = ?'
    ).run(params.batchRunId)

    return autopilot.getJob(id)!
  },

  getJob(id: string): BatchJobEntry | undefined {
    return db().prepare(
      `SELECT ${JOB_FIELDS} FROM batch_job_entries WHERE id = ?`
    ).get(id) as BatchJobEntry | undefined
  },

  listJobs(batchRunId: string, status?: string): BatchJobEntry[] {
    if (status) {
      return db().prepare(
        `SELECT ${JOB_FIELDS} FROM batch_job_entries
         WHERE batch_run_id = ? AND status = ?
         ORDER BY priority ASC, created_at ASC`
      ).all(batchRunId, status) as BatchJobEntry[]
    }
    return db().prepare(
      `SELECT ${JOB_FIELDS} FROM batch_job_entries
       WHERE batch_run_id = ?
       ORDER BY priority ASC, created_at ASC`
    ).all(batchRunId) as BatchJobEntry[]
  },

  startJob(id: string): void {
    const ts = now()
    db().prepare(
      `UPDATE batch_job_entries
       SET status = 'running', started_at = ?, last_activity_at = ?
       WHERE id = ?`
    ).run(ts, ts, id)
  },

  completeJob(id: string, costUsd: number): void {
    const ts = now()
    db().prepare(
      `UPDATE batch_job_entries
       SET status = 'completed', completed_at = ?, cost_usd = ?
       WHERE id = ?`
    ).run(ts, costUsd, id)
  },

  failJob(id: string, error: string): void {
    const ts = now()
    db().prepare(
      `UPDATE batch_job_entries
       SET status = 'failed', completed_at = ?, error = ?
       WHERE id = ?`
    ).run(ts, error, id)
  },

  updateActivity(id: string): void {
    db().prepare(
      'UPDATE batch_job_entries SET last_activity_at = ? WHERE id = ?'
    ).run(now(), id)
  },

  getStalled(stallTimeoutMs: number): BatchJobEntry[] {
    const cutoff = new Date(Date.now() - stallTimeoutMs).toISOString()
    return db().prepare(
      `SELECT ${JOB_FIELDS} FROM batch_job_entries
       WHERE status = 'running'
         AND last_activity_at IS NOT NULL
         AND last_activity_at < ?
       ORDER BY last_activity_at ASC`
    ).all(cutoff) as BatchJobEntry[]
  },

  retryJob(id: string): void {
    db().prepare(
      `UPDATE batch_job_entries
       SET status = 'queued',
           retry_count = retry_count + 1,
           started_at = NULL,
           last_activity_at = NULL,
           error = NULL
       WHERE id = ?`
    ).run(id)
  },

  getNextQueued(batchRunId: string): BatchJobEntry | undefined {
    return db().prepare(
      `SELECT ${JOB_FIELDS} FROM batch_job_entries
       WHERE batch_run_id = ? AND status = 'queued'
       ORDER BY priority ASC, created_at ASC
       LIMIT 1`
    ).get(batchRunId) as BatchJobEntry | undefined
  },
}
