-- Content Studio: batch video upload, transcription, AI captions, scheduling

CREATE TABLE IF NOT EXISTS content_projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  video_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS content_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES content_projects(id),
  title TEXT,
  status TEXT NOT NULL DEFAULT 'uploaded',
  video_url TEXT,
  video_key TEXT,
  thumbnail_url TEXT,
  duration_seconds REAL,
  file_size_bytes INTEGER,
  transcript TEXT,
  transcript_segments TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS content_captions (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES content_items(id),
  platform TEXT NOT NULL,
  caption TEXT NOT NULL,
  hashtags TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  published_at TEXT,
  published_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS content_schedule (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES content_items(id),
  caption_id TEXT REFERENCES content_captions(id),
  platform TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  published_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_content_items_project ON content_items(project_id);
CREATE INDEX IF NOT EXISTS idx_content_captions_item ON content_captions(item_id);
CREATE INDEX IF NOT EXISTS idx_content_schedule_status ON content_schedule(status, scheduled_at);
