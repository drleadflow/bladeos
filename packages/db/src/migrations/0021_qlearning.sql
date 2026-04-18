-- Q-Learning routing tables
CREATE TABLE IF NOT EXISTS q_routing_table (
  id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  employee_slug TEXT NOT NULL,
  q_value REAL NOT NULL DEFAULT 0.5,
  visit_count INTEGER NOT NULL DEFAULT 0,
  last_reward REAL,
  last_updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(task_type, employee_slug)
);
CREATE INDEX IF NOT EXISTS idx_q_routing_task ON q_routing_table(task_type);
CREATE INDEX IF NOT EXISTS idx_q_routing_employee ON q_routing_table(employee_slug);

CREATE TABLE IF NOT EXISTS routing_episodes (
  id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  task_description TEXT NOT NULL,
  selected_employee TEXT NOT NULL,
  selection_method TEXT NOT NULL DEFAULT 'q_learning',
  reward REAL,
  outcome_status TEXT,
  outcome_cost_usd REAL,
  outcome_duration_ms INTEGER,
  mission_id TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_routing_episodes_task ON routing_episodes(task_type);
CREATE INDEX IF NOT EXISTS idx_routing_episodes_created ON routing_episodes(created_at);
