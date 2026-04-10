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
// CHANNEL LINKS
// ============================================================

export const channelLinks = {
  upsert(params: {
    conversationId: string
    channel: string
    channelId: string
    metadata?: unknown
  }): void {
    db().prepare(
      `INSERT INTO channel_links (conversation_id, channel, channel_id, metadata_json, linked_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(channel, channel_id) DO UPDATE SET
         conversation_id = excluded.conversation_id,
         metadata_json = excluded.metadata_json,
         linked_at = excluded.linked_at`
    ).run(
      params.conversationId,
      params.channel,
      params.channelId,
      JSON.stringify(params.metadata ?? {}),
      now()
    )
  },

  findConversation(channel: string, channelId: string): string | undefined {
    const row = db().prepare(
      'SELECT conversation_id as conversationId FROM channel_links WHERE channel = ? AND channel_id = ?'
    ).get(channel, channelId) as { conversationId: string } | undefined

    return row?.conversationId
  },

  listByConversation(conversationId: string) {
    return db().prepare(
      `SELECT conversation_id as conversationId, channel, channel_id as channelId,
       metadata_json as metadataJson, linked_at as linkedAt
       FROM channel_links WHERE conversation_id = ? ORDER BY linked_at ASC`
    ).all(conversationId) as {
      conversationId: string
      channel: string
      channelId: string
      metadataJson: string | null
      linkedAt: string
    }[]
  },
}

// ============================================================
// MEMORIES
// ============================================================

function sanitizeFtsQuery(query: string): string {
  // Remove FTS5 special operators and wrap each word in quotes
  return query
    .replace(/[*"{}()^~<>:]/g, '') // Strip FTS5 special chars
    .split(/\s+/)
    .filter(w => w.length > 0)
    .map(w => `"${w}"`)  // Quote each term for literal matching
    .join(' ')
}

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
    ).all(sanitizeFtsQuery(query), limit)
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

// ============================================================
// ACTIVITY EVENTS (v2 control plane)
// ============================================================

export const activityEvents = {
  emit(params: {
    eventType: string
    actorType: string
    actorId: string
    summary: string
    targetType?: string
    targetId?: string
    detail?: unknown
    conversationId?: string
    jobId?: string
    costUsd?: number
  }): number {
    const result = db().prepare(
      `INSERT INTO activity_events (event_type, actor_type, actor_id, target_type, target_id, summary, detail_json, conversation_id, job_id, cost_usd, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      params.eventType, params.actorType, params.actorId,
      params.targetType ?? null, params.targetId ?? null,
      params.summary, params.detail ? JSON.stringify(params.detail) : null,
      params.conversationId ?? null, params.jobId ?? null,
      params.costUsd ?? 0, now()
    )
    return Number(result.lastInsertRowid)
  },

  list(params: { limit?: number; offset?: number; eventType?: string; actorId?: string; targetType?: string; targetId?: string; since?: string } = {}) {
    const { limit = 50, offset = 0, eventType, actorId, targetType, targetId, since } = params
    const where: string[] = []
    const values: unknown[] = []

    if (eventType) { where.push('event_type = ?'); values.push(eventType) }
    if (actorId) { where.push('actor_id = ?'); values.push(actorId) }
    if (targetType) { where.push('target_type = ?'); values.push(targetType) }
    if (targetId) { where.push('target_id = ?'); values.push(targetId) }
    if (since) { where.push('created_at >= ?'); values.push(since) }

    const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
    values.push(limit, offset)

    return db().prepare(
      `SELECT id, event_type as eventType, actor_type as actorType, actor_id as actorId,
       target_type as targetType, target_id as targetId, summary, detail_json as detailJson,
       conversation_id as conversationId, job_id as jobId, cost_usd as costUsd,
       created_at as createdAt
       FROM activity_events ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...values) as {
      id: number; eventType: string; actorType: string; actorId: string
      targetType: string | null; targetId: string | null; summary: string
      detailJson: string | null; conversationId: string | null; jobId: string | null
      costUsd: number; createdAt: string
    }[]
  },

  countSince(since: string): number {
    const row = db().prepare('SELECT COUNT(*) as count FROM activity_events WHERE created_at >= ?').get(since) as { count: number }
    return row.count
  },
}

// ============================================================
// APPROVALS (v2 control plane)
// ============================================================

export const approvals = {
  create(params: {
    requestedBy: string
    action: string
    toolName?: string
    toolInput?: unknown
    context?: string
    priority?: string
    expiresAt?: string
  }): { id: string } {
    const id = uuid()
    db().prepare(
      `INSERT INTO approvals (id, requested_by, action, tool_name, tool_input_json, context, priority, status, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
    ).run(id, params.requestedBy, params.action, params.toolName ?? null,
      params.toolInput ? JSON.stringify(params.toolInput) : null,
      params.context ?? null, params.priority ?? 'medium', params.expiresAt ?? null, now())
    return { id }
  },

  get(id: string) {
    return db().prepare(
      `SELECT id, requested_by as requestedBy, action, tool_name as toolName,
       tool_input_json as toolInputJson, context, priority, status,
       decided_by as decidedBy, decided_at as decidedAt, expires_at as expiresAt,
       created_at as createdAt
       FROM approvals WHERE id = ?`
    ).get(id) as {
      id: string; requestedBy: string; action: string; toolName: string | null
      toolInputJson: string | null; context: string | null; priority: string; status: string
      decidedBy: string | null; decidedAt: string | null; expiresAt: string | null; createdAt: string
    } | undefined
  },

  listPending(limit = 50) {
    return db().prepare(
      `SELECT id, requested_by as requestedBy, action, tool_name as toolName, context, priority, status,
       expires_at as expiresAt, created_at as createdAt
       FROM approvals WHERE status = 'pending' ORDER BY
       CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       created_at ASC LIMIT ?`
    ).all(limit) as {
      id: string; requestedBy: string; action: string; toolName: string | null
      context: string | null; priority: string; status: string
      expiresAt: string | null; createdAt: string
    }[]
  },

  decide(id: string, status: 'approved' | 'rejected', decidedBy: string): void {
    db().prepare(
      'UPDATE approvals SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?'
    ).run(status, decidedBy, now(), id)
  },

  countPending(): number {
    const row = db().prepare("SELECT COUNT(*) as count FROM approvals WHERE status = 'pending'").get() as { count: number }
    return row.count
  },

  listByEmployee(employeeSlug: string, limit = 20) {
    return db().prepare(
      `SELECT id, requested_by as requestedBy, action, tool_name as toolName, context, priority, status,
       decided_by as decidedBy, decided_at as decidedAt, expires_at as expiresAt, created_at as createdAt
       FROM approvals WHERE requested_by = ? ORDER BY
       CASE status WHEN 'pending' THEN 0 ELSE 1 END,
       CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       created_at DESC LIMIT ?`
    ).all(employeeSlug, limit) as {
      id: string; requestedBy: string; action: string; toolName: string | null
      context: string | null; priority: string; status: string
      decidedBy: string | null; decidedAt: string | null
      expiresAt: string | null; createdAt: string
    }[]
  },
}

// ============================================================
// MONITORS (v2 control plane)
// ============================================================

export const monitors = {
  create(params: {
    name: string
    description?: string
    employeeId?: string
    sourceType: string
    sourceConfig: unknown
    checkSchedule: string
    thresholds?: unknown
  }): { id: string } {
    const id = uuid()
    db().prepare(
      `INSERT INTO monitors (id, name, description, employee_id, source_type, source_config_json, check_schedule, thresholds_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, params.name, params.description ?? null, params.employeeId ?? null,
      params.sourceType, JSON.stringify(params.sourceConfig), params.checkSchedule,
      params.thresholds ? JSON.stringify(params.thresholds) : null, now())
    return { id }
  },

  get(id: string) {
    return db().prepare(
      `SELECT id, name, description, employee_id as employeeId, source_type as sourceType,
       source_config_json as sourceConfigJson, check_schedule as checkSchedule,
       thresholds_json as thresholdsJson, last_checked_at as lastCheckedAt,
       last_value as lastValue, last_status as lastStatus, enabled,
       created_at as createdAt
       FROM monitors WHERE id = ?`
    ).get(id) as {
      id: string; name: string; description: string | null; employeeId: string | null
      sourceType: string; sourceConfigJson: string; checkSchedule: string
      thresholdsJson: string | null; lastCheckedAt: string | null
      lastValue: string | null; lastStatus: string; enabled: number; createdAt: string
    } | undefined
  },

  list() {
    return db().prepare(
      `SELECT id, name, description, employee_id as employeeId, source_type as sourceType,
       last_status as lastStatus, last_checked_at as lastCheckedAt, enabled,
       created_at as createdAt
       FROM monitors ORDER BY name`
    ).all() as {
      id: string; name: string; description: string | null; employeeId: string | null
      sourceType: string; lastStatus: string; lastCheckedAt: string | null
      enabled: number; createdAt: string
    }[]
  },

  updateCheck(id: string, value: string, status: string): void {
    db().prepare(
      'UPDATE monitors SET last_value = ?, last_status = ?, last_checked_at = ? WHERE id = ?'
    ).run(value, status, now(), id)
  },

  toggle(id: string, enabled: boolean): void {
    db().prepare('UPDATE monitors SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id)
  },
}

// ============================================================
// MONITOR ALERTS (v2 control plane)
// ============================================================

export const monitorAlerts = {
  create(params: { monitorId: string; severity: string; message: string; value?: string }): number {
    const result = db().prepare(
      'INSERT INTO monitor_alerts (monitor_id, severity, message, value, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(params.monitorId, params.severity, params.message, params.value ?? null, now())
    return Number(result.lastInsertRowid)
  },

  listByMonitor(monitorId: string, limit = 50) {
    return db().prepare(
      `SELECT id, monitor_id as monitorId, severity, message, value, acknowledged,
       acknowledged_by as acknowledgedBy, created_at as createdAt
       FROM monitor_alerts WHERE monitor_id = ? ORDER BY created_at DESC LIMIT ?`
    ).all(monitorId, limit) as {
      id: number; monitorId: string; severity: string; message: string
      value: string | null; acknowledged: number; acknowledgedBy: string | null; createdAt: string
    }[]
  },

  listRecent(limit = 50) {
    return db().prepare(
      `SELECT ma.id, ma.monitor_id as monitorId, m.name as monitorName, ma.severity, ma.message,
       ma.value, ma.acknowledged, ma.created_at as createdAt
       FROM monitor_alerts ma
       JOIN monitors m ON ma.monitor_id = m.id
       ORDER BY ma.created_at DESC LIMIT ?`
    ).all(limit) as {
      id: number; monitorId: string; monitorName: string; severity: string; message: string
      value: string | null; acknowledged: number; createdAt: string
    }[]
  },

  acknowledge(id: number, by: string): void {
    db().prepare('UPDATE monitor_alerts SET acknowledged = 1, acknowledged_by = ? WHERE id = ?').run(by, id)
  },

  countUnacknowledged(): number {
    const row = db().prepare('SELECT COUNT(*) as count FROM monitor_alerts WHERE acknowledged = 0').get() as { count: number }
    return row.count
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
    ).run(id, params.title, params.description ?? null, params.emoji ?? '⚡', params.urgency ?? 'normal', today, now())
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
// JOB EVALS (Karpathy eval loop — structured agent performance metrics)
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
