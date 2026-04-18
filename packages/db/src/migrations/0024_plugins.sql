CREATE TABLE IF NOT EXISTS plugins (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  version TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  entry_point TEXT NOT NULL,
  config_schema_json TEXT,
  config_json TEXT DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  crash_count INTEGER NOT NULL DEFAULT 0,
  installed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plugins_type ON plugins(type);
CREATE INDEX IF NOT EXISTS idx_plugins_enabled ON plugins(enabled);

CREATE TABLE IF NOT EXISTS plugin_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'success',
  detail_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plugin_events_plugin ON plugin_events(plugin_id);
CREATE INDEX IF NOT EXISTS idx_plugin_events_created ON plugin_events(created_at);
