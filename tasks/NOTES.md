# NOTES.md — In-Flight Decision Tracking

For any task spanning 3+ exchanges, maintain this file with current state.
Update after each significant action. This enables coherence across
context resets and compaction events.

## Current Task
Audit in-flight terminal changes and track delivery pace against the world-class roadmap.

## Decisions Made
- Keep the project moving toward a command-center / worker-control-plane architecture.
- Prefer durable control-plane state over channel-specific or prompt-only fixes.
- Record execution pace in-repo (`tasks/DELIVERY-TRACKER.md`) so active work can be audited quickly.

## Rejected Approaches
- Do not rely on title-based conversation lookup for Telegram or other channels.
- Do not fake worker controls that the runtime cannot actually honor.

## Active State
Telegram reliability patch is in progress (adapter + bot fallback hardening + tests), with quality gates passing locally.

## Blockers
No code blockers. Operational blocker: live Telegram bot must be restarted after merge to pick up runtime fix.

## Next Step
Commit Telegram reliability patch, deploy/restart bot runtime, run live smoke test, then continue worker streaming + attach/send-input.
