-- ============================================================
-- 0020: Mission Control
-- Task queue with auto-assignment, status tracking, and
-- Telegram notifications. Powers the command center kanban.
-- ============================================================

CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('critical','high','medium','low')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','live','done','failed')),
  assigned_employee TEXT,
  created_by TEXT NOT NULL DEFAULT 'user',
  result TEXT,
  result_summary TEXT,
  cost_usd REAL DEFAULT 0,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (assigned_employee) REFERENCES employees(slug) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_missions_status ON missions(status);
CREATE INDEX IF NOT EXISTS idx_missions_employee ON missions(assigned_employee);
CREATE INDEX IF NOT EXISTS idx_missions_priority ON missions(priority);
CREATE INDEX IF NOT EXISTS idx_missions_created ON missions(created_at);
