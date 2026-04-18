CREATE TABLE IF NOT EXISTS escalation_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  condition_type TEXT NOT NULL,
  condition_config_json TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_config_json TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  cooldown_minutes INTEGER NOT NULL DEFAULT 60,
  last_triggered_at TEXT,
  trigger_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_escalation_enabled ON escalation_rules(enabled);

CREATE TABLE IF NOT EXISTS escalation_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id TEXT NOT NULL,
  rule_name TEXT NOT NULL,
  condition_type TEXT NOT NULL,
  condition_value TEXT,
  action_type TEXT NOT NULL,
  action_result TEXT,
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_escalation_events_rule ON escalation_events(rule_id);
CREATE INDEX IF NOT EXISTS idx_escalation_events_created ON escalation_events(created_at);
CREATE INDEX IF NOT EXISTS idx_escalation_events_resolved ON escalation_events(resolved);
