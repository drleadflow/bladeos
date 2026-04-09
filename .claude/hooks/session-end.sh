#!/bin/bash
# session-end.sh — Rewrites PRIMER.md at the end of every session
# Runs via Stop hook. Captures project state so the next session
# picks up exactly where this one left off.
#
# NOTE: This hook outputs a prompt for Claude to follow.
# Claude will read the current PRIMER.md, reflect on what was done,
# and rewrite it with updated context.

PRIMER_PATH=".claude/PRIMER.md"

if [ ! -f "$PRIMER_PATH" ]; then
    echo "No PRIMER.md found — skipping session-end update."
    exit 0
fi

cat <<'EOF'
Before ending this session, update .claude/PRIMER.md with:

1. **Active Project** — What project/feature is currently being worked on
2. **Last Completed** — What was finished in THIS session
3. **Next Steps** — What should be done next session
4. **Open Blockers** — Anything preventing progress
5. **Session Notes** — Key decisions, context, or gotchas for next time

Keep it concise. This is a handoff document, not a journal.
EOF
