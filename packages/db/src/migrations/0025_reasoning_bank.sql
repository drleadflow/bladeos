CREATE TABLE IF NOT EXISTS reasoning_patterns (
  id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  task_description TEXT NOT NULL,
  approach TEXT NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'success',
  employee_slug TEXT,
  confidence REAL NOT NULL DEFAULT 0.7,
  use_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  embedding BLOB,
  mission_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reasoning_task_type ON reasoning_patterns(task_type);
CREATE INDEX IF NOT EXISTS idx_reasoning_confidence ON reasoning_patterns(confidence);
CREATE INDEX IF NOT EXISTS idx_reasoning_employee ON reasoning_patterns(employee_slug);
