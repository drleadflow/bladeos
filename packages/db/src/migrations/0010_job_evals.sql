-- Job Evaluations: structured metrics per coding job for agent performance tracking.
-- This is the foundation of the Karpathy eval loop — every job produces measurable results.

CREATE TABLE IF NOT EXISTS job_evals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,

  -- Outcome
  status TEXT NOT NULL DEFAULT 'pending',        -- pending, passed, failed, partial
  tests_passed INTEGER DEFAULT 0,
  tests_failed INTEGER DEFAULT 0,
  tests_skipped INTEGER DEFAULT 0,
  fix_cycles_used INTEGER DEFAULT 0,
  max_fix_cycles INTEGER DEFAULT 3,

  -- Quality signals
  lint_errors INTEGER DEFAULT 0,
  type_errors INTEGER DEFAULT 0,
  files_changed INTEGER DEFAULT 0,
  lines_added INTEGER DEFAULT 0,
  lines_removed INTEGER DEFAULT 0,

  -- Performance
  total_cost_usd REAL DEFAULT 0,
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  total_tool_calls INTEGER DEFAULT 0,
  total_iterations INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  coding_duration_ms INTEGER DEFAULT 0,
  testing_duration_ms INTEGER DEFAULT 0,

  -- Context
  language TEXT,                                  -- node, python, go, rust, etc.
  repo_url TEXT,
  agent_model TEXT,
  stop_reason TEXT,                               -- end_turn, timeout, cost_limit, error

  -- PR outcome (filled after merge)
  pr_merged INTEGER DEFAULT 0,                   -- 0 or 1
  pr_review_comments INTEGER DEFAULT 0,
  pr_time_to_merge_ms INTEGER,

  -- Structured details
  details_json TEXT,                              -- flexible extra data

  evaluated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_job_evals_job ON job_evals(job_id);
CREATE INDEX IF NOT EXISTS idx_job_evals_status ON job_evals(status);
CREATE INDEX IF NOT EXISTS idx_job_evals_language ON job_evals(language);
CREATE INDEX IF NOT EXISTS idx_job_evals_model ON job_evals(agent_model);
CREATE INDEX IF NOT EXISTS idx_job_evals_evaluated ON job_evals(evaluated_at);

-- Aggregate view for quick dashboard queries
CREATE VIEW IF NOT EXISTS v_agent_success_rate AS
SELECT
  agent_model,
  language,
  COUNT(*) as total_jobs,
  SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) as passed,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
  SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END) as partial,
  ROUND(100.0 * SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) / COUNT(*), 1) as success_rate_pct,
  ROUND(AVG(total_cost_usd), 4) as avg_cost_usd,
  ROUND(AVG(duration_ms) / 1000.0, 1) as avg_duration_sec,
  ROUND(AVG(total_tool_calls), 0) as avg_tool_calls,
  ROUND(AVG(fix_cycles_used), 1) as avg_fix_cycles
FROM job_evals
WHERE status != 'pending'
GROUP BY agent_model, language;
