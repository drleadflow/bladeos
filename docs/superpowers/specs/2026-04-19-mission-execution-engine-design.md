# Mission Execution Engine — Design Spec

**Date:** 2026-04-19
**Status:** Draft
**Scope:** Part 1 of 4 — Command Center upgrade series

## Problem

When a mission is created (via voice, dashboard, or Telegram), it writes a row to the database with `status='queued'` and nothing else happens. The `executeEmployeeTask()` function exists but is never called. There is no worker, poller, or scheduler. The mission system is a task tracker UI, not an execution engine.

## Goal

Make missions actually execute. When you say "research X" through the voice agent, an AI employee picks it up, does the work, and delivers structured results you can review and approve.

## Architecture

### Mission Worker

A long-running background process (Node.js) that polls the missions table every 10 seconds.

**Location:** `packages/core/src/missions/mission-worker.ts`

**Lifecycle:**
1. Starts automatically with the web or telegram service
2. Polls `missions` table for rows where `status = 'queued'` and `assigned_employee IS NOT NULL`
3. Respects concurrency: skips if that employee already has a `status = 'live'` mission
4. Unassigned missions are auto-assigned via `autoAssignMission()` before execution
5. Graceful shutdown on SIGTERM/SIGINT

### Execution Flow

```
queued → live → [awaiting_input] → pending_review → done
                                  → done (auto, priority 1-5)
                                  → failed
```

**Steps:**

1. **Pick up** — Set `status = 'live'`, set `started_at = now()`
2. **Execute** — Call `executeEmployeeTask()` with the mission description as the prompt. Employee runs the full agent loop with access to all its tools (web search, memory, file ops, code, etc.)
3. **Clarification pause** — If the employee determines it needs user input:
   - Set `status = 'awaiting_input'`
   - Store the question in a new `mission_questions` field
   - Send question to Telegram via the existing bot
   - Start a 5-minute timer
   - If no response in 5 minutes, surface as a banner notification on the dashboard
   - When user responds (from either Telegram or dashboard), resume execution
4. **Completion** — Employee finishes. Write structured result to the mission row.
5. **Approval routing:**
   - Priority 1-5: auto-complete, set `status = 'done'`
   - Priority 6-10: set `status = 'pending_review'`, send Telegram notification with summary + dashboard link
6. **Failure** — On error or timeout, set `status = 'failed'`, store error, notify via Telegram

### Concurrency Model

- One mission per employee at a time
- Multiple employees work in parallel (up to N employees = N concurrent missions)
- Missions queue in priority order (highest first, then FIFO)
- Worker picks up the highest-priority queued mission for any idle employee

### Status Transitions

| Status | Meaning | Set By |
|--------|---------|--------|
| `queued` | Waiting to be picked up | Mission creation |
| `live` | Employee is executing | Worker |
| `awaiting_input` | Paused, waiting for user clarification | Worker |
| `pending_review` | Done, waiting for user approval (priority 6-10) | Worker |
| `done` | Completed and approved | Worker (auto) or user (manual) |
| `failed` | Execution failed | Worker |
| `rejected` | User rejected the result | User |

### Structured Result Schema

When an employee completes a mission, the result is stored as JSON:

```typescript
interface MissionResult {
  summary: string        // 2-3 sentence TLDR
  findings: string       // Full output text
  artifacts: string[]    // File paths, URLs, PR links, etc.
  confidence: number     // 0.0-1.0 employee confidence in result
  tokensUsed: number
  costUsd: number
  employeeModel: string  // Which model was used
  durationMs: number
}
```

Stored in the existing `result` column as JSON. The `result_summary` column gets the `summary` field for quick display.

### New Database Fields

Add to the `missions` table:

```sql
ALTER TABLE missions ADD COLUMN questions TEXT;          -- JSON: pending clarification question
ALTER TABLE missions ADD COLUMN question_asked_at TEXT;  -- When the question was sent
ALTER TABLE missions ADD COLUMN user_response TEXT;      -- User's answer to the question
```

No new tables needed. The existing schema handles everything else.

### Telegram Notifications

Uses the existing Telegram bot infrastructure. Three notification types:

1. **Mission started** — `"[Nova] Starting: Research competitor pricing"`
2. **Clarification needed** — `"[Nova] Question on 'Research competitor pricing': Which competitors should I focus on?"` (with inline reply)
3. **Review needed** (priority 6-10) — `"[Nova] Completed: Research competitor pricing\n\nSummary: Found 5 competitors with pricing ranging...\n\n[View full result](dashboard-link)"`
4. **Auto-completed** (priority 1-5) — `"[Nova] Done: Research competitor pricing — 3 findings, $0.04 cost"`
5. **Failed** — `"[Nova] Failed: Research competitor pricing — Error: API timeout"`

### Dashboard Integration

**Missions page changes:**
- Add `awaiting_input` and `pending_review` columns to the kanban board
- Mission detail view shows: full result, artifacts list, approve/reject buttons
- `awaiting_input` missions show the question with a text input to respond
- Banner notification at top of dashboard for missions waiting > 5 minutes

**No new pages needed.** The existing Missions page gets richer.

### API Changes

**New endpoints:**

- `POST /api/missions/:id/respond` — Submit user response to a clarification question. Body: `{ response: string }`. Sets `user_response`, clears `awaiting_input`, resumes execution.
- `POST /api/missions/:id/approve` — Approve a `pending_review` mission. Sets status to `done`.
- `POST /api/missions/:id/reject` — Reject a `pending_review` mission. Body: `{ reason: string }`. Sets status to `rejected`.

**Modified endpoints:**

- `GET /api/missions` — Add `status` filter support for new statuses (`awaiting_input`, `pending_review`, `rejected`)

### Worker Startup

The worker starts as part of the existing service:

```typescript
// In apps/telegram/src/index.ts or apps/web startup
import { startMissionWorker } from '@blade/core/missions'

startMissionWorker({
  pollIntervalMs: 10_000,
  notifyTelegram: sendTelegramMessage,  // existing bot function
  dashboardUrl: process.env.DASHBOARD_URL,
  clarificationTimeoutMs: 5 * 60 * 1000,
})
```

### Error Handling

- **Employee execution timeout:** 5 minutes for simple tasks, 15 minutes for coding tasks. Configurable per employee.
- **Repeated failures:** If a mission fails 3 times, mark as `failed` permanently and notify user.
- **Worker crash recovery:** On restart, any `live` missions older than the timeout are reset to `queued` for retry.
- **Cost budget:** Each mission has a max cost of $1.00 by default. Employee stops if budget exceeded.

### Files to Create/Modify

**Create:**
- `packages/core/src/missions/mission-worker.ts` — The polling worker
- `packages/core/src/missions/mission-executor.ts` — Single mission execution logic
- `packages/core/src/missions/types.ts` — MissionResult interface, worker config
- `apps/web/src/app/api/missions/[id]/respond/route.ts` — Clarification response endpoint
- `apps/web/src/app/api/missions/[id]/approve/route.ts` — Approval endpoint
- `apps/web/src/app/api/missions/[id]/reject/route.ts` — Rejection endpoint
- `packages/db/src/migrations/0026-mission-questions.ts` — Add questions columns

**Modify:**
- `packages/db/src/repos/missions.ts` — Add `getNextQueued()`, `setAwaitingInput()`, `submitResponse()` methods
- `apps/telegram/src/index.ts` — Start worker, wire up notification callbacks
- `apps/web/src/app/api/missions/route.ts` — Support new status filters
- `apps/command/src/components/blade/MissionsPage.tsx` — Add new kanban columns, detail view, approve/reject UI
- `apps/command/src/stores/blade-store.ts` — Add mission response/approve/reject actions

### Out of Scope

- Multi-step mission chains (mission A triggers mission B)
- Mission templates or recurring missions
- Employee skill matching beyond Q-router
- Dashboard real-time WebSocket updates (use polling for v1)
- File attachment upload from dashboard (Part 3)

### Success Criteria

1. Creating a mission from voice agent → employee executes it within 30 seconds
2. Employee results appear in dashboard with structured output
3. High-priority missions wait for user approval before completing
4. Clarification questions reach user via Telegram within seconds
5. Dashboard fallback banner appears after 5 minutes of no response
6. User can approve/reject from either Telegram or dashboard
7. Concurrent missions work (one per employee)
8. Worker recovers gracefully from crashes
