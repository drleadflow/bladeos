CREATE TABLE IF NOT EXISTS evolution_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  before_value TEXT,
  after_value TEXT,
  impact TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_evolution_type ON evolution_events(type);
CREATE INDEX IF NOT EXISTS idx_evolution_date ON evolution_events(created_at);
