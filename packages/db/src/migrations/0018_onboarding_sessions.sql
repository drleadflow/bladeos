-- Onboarding Sessions: channel-agnostic onboarding state machine

CREATE TABLE IF NOT EXISTS onboarding_sessions (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'welcome',
  vertical TEXT,
  selected_employees TEXT DEFAULT '[]',
  answers TEXT DEFAULT '{}',
  current_employee_index INTEGER NOT NULL DEFAULT 0,
  current_question_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_onboarding_channel ON onboarding_sessions(channel, channel_id);
