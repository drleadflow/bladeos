-- 0029_mission_source.sql
-- Track which channel created each mission and link to conversation

ALTER TABLE missions ADD COLUMN source_channel TEXT DEFAULT 'unknown';
ALTER TABLE missions ADD COLUMN conversation_id TEXT;
