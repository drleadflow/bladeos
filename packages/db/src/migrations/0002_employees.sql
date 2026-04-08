-- Blade Super Agent — Employee System Schema (additive only)

-- Active employees (which employees the user has activated)
CREATE TABLE IF NOT EXISTS active_employees (
  employee_id TEXT PRIMARY KEY,
  activated_at TEXT NOT NULL DEFAULT (datetime('now')),
  archetype TEXT NOT NULL CHECK(archetype IN ('coach', 'operator')),
  onboarding_complete INTEGER NOT NULL DEFAULT 0
);

-- Scorecard entries (metric tracking per employee)
CREATE TABLE IF NOT EXISTS scorecard_entries (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  metric_id TEXT NOT NULL,
  value REAL NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('green', 'yellow', 'red')),
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_scorecard_employee ON scorecard_entries(employee_id);
CREATE INDEX IF NOT EXISTS idx_scorecard_metric ON scorecard_entries(employee_id, metric_id);

-- Improvement queue (self-improvement suggestions)
CREATE TABLE IF NOT EXISTS improvement_queue (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_improvement_status ON improvement_queue(status);
