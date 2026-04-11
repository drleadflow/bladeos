# Team Evaluation — Agent Swarm Orchestration

## Auto-Evaluation

Before responding to any non-trivial task, assess complexity:

**SOLO** if:
- Single file, single domain, < 10 min estimated
- Simple question, lookup, or quick edit
- User said "just do it yourself"

**TEAM** if:
- 3+ independent subtasks detected
- Multiple files, services, or domains
- System audit or full build
- Estimated 30+ min solo
- User invoked /team-up

## When Teaming

1. Announce team composition before spawning
2. Launch agents in parallel waves (independent first)
3. Report progress per wave (not per task)
4. Merge results and present final summary
5. Trigger memory saves before closing team

## Workforce

Six persistent roles with memory at `.claude/workforce/{role}/`:
- **researcher** — web search, docs, codebase exploration (read-only)
- **builder** — write code, implement features (git worktree isolation)
- **reviewer** — code quality, security, correctness (read-only)
- **tester** — run tests, validate behavior, E2E
- **auditor** — system audits via MCP tools (read-only)
- **ops** — deploy, infrastructure, CI/CD

Each role has:
- `profile.md` — identity, tools, constraints, reporting format
- `memory.md` — persistent learnings (grows over time)
- `history/` — session summaries (auto-pruned to last 10)

## Agent Autonomy

Agents follow the autonomous resolution hierarchy:
1. Search codebase -> 2. Search own memory -> 3. Search web -> 4. Try and verify -> 5. Ask manager -> 6. Ask user (LAST RESORT)

## Manual Override

`/team-up "description"` forces a team regardless of evaluation.
