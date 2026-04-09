# Blade OS Delivery Tracker

Last updated: 2026-04-09

## Current Sprint Focus

Goal: move from "promising control plane" to "operator-grade reliability and visibility".

### Track A: Telegram Reliability
- Status: `in progress`
- Scope:
  - robust Telegram adapter delivery fallback
  - cleaner user-facing failure messages
  - regression tests for stream-without-done and error-before-done
- Evidence:
  - `packages/conversation/src/adapters/telegram.ts`
  - `packages/conversation/src/telegram-bot.ts`
  - `packages/conversation/src/__tests__/telegram-adapter.test.ts`
- Quality gate:
  - `npm --workspace @blade/conversation run test` ✅
  - `npm run lint` ✅
- Next:
  - restart live Telegram bot process after merge so runtime picks up fix

### Track B: Worker Control Plane
- Status: `partially complete`
- Completed:
  - worker sessions
  - worker detail view
  - `stop` / `retry` actions
- Remaining:
  - live worker log/event stream
  - `attach` / `send input`
  - stronger interrupt semantics (not only cooperative stop)

### Track C: Command Center Product Loop
- Status: `partially complete`
- Completed:
  - Today page command-center treatment
  - runs visibility upgrades
  - employee frameworks metadata
- Remaining:
  - real-time live updates across all key surfaces
  - approvals enforced directly in the agent loop for high-risk actions

## Pace Assessment

- On pace:
  - reliability and observability foundation
  - dashboard/control-plane coherence
- Behind pace:
  - interactive worker control (`attach`, `send input`)
  - end-to-end approval gating in execution loop
- At risk:
  - shipping fixes without restarting long-running bot process

## Next 3 Executables

1. Commit and deploy Telegram reliability patch, then run a live voice round-trip smoke test.
2. Implement worker live stream endpoint + UI panel (logs + stage updates).
3. Add worker `attach/send_input` API and wire to worker detail actions.
