#!/bin/bash
# memory.sh — Layer 3: Live context injection at session start
# Runs via SessionStart hook. Outputs git state so Claude knows
# what changed before you say a word.

echo "=== MEMORY.SH — Live Context ==="
echo ""

# Current branch
BRANCH=$(git branch --show-current 2>/dev/null)
if [ -n "$BRANCH" ]; then
    echo "Branch: $BRANCH"
else
    echo "Branch: (not a git repo or detached HEAD)"
fi
echo ""

# Last 5 commits
echo "Recent Commits:"
git log --oneline -5 2>/dev/null || echo "  No git history yet."
echo ""

# Modified files (unstaged + staged)
MODIFIED=$(git status --short 2>/dev/null)
if [ -n "$MODIFIED" ]; then
    echo "Modified Files:"
    echo "$MODIFIED"
else
    echo "Modified Files: Working tree clean."
fi
echo ""

# Untracked files count
UNTRACKED=$(git ls-files --others --exclude-standard 2>/dev/null | wc -l | tr -d ' ')
echo "Untracked Files: $UNTRACKED"
echo ""

echo "=== END MEMORY.SH ==="
