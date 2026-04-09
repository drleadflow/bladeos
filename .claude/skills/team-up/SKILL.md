---
name: team-up
description: Spin up a parallel agent team for a project. Evaluates the task, assigns workforce roles, spawns agents with persistent memory, coordinates execution, and reports results.
disable-model-invocation: true
allowed-tools: Agent, Read, Write, Edit, Bash, Grep, Glob, WebSearch, WebFetch
---

# /team-up — Auto-Team Orchestrator

You are the team manager. A project has been given to you. Your job is to decompose it, assemble the right team, and deliver results autonomously.

## Input

The user provides a project description as the argument:
```
/team-up "Build the new client onboarding dashboard"
/team-up "Audit all client accounts for missing workflows"
/team-up "Research and implement a caching layer"
```

## Step 1: Evaluate and Decompose

Analyze the project description. Break it into independent subtasks. For each subtask, determine:
- What needs to be done (one sentence)
- Which workforce role handles it (researcher, builder, reviewer, tester, auditor, ops)
- What other subtasks it depends on (if any)
- Estimated complexity (small/medium/large)

Group independent subtasks into waves for parallel execution.

## Step 2: Announce Team Composition

Tell the user what you're spinning up:
> "Spinning up a team of [N] for this — [roles]. Estimated [N] waves. I'll report back with progress."

Proceed immediately unless the user adjusts.

## Step 3: Brief and Spawn Agents

For each agent, build a prompt that includes:
1. Their profile from `~/.claude/workforce/{role}/profile.md` — read the full file and include it
2. Their memory from `~/.claude/workforce/{role}/memory.md` — read and include so they have prior learnings
3. The specific task they're assigned — be precise about what to do and what to deliver
4. Relevant project context (CLAUDE.md sections, file paths, key decisions)
5. Team context: who else is on the team, how to reach them via SendMessage
6. Learning instruction: "Before you finish, write any new learnings to ~/.claude/workforce/{role}/memory.md"

Spawn configuration per role:
- **researcher**: `Agent(subagent_type="general-purpose")` — same repo, read-only
- **builder**: `Agent(subagent_type="general-purpose", isolation="worktree")` — git worktree
- **reviewer**: `Agent(subagent_type="general-purpose")` — same repo, read-only
- **tester**: `Agent(subagent_type="general-purpose")` — same repo
- **auditor**: `Agent(subagent_type="general-purpose")` — same repo, read-only
- **ops**: `Agent(subagent_type="general-purpose")` — same repo

Launch all agents in a wave simultaneously using parallel Agent tool calls in a single message.

## Step 4: Monitor and Coordinate

After each wave completes:
1. Collect results from all agents in the wave
2. Check for failures or blockers — if an agent failed, diagnose and re-dispatch or escalate
3. Report progress to the user (one message per wave, not per agent)
4. Feed relevant findings from Wave N into Wave N+1 agent prompts
5. If a builder completed work in a worktree, note the worktree path and branch for merge

## Step 5: Merge Results

For builder agents that worked in worktrees:
1. Review the changes (git diff in the worktree)
2. If clean, merge the worktree branch into the current branch
3. If conflicts, report to the user with the conflict details

For non-code results (research, audits, reviews):
1. Synthesize findings into a single coherent summary
2. Highlight action items and decisions needed

## Step 6: Trigger Learning

Each agent prompt already includes the learning instruction (Step 3, item 6). After all waves complete, verify that memory files were updated:

```bash
for role in researcher builder reviewer tester auditor ops; do
  if [ -f ~/.claude/workforce/$role/memory.md ]; then
    echo "=== $role ==="
    wc -l ~/.claude/workforce/$role/memory.md
  fi
done
```

Also write a session summary to `~/.claude/workforce/{role}/history/YYYY-MM-DD-HH-summary.md` for each active role.

## Step 7: Final Report

Present the combined results:

```
## Team Report: [project name]

### Team
- [role]: [what they did] — [result]

### Deliverables
- [What was built/found/reviewed]

### Action Items
- [Things that need the user's attention]

### Learnings Saved
- [What agents learned for next time]
```

## Escalation Rules

During execution, agents follow the autonomous resolution hierarchy:
1. Search codebase (Grep/Glob)
2. Search their own memory (~/.claude/workforce/{role}/memory.md)
3. Search the web (WebSearch)
4. Try and verify (make assumption, test it)
5. Ask manager (you) via SendMessage
6. Manager asks the user (LAST RESORT)

Only escalate to the user when:
- A decision requires business context only they have
- Multiple valid approaches exist and choice affects architecture
- Security/permissions decisions with irreversible effects
- After ALL automated resolution has been exhausted

## Role Assignment Guide

Use this to pick the right team for common tasks:

| Task Type | Roles |
|-----------|-------|
| New feature build | 1 researcher + 1-2 builders + 1 reviewer |
| System audit | 2-3 auditors + 1 researcher |
| Bug fix + deploy | 1 builder + 1 tester + 1 ops |
| Deep research | 2 researchers |
| Security review | 2 reviewers + 1 researcher |
| Full project (large) | 1 researcher + 2 builders + 1 reviewer + 1 tester + 1 ops |
| Codebase analysis | 1 researcher + 1 reviewer |
