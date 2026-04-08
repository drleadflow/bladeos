-- Blade Super Agent — Gamification Schema

-- XP Events log
CREATE TABLE IF NOT EXISTS xp_events (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  xp INTEGER NOT NULL,
  employee_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_xp_events_action ON xp_events(action);
CREATE INDEX IF NOT EXISTS idx_xp_events_date ON xp_events(created_at);

-- Streaks
CREATE TABLE IF NOT EXISTS streaks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_checked_in TEXT NOT NULL,
  employee_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_streaks_employee ON streaks(employee_id);

-- Achievements
CREATE TABLE IF NOT EXISTS achievements (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  unlocked_at TEXT
);

-- User profile (single row for XP/level tracking)
CREATE TABLE IF NOT EXISTS user_profile (
  id TEXT PRIMARY KEY DEFAULT 'default',
  total_xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
