import { db, now } from './helpers.js'

export const memoryEmbeddings = {
  store(memoryId: string, embedding: Float32Array, model?: string): void {
    const buffer = Buffer.from(embedding.buffer)
    db().prepare(
      `INSERT INTO memory_embeddings (memory_id, embedding, model, dimensions, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(memory_id) DO UPDATE SET
         embedding = excluded.embedding,
         model = excluded.model,
         created_at = excluded.created_at`
    ).run(memoryId, buffer, model ?? 'text-embedding-3-small', embedding.length, now())
  },

  get(memoryId: string): { memoryId: string; embedding: Float32Array; model: string } | undefined {
    const row = db().prepare(
      'SELECT memory_id as memoryId, embedding, model FROM memory_embeddings WHERE memory_id = ?'
    ).get(memoryId) as { memoryId: string; embedding: Buffer; model: string } | undefined
    if (!row) return undefined
    return {
      memoryId: row.memoryId,
      embedding: new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4),
      model: row.model,
    }
  },

  getAll(): { memoryId: string; embedding: Float32Array }[] {
    const rows = db().prepare(
      'SELECT memory_id as memoryId, embedding FROM memory_embeddings'
    ).all() as { memoryId: string; embedding: Buffer }[]
    return rows.map(r => ({
      memoryId: r.memoryId,
      embedding: new Float32Array(r.embedding.buffer, r.embedding.byteOffset, r.embedding.byteLength / 4),
    }))
  },

  delete(memoryId: string): void {
    db().prepare('DELETE FROM memory_embeddings WHERE memory_id = ?').run(memoryId)
  },

  count(): number {
    return (db().prepare('SELECT COUNT(*) as count FROM memory_embeddings').get() as { count: number }).count
  },
}
