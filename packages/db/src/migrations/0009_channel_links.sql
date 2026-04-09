-- ============================================================
-- Migration 0009: Channel Links
-- Durable mapping between channel-specific threads and conversations
-- ============================================================

CREATE TABLE IF NOT EXISTS channel_links (
  conversation_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  metadata_json TEXT DEFAULT '{}',
  linked_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (channel, channel_id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_channel_links_conversation ON channel_links(conversation_id);
CREATE INDEX IF NOT EXISTS idx_channel_links_channel ON channel_links(channel, channel_id);
