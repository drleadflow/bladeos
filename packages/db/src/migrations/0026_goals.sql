CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  metric_name TEXT NOT NULL,
  metric_unit TEXT NOT NULL DEFAULT 'count',
  target_value REAL NOT NULL,
  current_value REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  priority TEXT NOT NULL DEFAULT 'medium',
  deadline TEXT,
  owner TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
CREATE INDEX IF NOT EXISTS idx_goals_category ON goals(category);

CREATE TABLE IF NOT EXISTS goal_agents (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  employee_slug TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'contributor',
  contribution_weight REAL NOT NULL DEFAULT 1.0,
  created_at TEXT NOT NULL,
  UNIQUE(goal_id, employee_slug)
);
CREATE INDEX IF NOT EXISTS idx_goal_agents_goal ON goal_agents(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_agents_employee ON goal_agents(employee_slug);

CREATE TABLE IF NOT EXISTS goal_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id TEXT NOT NULL,
  previous_value REAL NOT NULL,
  new_value REAL NOT NULL,
  delta REAL NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  employee_slug TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_goal_updates_goal ON goal_updates(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_updates_created ON goal_updates(created_at);
