CREATE TABLE IF NOT EXISTS batch_runs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  total_jobs INTEGER NOT NULL DEFAULT 0,
  completed_jobs INTEGER NOT NULL DEFAULT 0,
  failed_jobs INTEGER NOT NULL DEFAULT 0,
  total_cost_usd REAL NOT NULL DEFAULT 0,
  max_concurrent INTEGER NOT NULL DEFAULT 2,
  max_cost_usd REAL,
  stall_timeout_ms INTEGER NOT NULL DEFAULT 300000,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  created_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_batch_runs_status ON batch_runs(status);

CREATE TABLE IF NOT EXISTS batch_job_entries (
  id TEXT PRIMARY KEY,
  batch_run_id TEXT NOT NULL,
  job_id TEXT,
  mission_id TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  priority INTEGER NOT NULL DEFAULT 5,
  assigned_employee TEXT,
  cost_usd REAL DEFAULT 0,
  started_at TEXT,
  completed_at TEXT,
  error TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 2,
  last_activity_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_batch_entries_batch ON batch_job_entries(batch_run_id);
CREATE INDEX IF NOT EXISTS idx_batch_entries_status ON batch_job_entries(status);
