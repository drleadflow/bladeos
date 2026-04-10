-- Client Accounts: per-client configuration for the CSM agent.
-- Each client has platform credentials, KPI targets, and health tracking.

CREATE TABLE IF NOT EXISTS client_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',                -- active, paused, churned, onboarding

  -- Contact
  contact_name TEXT,
  contact_email TEXT,
  slack_channel_id TEXT,                                -- where to post updates
  slack_channel_name TEXT,

  -- Service context
  service_type TEXT NOT NULL DEFAULT 'ads',              -- ads, ecommerce, leadgen, saas
  industry TEXT,
  monthly_retainer_usd REAL DEFAULT 0,

  -- Platform credentials (encrypted JSON — API keys, tokens, account IDs)
  platforms_json TEXT NOT NULL DEFAULT '{}',
  -- Example: {"meta": {"account_id": "123", "access_token": "..."}, "triplewhale": {"api_key": "..."}}

  -- KPI targets (JSON array of targets)
  kpi_targets_json TEXT NOT NULL DEFAULT '[]',
  -- Example: [{"metric": "roas", "target": 3.0, "warning": 2.5, "critical": 2.0, "direction": "higher_is_better"}]

  -- Health tracking
  health_score INTEGER DEFAULT 0,                       -- 0-100
  health_status TEXT DEFAULT 'unknown',                  -- healthy, warning, critical, unknown
  last_health_check_at TEXT,
  last_report_at TEXT,
  last_alert_at TEXT,

  -- Notes
  notes TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_client_accounts_status ON client_accounts(status);
CREATE INDEX IF NOT EXISTS idx_client_accounts_slug ON client_accounts(slug);
CREATE INDEX IF NOT EXISTS idx_client_accounts_health ON client_accounts(health_status);

-- Client health snapshots — time-series health data for trend analysis
CREATE TABLE IF NOT EXISTS client_health_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,

  health_score INTEGER NOT NULL,
  health_status TEXT NOT NULL,                           -- healthy, warning, critical

  -- Metric values at time of snapshot
  metrics_json TEXT NOT NULL DEFAULT '{}',
  -- Example: {"roas": 3.2, "cpl": 12.5, "spend": 5000, "revenue": 16000}

  -- Alerts generated from this check
  alerts_json TEXT,
  -- Example: [{"metric": "roas", "value": 2.1, "target": 3.0, "severity": "critical"}]

  checked_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_client_health_client ON client_health_snapshots(client_id);
CREATE INDEX IF NOT EXISTS idx_client_health_checked ON client_health_snapshots(checked_at);

-- CSM agent eval metrics — tracks agent performance per client per day
CREATE TABLE IF NOT EXISTS csm_evals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,

  eval_date TEXT NOT NULL,                               -- YYYY-MM-DD
  health_check_ran INTEGER DEFAULT 0,                    -- 0 or 1
  decline_detected INTEGER DEFAULT 0,                    -- 0 or 1
  decline_detection_latency_hours REAL,                  -- hours from decline to alert
  alert_delivered INTEGER DEFAULT 0,                     -- 0 or 1
  report_generated INTEGER DEFAULT 0,                    -- 0 or 1
  cost_usd REAL DEFAULT 0,

  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_csm_evals_client ON csm_evals(client_id);
CREATE INDEX IF NOT EXISTS idx_csm_evals_date ON csm_evals(eval_date);

-- Aggregate view for CSM agent performance
CREATE VIEW IF NOT EXISTS v_csm_performance AS
SELECT
  ca.name as client_name,
  ca.health_status,
  COUNT(ce.id) as total_days_tracked,
  SUM(ce.health_check_ran) as health_checks_completed,
  ROUND(100.0 * SUM(ce.health_check_ran) / MAX(COUNT(ce.id), 1), 1) as check_completion_rate_pct,
  SUM(ce.decline_detected) as declines_detected,
  ROUND(AVG(ce.decline_detection_latency_hours), 1) as avg_detection_latency_hours,
  SUM(ce.alert_delivered) as alerts_delivered,
  SUM(ce.report_generated) as reports_generated,
  ROUND(SUM(ce.cost_usd), 2) as total_cost_usd,
  ROUND(SUM(ce.cost_usd) / MAX(COUNT(DISTINCT ce.eval_date), 1), 4) as avg_daily_cost_usd
FROM csm_evals ce
JOIN client_accounts ca ON ce.client_id = ca.id
GROUP BY ce.client_id;
