import { db, uuid, now } from './helpers.js'

export interface ReasoningPatternRecord {
  id: string
  taskType: string
  taskDescription: string
  approach: string
  outcome: string
  employeeSlug: string | null
  confidence: number
  useCount: number
  successCount: number
  missionId: string | null
  createdAt: string
  updatedAt: string
}

export interface CreatePatternParams {
  taskType: string
  taskDescription: string
  approach: string
  outcome?: string
  employeeSlug?: string
  confidence?: number
  embedding?: Buffer
  missionId?: string
}

const PATTERN_FIELDS = `
  id, task_type as taskType, task_description as taskDescription,
  approach, outcome, employee_slug as employeeSlug,
  confidence, use_count as useCount, success_count as successCount,
  mission_id as missionId,
  created_at as createdAt, updated_at as updatedAt
`

export const reasoningPatterns = {
  create(params: CreatePatternParams): ReasoningPatternRecord {
    const id = uuid()
    const ts = now()
    db().prepare(
      `INSERT INTO reasoning_patterns (id, task_type, task_description, approach, outcome, employee_slug, confidence, embedding, mission_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, params.taskType, params.taskDescription, params.approach,
      params.outcome ?? 'success', params.employeeSlug ?? null,
      params.confidence ?? 0.7, params.embedding ?? null,
      params.missionId ?? null, ts, ts
    )
    return reasoningPatterns.get(id)!
  },

  get(id: string): ReasoningPatternRecord | undefined {
    return db().prepare(`SELECT ${PATTERN_FIELDS} FROM reasoning_patterns WHERE id = ?`).get(id) as ReasoningPatternRecord | undefined
  },

  listByTaskType(taskType: string, limit = 10): ReasoningPatternRecord[] {
    return db().prepare(
      `SELECT ${PATTERN_FIELDS} FROM reasoning_patterns
       WHERE task_type = ? AND confidence > 0.3
       ORDER BY confidence DESC, success_count DESC LIMIT ?`
    ).all(taskType, limit) as ReasoningPatternRecord[]
  },

  listByEmployee(employeeSlug: string, limit = 20): ReasoningPatternRecord[] {
    return db().prepare(
      `SELECT ${PATTERN_FIELDS} FROM reasoning_patterns
       WHERE employee_slug = ?
       ORDER BY confidence DESC, updated_at DESC LIMIT ?`
    ).all(employeeSlug, limit) as ReasoningPatternRecord[]
  },

  recordUse(id: string, success: boolean): void {
    const ts = now()
    if (success) {
      db().prepare(
        `UPDATE reasoning_patterns SET use_count = use_count + 1, success_count = success_count + 1,
         confidence = MIN(confidence + 0.05, 1.0), updated_at = ? WHERE id = ?`
      ).run(ts, id)
    } else {
      db().prepare(
        `UPDATE reasoning_patterns SET use_count = use_count + 1,
         confidence = MAX(confidence - 0.1, 0.0), updated_at = ? WHERE id = ?`
      ).run(ts, id)
    }
  },

  getEmbeddings(): Array<{ id: string; embedding: Float32Array }> {
    const rows = db().prepare(
      'SELECT id, embedding FROM reasoning_patterns WHERE embedding IS NOT NULL AND confidence > 0.3'
    ).all() as Array<{ id: string; embedding: Buffer }>
    return rows.map(r => ({
      id: r.id,
      embedding: new Float32Array(r.embedding.buffer, r.embedding.byteOffset, r.embedding.byteLength / 4),
    }))
  },

  updateEmbedding(id: string, embedding: Float32Array): void {
    const buffer = Buffer.from(embedding.buffer)
    db().prepare('UPDATE reasoning_patterns SET embedding = ?, updated_at = ? WHERE id = ?').run(buffer, now(), id)
  },

  prune(minConfidence = 0.1): number {
    const result = db().prepare('DELETE FROM reasoning_patterns WHERE confidence < ?').run(minConfidence)
    return result.changes
  },

  getStats(): { total: number; byTaskType: Array<{ taskType: string; count: number }> } {
    const total = (db().prepare('SELECT COUNT(*) as count FROM reasoning_patterns').get() as { count: number }).count
    const byTaskType = db().prepare(
      'SELECT task_type as taskType, COUNT(*) as count FROM reasoning_patterns GROUP BY task_type ORDER BY count DESC'
    ).all() as Array<{ taskType: string; count: number }>
    return { total, byTaskType }
  },
}
