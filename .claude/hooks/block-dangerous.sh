#!/bin/bash
# block-dangerous.sh — PreToolUse guard for destructive bash commands
# Blocks: rm -rf, fork bombs, pipe-to-shell, dd to disk, eval of urls
# Runs before any Bash tool execution. Exit code 2 = block the operation.

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null)

# Only check Bash tool calls
if [ "$TOOL_NAME" != "Bash" ]; then
    exit 0
fi

COMMAND=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('command',''))" 2>/dev/null)

# Dangerous patterns to block
BLOCKED=0
REASON=""

# rm -rf targeting root, home, or parent (but NOT rm of specific deep paths)
# Blocks: rm -rf /, rm -rf ~, rm -rf .., rm -rf /usr, rm -rf ~/
# Allows: rm /path/to/specific/file.txt, rm -f /deep/nested/thing
if echo "$COMMAND" | grep -qE 'rm\s+(-[a-zA-Z]*r[a-zA-Z]*\s+)+(/\s|/$|~/|~\s|~$|\.\.)'; then
    BLOCKED=1
    REASON="Recursive rm targeting root, home, or parent directory"
fi
if echo "$COMMAND" | grep -qE 'rm\s+(-[a-zA-Z]*r[a-zA-Z]*\s+)+/[a-zA-Z]+\s*$'; then
    BLOCKED=1
    REASON="Recursive rm targeting top-level directory"
fi

# Fork bomb patterns
if echo "$COMMAND" | grep -qE ':\(\)\s*\{.*\}'; then
    BLOCKED=1
    REASON="Fork bomb detected"
fi

# Pipe to shell (curl|bash, wget|sh, etc)
if echo "$COMMAND" | grep -qE '\|\s*(bash|sh|zsh|python3?|ruby|perl|node)\s*$'; then
    BLOCKED=1
    REASON="Pipe-to-shell execution detected"
fi

# dd writing to disk devices
if echo "$COMMAND" | grep -qE 'dd\s+.*of=/dev/'; then
    BLOCKED=1
    REASON="dd writing to disk device"
fi

# mkfs on any device
if echo "$COMMAND" | grep -qE 'mkfs'; then
    BLOCKED=1
    REASON="Filesystem format command detected"
fi

# chmod 777 recursive
if echo "$COMMAND" | grep -qE 'chmod\s+(-R\s+)?777\s+/'; then
    BLOCKED=1
    REASON="Recursive chmod 777 on root path"
fi

if [ "$BLOCKED" -eq 1 ]; then
    echo "{\"decision\": \"block\", \"reason\": \"BLOCKED: $REASON. Command: $COMMAND\"}"
    exit 2
fi

exit 0
