-- Lead Tracking: GHL webhook events ingested directly into Blade OS.
-- No external Supabase needed — Blade is the master data store.

-- Raw webhook events
CREATE TABLE IF NOT EXISTS lead_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  account_name TEXT,
  contact_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  channel TEXT,
  direction TEXT,
  handler TEXT,
  message_body TEXT,
  source TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_lead_events_account ON lead_events(account_id);
CREATE INDEX IF NOT EXISTS idx_lead_events_contact ON lead_events(contact_id);
CREATE INDEX IF NOT EXISTS idx_lead_events_type ON lead_events(event_type);
CREATE INDEX IF NOT EXISTS idx_lead_events_created ON lead_events(created_at);
CREATE INDEX IF NOT EXISTS idx_lead_events_direction ON lead_events(direction);

-- Computed lead engagement state (one row per contact)
CREATE TABLE IF NOT EXISTS lead_engagement (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  contact_name TEXT,
  first_outbound_at TEXT,
  first_outbound_body TEXT,
  first_outbound_source TEXT,
  first_inbound_at TEXT,
  replied_to_intro INTEGER DEFAULT 0,
  replied_to_followup INTEGER DEFAULT 0,
  is_responded INTEGER DEFAULT 0,
  is_booked INTEGER DEFAULT 0,
  is_dead INTEGER DEFAULT 0,
  total_inbound INTEGER DEFAULT 0,
  total_outbound INTEGER DEFAULT 0,
  engagement_status TEXT DEFAULT 'new',
  workflow_name TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(account_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_engagement_account ON lead_engagement(account_id);
CREATE INDEX IF NOT EXISTS idx_lead_engagement_status ON lead_engagement(engagement_status);
CREATE INDEX IF NOT EXISTS idx_lead_engagement_responded ON lead_engagement(is_responded);
