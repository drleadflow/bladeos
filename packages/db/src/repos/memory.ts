import { db, uuid, now, sanitizeFtsQuery } from './helpers.js'

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
