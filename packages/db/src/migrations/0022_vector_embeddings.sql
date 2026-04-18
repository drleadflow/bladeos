-- ============================================================
-- 0022: Vector Embeddings
-- Stores pre-computed embeddings for semantic memory search.
-- Used by the HNSW-style in-memory vector index.
-- ============================================================

CREATE TABLE IF NOT EXISTS memory_embeddings (
  memory_id TEXT PRIMARY KEY,
  embedding BLOB NOT NULL,
  model TEXT NOT NULL DEFAULT 'text-embedding-3-small',
  dimensions INTEGER NOT NULL DEFAULT 1536,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_embeddings_model ON memory_embeddings(model);
