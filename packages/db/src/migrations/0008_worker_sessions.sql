-- ============================================================
-- Migration 0008: Worker Sessions
-- Durable control-plane records for remote/mobile supervision
-- ============================================================

CREATE TABLE IF NOT EXISTS worker_sessions (
  id TEXT PRIMARY KEY,
  job_id TEXT UNIQUE,
  name TEXT NOT NULL,
  worker_type TEXT NOT NULL DEFAULT 'claude_code',
  runtime TEXT NOT NULL DEFAULT 'pending',
  status TEXT NOT NULL DEFAULT 'queued',
  repo_url TEXT,
  branch TEXT,
  container_name TEXT,
  conversation_id TEXT,
  entrypoint TEXT,
  latest_summary TEXT,
  metadata_json TEXT DEFAULT '{}',
  last_seen_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_worker_sessions_status ON worker_sessions(status);
CREATE INDEX IF NOT EXISTS idx_worker_sessions_runtime ON worker_sessions(runtime);
CREATE INDEX IF NOT EXISTS idx_worker_sessions_updated ON worker_sessions(updated_at);
