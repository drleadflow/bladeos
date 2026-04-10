-- Persistent Workspaces: cloned repos that survive across messages.
-- Each workspace holds a project that can be worked on from Telegram.

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,                                    -- display name (e.g., "Ceolandingpages")
  repo_url TEXT NOT NULL,                                -- GitHub clone URL
  branch TEXT NOT NULL DEFAULT 'main',                   -- current branch
  local_path TEXT NOT NULL,                              -- path on server filesystem
  status TEXT NOT NULL DEFAULT 'cloning',                -- cloning, ready, error, archived
  owner_chat_id TEXT,                                    -- Telegram chatId that owns this workspace

  -- Tracking
  last_command TEXT,
  last_command_at TEXT,
  total_commands INTEGER DEFAULT 0,
  total_commits INTEGER DEFAULT 0,
  total_prs INTEGER DEFAULT 0,

  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON workspaces(owner_chat_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_status ON workspaces(status);
CREATE INDEX IF NOT EXISTS idx_workspaces_repo ON workspaces(repo_url);

-- Track which workspace is active per chat (one active workspace per chat)
CREATE TABLE IF NOT EXISTS active_workspaces (
  chat_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  activated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
