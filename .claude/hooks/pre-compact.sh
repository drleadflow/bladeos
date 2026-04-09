#!/bin/bash
# pre-compact.sh — Archive transcript before context compaction
# Runs via PreCompact hook. Saves session state so nothing is lost
# when the summarizer compresses conversation history.
#
# NOTE: PreCompact hooks CANNOT block compaction — this is
# observability only. Use it for backup/archival.

ARCHIVE_DIR=".claude/sessions"
mkdir -p "$ARCHIVE_DIR"

TIMESTAMP=$(date +%Y-%m-%d_%H%M%S)
ARCHIVE_FILE="$ARCHIVE_DIR/$TIMESTAMP-pre-compact.md"

cat <<EOF > "$ARCHIVE_FILE"
# Pre-Compaction Archive — $TIMESTAMP

## Context
This file was auto-generated before context compaction.
Review it if you need to recover details lost during summarization.

## Session State at Compaction
- Branch: $(git branch --show-current 2>/dev/null || echo "unknown")
- Modified files: $(git status --short 2>/dev/null | wc -l | tr -d ' ')
- Timestamp: $TIMESTAMP
EOF

echo "Session archived to $ARCHIVE_FILE before compaction."
