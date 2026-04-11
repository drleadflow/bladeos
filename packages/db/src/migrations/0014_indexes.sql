-- ============================================================
-- Migration 0014: Performance Indexes
-- Add missing indexes on frequently-queried columns
-- ============================================================

-- Messages: composite index for conversation + time ordering
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at);

-- Jobs: composite index for status + time ordering
CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON jobs(status, created_at);

-- Worker sessions: queried by job_id
CREATE INDEX IF NOT EXISTS idx_worker_sessions_job_id ON worker_sessions(job_id);

-- Memories: queried by type and source
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_source ON memories(source);

-- Cost entries: queried by model
CREATE INDEX IF NOT EXISTS idx_cost_entries_model ON cost_entries(model);

-- Active employees: queried by employee_id (is PRIMARY KEY but alias table may be scanned)
CREATE INDEX IF NOT EXISTS idx_active_employees_employee_id ON active_employees(employee_id);

-- Approvals: composite index for status + priority ordering
CREATE INDEX IF NOT EXISTS idx_approvals_status_priority ON approvals(status, priority, created_at);

-- Monitors: queried by enabled status
CREATE INDEX IF NOT EXISTS idx_monitors_enabled ON monitors(enabled);

-- Skills: queried by usage statistics
CREATE INDEX IF NOT EXISTS idx_skills_usage ON skills(total_uses, success_rate);

-- Scorecard entries: composite index for employee + time ordering
CREATE INDEX IF NOT EXISTS idx_scorecard_employee_recorded ON scorecard_entries(employee_id, recorded_at);

-- Handoffs: queried by status alone (existing index covers to_employee + status)
CREATE INDEX IF NOT EXISTS idx_handoffs_status ON handoffs(status);
