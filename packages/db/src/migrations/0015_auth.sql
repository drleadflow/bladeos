-- Multi-tenant auth: users, sessions, passwords, workspace membership

CREATE TABLE IF NOT EXISTS auth_user (
  id TEXT NOT NULL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS auth_session (
  id TEXT NOT NULL PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  user_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  active_workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS auth_password (
  user_id TEXT PRIMARY KEY REFERENCES auth_user(id) ON DELETE CASCADE,
  hashed_password TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_workspace (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner', 'admin', 'editor', 'viewer', 'member')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_auth_user_email ON auth_user(email);
CREATE INDEX IF NOT EXISTS idx_auth_session_user ON auth_session(user_id);
CREATE INDEX IF NOT EXISTS idx_user_workspace_user ON user_workspace(user_id);
CREATE INDEX IF NOT EXISTS idx_user_workspace_workspace ON user_workspace(workspace_id);
