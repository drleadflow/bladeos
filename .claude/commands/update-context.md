---
description: "Analyze sessions and propose updates to CLAUDE.md and rules"
disable-model-invocation: true
allowed-tools:
  - Read
  - Glob
  - Grep
  - Agent
---

You are executing the context update workflow. This is a gated process —
changes are proposed, not applied, until the user approves.

1. Invoke the policy-refiner agent to analyze current state:
   - Error logs, hindsight patterns, session history, PRIMER.md, NOTES.md
   - Current CLAUDE.md and .claude/rules/ for staleness or bloat

2. Present the agent's proposed changes to the user clearly.

3. Only apply changes the user explicitly approves.

4. For approved changes:
   - Prefer adding to .claude/rules/ over expanding CLAUDE.md
   - Keep CLAUDE.md concise and high-level
   - Move detail into modular rule files

5. After applying, summarize what changed and why.
