-- ============================================================
-- 0019: Memory System Overhaul
-- Adds pinned memories, importance classification, employee
-- scoping, and consolidation tracking for multi-layer memory.
-- ============================================================

-- Add new columns to memories table
ALTER TABLE memories ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE memories ADD COLUMN importance TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE memories ADD COLUMN employee_id TEXT;
ALTER TABLE memories ADD COLUMN scope TEXT NOT NULL DEFAULT 'shared';

-- Consolidation tracking — maps insight memories to their source memories
CREATE TABLE IF NOT EXISTS memory_consolidations (
  id TEXT PRIMARY KEY,
  insight_memory_id TEXT NOT NULL,
  source_memory_ids TEXT NOT NULL,  -- JSON array of memory IDs
  pattern_description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (insight_memory_id) REFERENCES memories(id) ON DELETE CASCADE
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_memories_pinned ON memories(pinned) WHERE pinned = 1;
CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance);
CREATE INDEX IF NOT EXISTS idx_memories_employee ON memories(employee_id);
CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories(scope);
CREATE INDEX IF NOT EXISTS idx_memories_scope_employee ON memories(scope, employee_id);
CREATE INDEX IF NOT EXISTS idx_memory_consolidations_insight ON memory_consolidations(insight_memory_id);
