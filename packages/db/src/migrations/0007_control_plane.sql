-- ============================================================
-- Migration 0007: Control Plane
-- Durable state for runs, agents, approvals, monitors, KPIs, routines
-- ============================================================

-- Activity timeline — append-only event store for everything
CREATE TABLE IF NOT EXISTS activity_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  summary TEXT NOT NULL,
  detail_json TEXT,
  conversation_id TEXT,
  job_id TEXT,
  cost_usd REAL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_type ON activity_events(event_type);
CREATE INDEX IF NOT EXISTS idx_activity_actor ON activity_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_activity_target ON activity_events(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_events(created_at);

-- Approvals — pending/approved/rejected actions
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  requested_by TEXT NOT NULL,
  action TEXT NOT NULL,
  tool_name TEXT,
  tool_input_json TEXT,
  context TEXT,
  priority TEXT DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'pending',
  decided_by TEXT,
  decided_at TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);

-- Monitors — external source watchers
CREATE TABLE IF NOT EXISTS monitors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  employee_id TEXT,
  source_type TEXT NOT NULL,
  source_config_json TEXT NOT NULL,
  check_schedule TEXT NOT NULL,
  thresholds_json TEXT,
  last_checked_at TEXT,
  last_value TEXT,
  last_status TEXT DEFAULT 'unknown',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Monitor alerts
CREATE TABLE IF NOT EXISTS monitor_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monitor_id TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  value TEXT,
  acknowledged INTEGER NOT NULL DEFAULT 0,
  acknowledged_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (monitor_id) REFERENCES monitors(id)
);
CREATE INDEX IF NOT EXISTS idx_alerts_monitor ON monitor_alerts(monitor_id);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON monitor_alerts(severity, acknowledged);

-- KPI definitions (per employee)
CREATE TABLE IF NOT EXISTS kpi_definitions (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  source_json TEXT NOT NULL,
  target REAL NOT NULL,
  unit TEXT NOT NULL DEFAULT 'count',
  frequency TEXT NOT NULL DEFAULT 'weekly',
  direction TEXT NOT NULL DEFAULT 'higher_is_better',
  thresholds_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_kpi_employee ON kpi_definitions(employee_id);

-- KPI measurements (time series)
CREATE TABLE IF NOT EXISTS kpi_measurements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kpi_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  value REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'green',
  measured_at TEXT NOT NULL DEFAULT (datetime('now')),
  source TEXT,
  FOREIGN KEY (kpi_id) REFERENCES kpi_definitions(id)
);
CREATE INDEX IF NOT EXISTS idx_kpi_meas_kpi ON kpi_measurements(kpi_id);
CREATE INDEX IF NOT EXISTS idx_kpi_meas_employee ON kpi_measurements(employee_id);
CREATE INDEX IF NOT EXISTS idx_kpi_meas_time ON kpi_measurements(measured_at);

-- Routines (scheduled employee tasks)
CREATE TABLE IF NOT EXISTS routines (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  schedule TEXT NOT NULL,
  task TEXT NOT NULL,
  tools_json TEXT DEFAULT '[]',
  output_channel TEXT DEFAULT 'web',
  timeout_seconds INTEGER DEFAULT 300,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  next_run_at TEXT,
  run_count INTEGER NOT NULL DEFAULT 0,
  last_status TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_routines_employee ON routines(employee_id);
CREATE INDEX IF NOT EXISTS idx_routines_next ON routines(next_run_at);

-- Expand employees table with v2 fields
ALTER TABLE employees ADD COLUMN department TEXT DEFAULT 'general';
ALTER TABLE employees ADD COLUMN objective TEXT;
ALTER TABLE employees ADD COLUMN manager_id TEXT;
ALTER TABLE employees ADD COLUMN allowed_tools_json TEXT DEFAULT '[]';
ALTER TABLE employees ADD COLUMN blocked_tools_json TEXT DEFAULT '[]';
ALTER TABLE employees ADD COLUMN model_preference TEXT DEFAULT 'standard';
ALTER TABLE employees ADD COLUMN max_budget_per_run REAL DEFAULT 1.0;
ALTER TABLE employees ADD COLUMN max_concurrent_runs INTEGER DEFAULT 1;
ALTER TABLE employees ADD COLUMN escalation_policy_json TEXT;
ALTER TABLE employees ADD COLUMN handoff_rules_json TEXT DEFAULT '[]';
ALTER TABLE employees ADD COLUMN memory_scope TEXT DEFAULT 'own';
ALTER TABLE employees ADD COLUMN output_channels_json TEXT DEFAULT '["web"]';
ALTER TABLE employees ADD COLUMN status TEXT DEFAULT 'active';
ALTER TABLE employees ADD COLUMN total_runs INTEGER DEFAULT 0;
ALTER TABLE employees ADD COLUMN total_cost_usd REAL DEFAULT 0;
ALTER TABLE employees ADD COLUMN success_rate REAL DEFAULT 0;
