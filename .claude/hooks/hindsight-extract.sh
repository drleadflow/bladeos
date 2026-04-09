#!/bin/bash
# hindsight-extract.sh — Layer 4: Behavioral pattern extraction
# Runs via Stop hook (after session-end.sh). Prompts Claude to
# reflect on the session and extract reusable behavioral patterns.
#
# This is NOT memory. Memory = what happened.
# Hindsight = how Claude should behave differently going forward.

HINDSIGHT_PATH=".claude/hindsight/PATTERNS.md"

if [ ! -f "$HINDSIGHT_PATH" ]; then
    echo "No hindsight PATTERNS.md found — skipping extraction."
    exit 0
fi

cat <<'EOF'
Before ending, review this session for behavioral patterns worth extracting.

Ask yourself:
- Did the user correct my approach? What should I do differently next time?
- Did something work especially well? What made it work?
- Did I waste time on something? How should I avoid that pattern?
- Did I make an assumption that was wrong?

If any pattern is worth keeping, append it to .claude/hindsight/PATTERNS.md using the format:

### [Pattern Name]
**Trigger:** When this situation occurs...
**Behavior:** Claude should...
**Learned From:** Brief description of what happened
**Confidence:** Low (first occurrence) / Medium (2-3 occurrences) / High (validated multiple times)

Only add genuinely useful patterns. Skip if nothing notable happened.
EOF
