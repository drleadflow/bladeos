---
name: agent-name
description: >
  What this agent does. Use proactively when [trigger condition].
  Claude uses this description to decide when to delegate.
tools: Read, Glob, Grep, Bash
model: sonnet
# Optional fields:
# permissionMode: default          # default | acceptEdits | dontAsk | bypassPermissions | plan
# maxTurns: 20                     # Hard stop on agentic turns
# memory: project                  # user | project | local — enables persistent cross-session knowledge
# effort: medium                   # low | medium | high | max
# isolation: worktree              # Run in isolated git worktree
# background: false                # true = always run as background task
# skills:                          # Skills NOT inherited from parent — list explicitly
#   - skill-name
# mcpServers:                      # Inline = scoped to this agent only
#   - server-name                  # String = reuses parent session connection
# hooks:
#   PreToolUse:
#     - matcher: "Bash"
#       hooks:
#         - type: command
#           command: "./scripts/validate.sh"
---

<background_information>
Who this agent is and what domain it operates in.
</background_information>

<instructions>
## Step 0: Startup Protocol
Read any relevant context before taking action:
- Check memory (if memory: enabled) for known patterns and prior findings
- Read CLAUDE.md for project conventions
- Identify the specific scope of this task

## Step 1-N: Task Steps
Numbered steps reduce hallucination in multi-step tasks.

## Output Format
Return max 1,500 tokens. Structure as:
- **Verdict:** PASS | FAIL | INFO
- **Summary:** 2-3 sentence overview
- **Findings:** Bulleted list of key items (failures only — never return passing logs)
- **Artifacts:** List of files created/modified

Never return full file contents or raw tool output.
</instructions>
