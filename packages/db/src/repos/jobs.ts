import { db, uuid, now } from './helpers.js'

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
    const ALLOWED_COLUMNS = new Set([
      'container_name', 'pr_url', 'pr_number', 'agent_model',
      'total_cost_usd', 'total_tool_calls', 'total_iterations',
      'error', 'completed_at',
    ])

    const sets = ['status = ?', 'updated_at = ?']
    const values: unknown[] = [status, now()]

    if (extra) {
      for (const [key, value] of Object.entries(extra)) {
        const col = key.replace(/([A-Z])/g, '_$1').toLowerCase()
        if (!ALLOWED_COLUMNS.has(col)) {
          throw new Error(`jobs.updateStatus: column "${col}" is not in the allowed list`)
        }
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
// WORKER SESSIONS
// ============================================================

export const workerSessions = {
  create(params: {
    id?: string
    jobId?: string
    name: string
    workerType?: string
    runtime?: string
    status?: string
    repoUrl?: string
    branch?: string
    containerName?: string
    conversationId?: string
    entrypoint?: string
    latestSummary?: string
    metadata?: unknown
    startedAt?: string
    completedAt?: string
  }): { id: string } {
    const id = params.id ?? uuid()
    const ts = now()
    db().prepare(
      `INSERT INTO worker_sessions (
        id, job_id, name, worker_type, runtime, status, repo_url, branch, container_name,
        conversation_id, entrypoint, latest_summary, metadata_json, last_seen_at,
        started_at, completed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      params.jobId ?? null,
      params.name,
      params.workerType ?? 'claude_code',
      params.runtime ?? 'pending',
      params.status ?? 'queued',
      params.repoUrl ?? null,
      params.branch ?? null,
      params.containerName ?? null,
      params.conversationId ?? null,
      params.entrypoint ?? null,
      params.latestSummary ?? null,
      JSON.stringify(params.metadata ?? {}),
      ts,
      params.startedAt ?? null,
      params.completedAt ?? null,
      ts,
      ts
    )
    return { id }
  },

  get(id: string) {
    return db().prepare(
      `SELECT id, job_id as jobId, name, worker_type as workerType, runtime, status,
       repo_url as repoUrl, branch, container_name as containerName,
       conversation_id as conversationId, entrypoint, latest_summary as latestSummary,
       metadata_json as metadataJson, last_seen_at as lastSeenAt,
       started_at as startedAt, completed_at as completedAt,
       created_at as createdAt, updated_at as updatedAt
       FROM worker_sessions WHERE id = ?`
    ).get(id) as {
      id: string
      jobId: string | null
      name: string
      workerType: string
      runtime: string
      status: string
      repoUrl: string | null
      branch: string | null
      containerName: string | null
      conversationId: string | null
      entrypoint: string | null
      latestSummary: string | null
      metadataJson: string | null
      lastSeenAt: string | null
      startedAt: string | null
      completedAt: string | null
      createdAt: string
      updatedAt: string
    } | undefined
  },

  findByJob(jobId: string) {
    return db().prepare(
      `SELECT id, job_id as jobId, name, worker_type as workerType, runtime, status,
       repo_url as repoUrl, branch, container_name as containerName,
       conversation_id as conversationId, entrypoint, latest_summary as latestSummary,
       metadata_json as metadataJson, last_seen_at as lastSeenAt,
       started_at as startedAt, completed_at as completedAt,
       created_at as createdAt, updated_at as updatedAt
       FROM worker_sessions WHERE job_id = ?`
    ).get(jobId) as {
      id: string
      jobId: string | null
      name: string
      workerType: string
      runtime: string
      status: string
      repoUrl: string | null
      branch: string | null
      containerName: string | null
      conversationId: string | null
      entrypoint: string | null
      latestSummary: string | null
      metadataJson: string | null
      lastSeenAt: string | null
      startedAt: string | null
      completedAt: string | null
      createdAt: string
      updatedAt: string
    } | undefined
  },

  list(limit = 50) {
    return db().prepare(
      `SELECT id, job_id as jobId, name, worker_type as workerType, runtime, status,
       repo_url as repoUrl, branch, container_name as containerName,
       conversation_id as conversationId, entrypoint, latest_summary as latestSummary,
       metadata_json as metadataJson, last_seen_at as lastSeenAt,
       started_at as startedAt, completed_at as completedAt,
       created_at as createdAt, updated_at as updatedAt
       FROM worker_sessions ORDER BY updated_at DESC LIMIT ?`
    ).all(limit) as {
      id: string
      jobId: string | null
      name: string
      workerType: string
      runtime: string
      status: string
      repoUrl: string | null
      branch: string | null
      containerName: string | null
      conversationId: string | null
      entrypoint: string | null
      latestSummary: string | null
      metadataJson: string | null
      lastSeenAt: string | null
      startedAt: string | null
      completedAt: string | null
      createdAt: string
      updatedAt: string
    }[]
  },

  update(id: string, params: {
    name?: string
    runtime?: string
    status?: string
    repoUrl?: string | null
    branch?: string | null
    containerName?: string | null
    conversationId?: string | null
    entrypoint?: string | null
    latestSummary?: string | null
    metadata?: unknown
    lastSeenAt?: string | null
    startedAt?: string | null
    completedAt?: string | null
  }): void {
    const columnMap: Record<string, string> = {
      name: 'name',
      runtime: 'runtime',
      status: 'status',
      repoUrl: 'repo_url',
      branch: 'branch',
      containerName: 'container_name',
      conversationId: 'conversation_id',
      entrypoint: 'entrypoint',
      latestSummary: 'latest_summary',
      metadata: 'metadata_json',
      lastSeenAt: 'last_seen_at',
      startedAt: 'started_at',
      completedAt: 'completed_at',
    }

    const sets: string[] = []
    const values: unknown[] = []

    for (const [key, value] of Object.entries(params)) {
      const column = columnMap[key]
      if (!column) continue
      sets.push(`${column} = ?`)
      values.push(key === 'metadata' ? JSON.stringify(value ?? {}) : value ?? null)
    }

    if (sets.length === 0) return

    sets.push('updated_at = ?')
    values.push(now())
    values.push(id)

    db().prepare(`UPDATE worker_sessions SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  },

  requestAction(id: string, action: string, requestedBy = 'operator'): void {
    const current = workerSessions.get(id)
    const metadata = current?.metadataJson ? JSON.parse(current.metadataJson) as Record<string, unknown> : {}
    const control = (metadata.control && typeof metadata.control === 'object')
      ? metadata.control as Record<string, unknown>
      : {}

    workerSessions.update(id, {
      metadata: {
        ...metadata,
        control: {
          ...control,
          requestedAction: action,
          requestedBy,
          requestedAt: now(),
        },
      },
      lastSeenAt: now(),
    })
  },

  clearRequestedAction(id: string): void {
    const current = workerSessions.get(id)
    const metadata = current?.metadataJson ? JSON.parse(current.metadataJson) as Record<string, unknown> : {}
    if (!metadata.control || typeof metadata.control !== 'object') {
      return
    }

    const control = { ...(metadata.control as Record<string, unknown>) }
    delete control.requestedAction
    delete control.requestedBy
    delete control.requestedAt

    workerSessions.update(id, {
      metadata: {
        ...metadata,
        control,
      },
      lastSeenAt: now(),
    })
  },
}

// ============================================================
// JOB EVALS (Karpathy eval loop -- structured agent performance metrics)
// ============================================================

export const jobEvals = {
  record(params: {
    jobId: string
    status: 'pending' | 'passed' | 'failed' | 'partial'
    testsPassed?: number
    testsFailed?: number
    testsSkipped?: number
    fixCyclesUsed?: number
    maxFixCycles?: number
    lintErrors?: number
    typeErrors?: number
    filesChanged?: number
    linesAdded?: number
    linesRemoved?: number
    totalCostUsd?: number
    totalInputTokens?: number
    totalOutputTokens?: number
    totalToolCalls?: number
    totalIterations?: number
    durationMs?: number
    codingDurationMs?: number
    testingDurationMs?: number
    language?: string
    repoUrl?: string
    agentModel?: string
    stopReason?: string
    details?: unknown
  }): number {
    const result = db().prepare(
      `INSERT INTO job_evals (
        job_id, status, tests_passed, tests_failed, tests_skipped,
        fix_cycles_used, max_fix_cycles, lint_errors, type_errors,
        files_changed, lines_added, lines_removed,
        total_cost_usd, total_input_tokens, total_output_tokens,
        total_tool_calls, total_iterations, duration_ms,
        coding_duration_ms, testing_duration_ms,
        language, repo_url, agent_model, stop_reason, details_json,
        evaluated_at, created_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?
      )`
    ).run(
      params.jobId, params.status,
      params.testsPassed ?? 0, params.testsFailed ?? 0, params.testsSkipped ?? 0,
      params.fixCyclesUsed ?? 0, params.maxFixCycles ?? 3,
      params.lintErrors ?? 0, params.typeErrors ?? 0,
      params.filesChanged ?? 0, params.linesAdded ?? 0, params.linesRemoved ?? 0,
      params.totalCostUsd ?? 0, params.totalInputTokens ?? 0, params.totalOutputTokens ?? 0,
      params.totalToolCalls ?? 0, params.totalIterations ?? 0, params.durationMs ?? 0,
      params.codingDurationMs ?? 0, params.testingDurationMs ?? 0,
      params.language ?? null, params.repoUrl ?? null, params.agentModel ?? null,
      params.stopReason ?? null,
      params.details ? JSON.stringify(params.details) : null,
      now(), now()
    )
    return Number(result.lastInsertRowid)
  },

  getByJob(jobId: string) {
    return db().prepare(
      `SELECT * FROM job_evals WHERE job_id = ? ORDER BY evaluated_at DESC LIMIT 1`
    ).get(jobId) as Record<string, unknown> | undefined
  },

  successRate(params: { days?: number; language?: string; model?: string } = {}) {
    const { days = 30, language, model } = params
    const since = new Date(Date.now() - days * 86_400_000).toISOString()
    const where = ["status != 'pending'", 'evaluated_at >= ?']
    const values: unknown[] = [since]

    if (language) { where.push('language = ?'); values.push(language) }
    if (model) { where.push('agent_model = ?'); values.push(model) }

    const clause = where.join(' AND ')

    return db().prepare(
      `SELECT
        COUNT(*) as totalJobs,
        SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END) as partial,
        ROUND(100.0 * SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) / MAX(COUNT(*), 1), 1) as successRatePct,
        ROUND(AVG(total_cost_usd), 4) as avgCostUsd,
        ROUND(AVG(duration_ms) / 1000.0, 1) as avgDurationSec,
        ROUND(AVG(total_tool_calls), 0) as avgToolCalls,
        ROUND(AVG(fix_cycles_used), 1) as avgFixCycles
      FROM job_evals WHERE ${clause}`
    ).get(...values) as {
      totalJobs: number; passed: number; failed: number; partial: number
      successRatePct: number; avgCostUsd: number; avgDurationSec: number
      avgToolCalls: number; avgFixCycles: number
    }
  },

  trend(params: { days?: number; bucketDays?: number } = {}) {
    const { days = 90, bucketDays = 7 } = params
    const since = new Date(Date.now() - days * 86_400_000).toISOString()

    return db().prepare(
      `SELECT
        DATE(evaluated_at, 'start of day', '-' || ((CAST(strftime('%j', evaluated_at) AS INTEGER) - 1) % ?) || ' days') as bucket,
        COUNT(*) as totalJobs,
        SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) as passed,
        ROUND(100.0 * SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) / MAX(COUNT(*), 1), 1) as successRatePct,
        ROUND(AVG(total_cost_usd), 4) as avgCostUsd,
        ROUND(AVG(duration_ms) / 1000.0, 1) as avgDurationSec
      FROM job_evals
      WHERE status != 'pending' AND evaluated_at >= ?
      GROUP BY bucket
      ORDER BY bucket ASC`
    ).all(bucketDays, since) as {
      bucket: string; totalJobs: number; passed: number
      successRatePct: number; avgCostUsd: number; avgDurationSec: number
    }[]
  },

  recent(limit = 20) {
    return db().prepare(
      `SELECT je.*, j.title as jobTitle
       FROM job_evals je
       LEFT JOIN jobs j ON je.job_id = j.id
       WHERE je.status != 'pending'
       ORDER BY je.evaluated_at DESC LIMIT ?`
    ).all(limit) as (Record<string, unknown> & { jobTitle: string | null })[]
  },

  updatePrOutcome(jobId: string, params: { prMerged: boolean; prReviewComments?: number; prTimeToMergeMs?: number }): void {
    db().prepare(
      'UPDATE job_evals SET pr_merged = ?, pr_review_comments = ?, pr_time_to_merge_ms = ? WHERE job_id = ?'
    ).run(params.prMerged ? 1 : 0, params.prReviewComments ?? 0, params.prTimeToMergeMs ?? null, jobId)
  },
}
