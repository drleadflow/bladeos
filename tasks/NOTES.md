# NOTES.md — In-Flight Decision Tracking

For any task spanning 3+ exchanges, maintain this file with current state.
Update after each significant action. This enables coherence across
context resets and compaction events.

## Current Task
Package the current Blade checkpoint into a clean handoff, commit all current work, and preserve exact resume instructions.

## Decisions Made
- Keep the project moving toward a command-center / worker-control-plane architecture.
- Prefer durable control-plane state over channel-specific or prompt-only fixes.
- Record the resume state in-repo so the handoff is versioned with the code.

## Rejected Approaches
- Do not rely on title-based conversation lookup for Telegram or other channels.
- Do not fake worker controls that the runtime cannot actually honor.

## Active State
Checkpoint documentation and commit packaging.

## Blockers
- No Git remote is configured, so pushing to GitHub cannot happen until a remote repo URL is attached.

## Next Step
Add the GitHub remote, push the checkpoint commit, then continue with interactive worker controls: log streaming, attach/send-input, and stronger interrupt semantics.
