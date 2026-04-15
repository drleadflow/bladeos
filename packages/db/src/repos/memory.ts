import { db, uuid, now, sanitizeFtsQuery } from './helpers.js'

// ============================================================
// MEMORIES
// ============================================================

export interface CreateMemoryParams {
  type: string
  content: string
  tags: string[]
  source: string
  confidence?: number
  importance?: string
  employeeId?: string
  scope?: string
  pinned?: boolean
}

export const memories = {
  create(params: CreateMemoryParams): { id: string } {
    const id = uuid()
    const ts = now()
    db().prepare(
      `INSERT INTO memories (id, type, content, tags_json, source, confidence, importance, employee_id, scope, pinned, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      params.type,
      params.content,
      JSON.stringify(params.tags),
      params.source,
      params.confidence ?? 0.5,
      params.importance ?? 'medium',
      params.employeeId ?? null,
      params.scope ?? 'shared',
      params.pinned ? 1 : 0,
      ts,
      ts
    )
    return { id }
  },

  search(query: string, limit = 10) {
    return db().prepare(
      `SELECT m.id, m.type, m.content, m.tags_json as tagsJson, m.source, m.confidence,
       m.access_count as accessCount, m.created_at as createdAt,
       m.importance, m.employee_id as employeeId, m.scope, m.pinned
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
       access_count as accessCount, created_at as createdAt,
       importance, employee_id as employeeId, scope, pinned
       FROM memories ORDER BY confidence DESC, updated_at DESC LIMIT ?`
    ).all(limit)
  },

  // ── Pinned memories ────────────────────────────────────────

  getPinned() {
    return db().prepare(
      `SELECT id, type, content, tags_json as tagsJson, source, confidence,
       access_count as accessCount, created_at as createdAt,
       importance, employee_id as employeeId, scope, pinned
       FROM memories WHERE pinned = 1
       ORDER BY
         CASE importance WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         created_at ASC`
    ).all()
  },

  setPinned(id: string, pinned: boolean): void {
    db().prepare(
      'UPDATE memories SET pinned = ?, updated_at = ? WHERE id = ?'
    ).run(pinned ? 1 : 0, now(), id)
  },

  // ── Scoped retrieval ───────────────────────────────────────

  getByScope(scope: string, employeeId?: string, limit = 50) {
    if (employeeId) {
      return db().prepare(
        `SELECT id, type, content, tags_json as tagsJson, source, confidence,
         access_count as accessCount, created_at as createdAt,
         importance, employee_id as employeeId, scope, pinned
         FROM memories
         WHERE (scope = ? OR scope = 'hive' OR employee_id = ?)
         ORDER BY confidence DESC, updated_at DESC LIMIT ?`
      ).all(scope, employeeId, limit)
    }
    return db().prepare(
      `SELECT id, type, content, tags_json as tagsJson, source, confidence,
       access_count as accessCount, created_at as createdAt,
       importance, employee_id as employeeId, scope, pinned
       FROM memories
       WHERE scope = ? OR scope = 'hive'
       ORDER BY confidence DESC, updated_at DESC LIMIT ?`
    ).all(scope, limit)
  },

  getByImportance(importance: string, limit = 50) {
    return db().prepare(
      `SELECT id, type, content, tags_json as tagsJson, source, confidence,
       access_count as accessCount, created_at as createdAt,
       importance, employee_id as employeeId, scope, pinned
       FROM memories WHERE importance = ?
       ORDER BY confidence DESC, updated_at DESC LIMIT ?`
    ).all(importance, limit)
  },

  // ── Decay & pruning ────────────────────────────────────────

  bulkDecay(decayAmount: number, cutoffDate: string): number {
    const result = db().prepare(
      `UPDATE memories
       SET confidence = MAX(confidence - ?, 0.0), updated_at = ?
       WHERE pinned = 0
         AND (last_accessed_at IS NULL OR last_accessed_at < ?)
         AND confidence > 0.0`
    ).run(decayAmount, now(), cutoffDate)
    return result.changes
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
    const result = db().prepare(
      'DELETE FROM memories WHERE confidence < ? AND pinned = 0'
    ).run(minConfidence)
    return result.changes
  },

  // ── Importance update ──────────────────────────────────────

  updateImportance(id: string, importance: string, confidence: number): void {
    db().prepare(
      'UPDATE memories SET importance = ?, confidence = ?, updated_at = ? WHERE id = ?'
    ).run(importance, confidence, now(), id)
  },

  // ── Consolidation ──────────────────────────────────────────

  getForConsolidation(sinceDays: number, limit = 200) {
    const cutoff = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString()
    return db().prepare(
      `SELECT id, type, content, tags_json as tagsJson, source, confidence,
       access_count as accessCount, created_at as createdAt,
       importance, employee_id as employeeId, scope, pinned
       FROM memories
       WHERE pinned = 0
         AND type != 'insight'
         AND created_at > ?
       ORDER BY created_at DESC LIMIT ?`
    ).all(cutoff, limit)
  },

  createInsight(params: {
    sourceMemoryIds: string[]
    content: string
    patternDescription: string
    tags?: string[]
  }): { id: string; consolidationId: string } {
    const memoryId = uuid()
    const consolidationId = uuid()
    const ts = now()

    db().prepare(
      `INSERT INTO memories (id, type, content, tags_json, source, confidence, importance, scope, pinned, created_at, updated_at)
       VALUES (?, 'insight', ?, ?, 'consolidation', 0.8, 'high', 'hive', 0, ?, ?)`
    ).run(memoryId, params.content, JSON.stringify(params.tags ?? []), ts, ts)

    db().prepare(
      `INSERT INTO memory_consolidations (id, insight_memory_id, source_memory_ids, pattern_description, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(consolidationId, memoryId, JSON.stringify(params.sourceMemoryIds), params.patternDescription, ts)

    return { id: memoryId, consolidationId }
  },

  getInsights(limit = 50) {
    return db().prepare(
      `SELECT m.id, m.content, m.tags_json as tagsJson, m.confidence,
       m.created_at as createdAt, mc.source_memory_ids as sourceMemoryIds,
       mc.pattern_description as patternDescription
       FROM memories m
       JOIN memory_consolidations mc ON mc.insight_memory_id = m.id
       WHERE m.type = 'insight'
       ORDER BY m.created_at DESC LIMIT ?`
    ).all(limit)
  },

  // ── Stats ──────────────────────────────────────────────────

  getStats() {
    const total = (db().prepare('SELECT COUNT(*) as count FROM memories').get() as { count: number }).count
    const pinnedCount = (db().prepare('SELECT COUNT(*) as count FROM memories WHERE pinned = 1').get() as { count: number }).count
    const avgConfidence = (db().prepare('SELECT AVG(confidence) as avg FROM memories').get() as { avg: number | null }).avg ?? 0
    const decayingCount = (db().prepare('SELECT COUNT(*) as count FROM memories WHERE confidence < 0.3 AND pinned = 0').get() as { count: number }).count

    const byType = db().prepare(
      'SELECT type, COUNT(*) as count FROM memories GROUP BY type ORDER BY count DESC'
    ).all() as { type: string; count: number }[]

    const byImportance = db().prepare(
      'SELECT importance, COUNT(*) as count FROM memories GROUP BY importance ORDER BY count DESC'
    ).all() as { importance: string; count: number }[]

    const insightCount = (db().prepare("SELECT COUNT(*) as count FROM memories WHERE type = 'insight'").get() as { count: number }).count

    const lastConsolidation = (db().prepare(
      'SELECT MAX(created_at) as lastRun FROM memory_consolidations'
    ).get() as { lastRun: string | null }).lastRun

    return { total, pinnedCount, avgConfidence, decayingCount, byType, byImportance, insightCount, lastConsolidation }
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
