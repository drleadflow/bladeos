-- 0028_mission_questions.sql
-- Add columns for mission clarification flow and retry tracking

ALTER TABLE missions ADD COLUMN questions TEXT;
ALTER TABLE missions ADD COLUMN question_asked_at TEXT;
ALTER TABLE missions ADD COLUMN user_response TEXT;
ALTER TABLE missions ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;
