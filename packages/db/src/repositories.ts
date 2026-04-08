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
