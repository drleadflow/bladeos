# Mission Execution Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make missions actually execute — a background worker polls for queued missions, runs the assigned employee's agent loop, stores structured results, routes approvals, and notifies the user.

**Architecture:** A polling worker (`mission-worker.ts`) checks for queued missions every 10 seconds. For each idle employee with a queued mission, it calls `executeEmployeeTask()` from `auto-executor.ts`. Results are stored as structured JSON. Priority 6-10 missions require user approval. Clarification questions pause execution and notify via Telegram with a 5-minute dashboard fallback.

**Tech Stack:** TypeScript (ESM), better-sqlite3, @blade/core agent loop, @blade/db repos

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/core/src/missions/types.ts` | Create | MissionResult interface, WorkerConfig type |
| `packages/core/src/missions/mission-executor.ts` | Create | Execute a single mission with an employee |
| `packages/core/src/missions/mission-worker.ts` | Create | Poll loop, concurrency, lifecycle management |
| `packages/db/src/migrations/0028_mission_questions.sql` | Create | Add questions/response columns to missions table |
| `packages/db/src/repos/missions.ts` | Modify | Add getNextQueued(), setAwaitingInput(), submitResponse(), setPendingReview() |
| `apps/web/src/app/api/missions/[id]/approve/route.ts` | Create | POST endpoint to approve pending_review missions |
| `apps/web/src/app/api/missions/[id]/reject/route.ts` | Create | POST endpoint to reject missions with reason |
| `apps/web/src/app/api/missions/[id]/respond/route.ts` | Create | POST endpoint to submit clarification response |
| `apps/telegram/src/index.ts` | Modify | Start mission worker on boot |

---

### Task 1: Types and Interfaces

**Files:**
- Create: `packages/core/src/missions/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// packages/core/src/missions/types.ts

export interface MissionResult {
  summary: string
  findings: string
  artifacts: string[]
  confidence: number
  tokensUsed: number
  costUsd: number
  employeeModel: string
  durationMs: number
}

export interface WorkerConfig {
  pollIntervalMs: number
  clarificationTimeoutMs: number
  maxRetriesPerMission: number
  defaultCostBudget: number
  dashboardUrl: string
  notifyTelegram: (message: string) => Promise<void>
}

export const DEFAULT_WORKER_CONFIG: Partial<WorkerConfig> = {
  pollIntervalMs: 10_000,
  clarificationTimeoutMs: 5 * 60 * 1000,
  maxRetriesPerMission: 3,
  defaultCostBudget: 1.0,
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd packages/core && npx tsc --noEmit src/missions/types.ts`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/missions/types.ts
git commit -m "feat(missions): add MissionResult and WorkerConfig types"
```

---

### Task 2: Database Migration — Add Question Columns

**Files:**
- Create: `packages/db/src/migrations/0028_mission_questions.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 0028_mission_questions.sql
-- Add columns for mission clarification flow and retry tracking

ALTER TABLE missions ADD COLUMN questions TEXT;
ALTER TABLE missions ADD COLUMN question_asked_at TEXT;
ALTER TABLE missions ADD COLUMN user_response TEXT;
ALTER TABLE missions ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;
```

- [ ] **Step 2: Verify migration runs**

Run: `cd packages/db && node -e "const { initializeDb } = require('./dist/sqlite.js'); initializeDb();"`

If the project uses ESM, run:
```bash
cd packages/db && node --loader ts-node/esm -e "import { initializeDb } from './src/sqlite.js'; initializeDb();"
```

Expected: No errors, migrations applied

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/migrations/0028_mission_questions.sql
git commit -m "feat(db): add mission questions columns for clarification flow"
```

---

### Task 3: Extend Missions Repository

**Files:**
- Modify: `packages/db/src/repos/missions.ts`

- [ ] **Step 1: Update SELECT_FIELDS to include new columns**

In `packages/db/src/repos/missions.ts`, replace the existing `SELECT_FIELDS`:

```typescript
const SELECT_FIELDS = `
  id, title, description, priority, status,
  assigned_employee as assignedEmployee,
  created_by as createdBy,
  result, result_summary as resultSummary,
  cost_usd as costUsd,
  started_at as startedAt,
  completed_at as completedAt,
  created_at as createdAt,
  updated_at as updatedAt,
  questions, question_asked_at as questionAskedAt,
  user_response as userResponse,
  retry_count as retryCount
`
```

- [ ] **Step 2: Update MissionRecord interface**

Add to the `MissionRecord` interface:

```typescript
export interface MissionRecord {
  id: string
  title: string
  description: string | null
  priority: string
  status: string
  assignedEmployee: string | null
  createdBy: string
  result: string | null
  resultSummary: string | null
  costUsd: number
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  questions: string | null
  questionAskedAt: string | null
  userResponse: string | null
  retryCount: number
}
```

- [ ] **Step 3: Add getNextQueued() method**

Add to the `missions` object after `getActiveForEmployee`:

```typescript
  getNextQueued(busyEmployees: string[]): MissionRecord | undefined {
    const placeholders = busyEmployees.length > 0
      ? busyEmployees.map(() => '?').join(',')
      : "'__none__'"
    const excludeClause = busyEmployees.length > 0
      ? `AND assigned_employee NOT IN (${placeholders})`
      : ''
    return db().prepare(
      `SELECT ${SELECT_FIELDS} FROM missions
       WHERE status = 'queued' AND assigned_employee IS NOT NULL ${excludeClause}
       ORDER BY
         CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         created_at ASC
       LIMIT 1`
    ).get(...busyEmployees) as MissionRecord | undefined
  },
```

- [ ] **Step 4: Add setAwaitingInput() method**

```typescript
  setAwaitingInput(id: string, question: string): void {
    const ts = now()
    db().prepare(
      `UPDATE missions SET status = 'awaiting_input', questions = ?, question_asked_at = ?, updated_at = ? WHERE id = ?`
    ).run(question, ts, ts, id)
  },
```

- [ ] **Step 5: Add submitResponse() method**

```typescript
  submitResponse(id: string, response: string): void {
    db().prepare(
      `UPDATE missions SET status = 'live', user_response = ?, questions = NULL, question_asked_at = NULL, updated_at = ? WHERE id = ?`
    ).run(response, now(), id)
  },
```

- [ ] **Step 6: Add setPendingReview() method**

```typescript
  setPendingReview(id: string, result: string, summary: string, costUsd: number): void {
    const ts = now()
    db().prepare(
      `UPDATE missions SET status = 'pending_review', result = ?, result_summary = ?, cost_usd = ?, completed_at = ?, updated_at = ? WHERE id = ?`
    ).run(result, summary, costUsd, ts, ts, id)
  },
```

- [ ] **Step 7: Add approve() and reject() methods**

```typescript
  approve(id: string): void {
    db().prepare(
      `UPDATE missions SET status = 'done', updated_at = ? WHERE id = ?`
    ).run(now(), id)
  },

  reject(id: string, reason: string): void {
    db().prepare(
      `UPDATE missions SET status = 'rejected', result = ?, updated_at = ? WHERE id = ?`
    ).run(reason, now(), id)
  },
```

- [ ] **Step 8: Add incrementRetry() method**

```typescript
  incrementRetry(id: string): number {
    db().prepare(
      `UPDATE missions SET retry_count = retry_count + 1, status = 'queued', updated_at = ? WHERE id = ?`
    ).run(now(), id)
    const row = missions.get(id)
    return row?.retryCount ?? 0
  },
```

- [ ] **Step 9: Add getAwaitingInput() for timeout checking**

```typescript
  getAwaitingInput(): MissionRecord[] {
    return db().prepare(
      `SELECT ${SELECT_FIELDS} FROM missions WHERE status = 'awaiting_input' ORDER BY question_asked_at ASC`
    ).all() as MissionRecord[]
  },
```

- [ ] **Step 10: Add resetStaleLive() for crash recovery**

```typescript
  resetStaleLive(olderThanMs: number): number {
    const cutoff = new Date(Date.now() - olderThanMs).toISOString()
    const result = db().prepare(
      `UPDATE missions SET status = 'queued', updated_at = ? WHERE status = 'live' AND started_at < ?`
    ).run(now(), cutoff)
    return result.changes
  },
```

- [ ] **Step 11: Build and verify**

Run: `cd packages/db && npm run build`
Expected: Compiles without errors

- [ ] **Step 12: Commit**

```bash
git add packages/db/src/repos/missions.ts
git commit -m "feat(db): extend missions repo with execution lifecycle methods"
```

---

### Task 4: Mission Executor — Single Mission Execution

**Files:**
- Create: `packages/core/src/missions/mission-executor.ts`

- [ ] **Step 1: Create the executor file**

```typescript
// packages/core/src/missions/mission-executor.ts

import { missions } from '@blade/db'
import { logger } from '@blade/shared'
import { executeEmployeeTask } from '../providers/auto-executor.js'
import type { MissionResult } from './types.js'

export interface ExecuteMissionOptions {
  missionId: string
  onClarificationNeeded?: (missionId: string, question: string) => Promise<void>
}

export async function executeMission(options: ExecuteMissionOptions): Promise<MissionResult> {
  const { missionId, onClarificationNeeded } = options
  const mission = missions.get(missionId)

  if (!mission) {
    throw new Error(`Mission ${missionId} not found`)
  }

  if (!mission.assignedEmployee) {
    throw new Error(`Mission ${missionId} has no assigned employee`)
  }

  logger.info('mission-executor', `Executing mission "${mission.title}" with ${mission.assignedEmployee}`)

  // Set status to live
  missions.start(missionId)

  const startTime = Date.now()

  try {
    // Build the prompt — include user response if resuming from clarification
    let prompt = `Mission: ${mission.title}`
    if (mission.description) {
      prompt += `\n\nDescription: ${mission.description}`
    }
    if (mission.userResponse) {
      prompt += `\n\nUser provided this clarification: ${mission.userResponse}`
    }
    prompt += `\n\nProvide your findings in a structured format:\n1. A 2-3 sentence summary\n2. Detailed findings\n3. Any relevant URLs, file paths, or artifacts\n4. Your confidence level (0.0-1.0) in the result`

    const result = await executeEmployeeTask({
      employeeSlug: mission.assignedEmployee,
      message: prompt,
      maxTurns: 15,
    })

    const durationMs = Date.now() - startTime
    const text = result.text ?? 'No output produced.'

    // Parse structured result from the employee's output
    const missionResult: MissionResult = {
      summary: extractSummary(text),
      findings: text,
      artifacts: extractArtifacts(text),
      confidence: extractConfidence(text),
      tokensUsed: result.inputTokens + result.outputTokens,
      costUsd: result.costUsd,
      employeeModel: result.model,
      durationMs,
    }

    return missionResult
  } catch (error: unknown) {
    const durationMs = Date.now() - startTime
    const msg = error instanceof Error ? error.message : String(error)
    logger.error('mission-executor', `Mission "${mission.title}" failed: ${msg}`)
    throw error
  }
}

function extractSummary(text: string): string {
  // Take the first 2-3 sentences as summary
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0)
  return sentences.slice(0, 3).join(' ').slice(0, 500)
}

function extractArtifacts(text: string): string[] {
  // Extract URLs and file paths
  const urlPattern = /https?:\/\/[^\s)>"]+/g
  const filePattern = /(?:^|\s)(\/[\w./-]+\.\w+)/gm
  const urls = text.match(urlPattern) ?? []
  const files = [...text.matchAll(filePattern)].map(m => m[1])
  return [...new Set([...urls, ...files])]
}

function extractConfidence(text: string): number {
  // Look for explicit confidence mention
  const match = text.match(/confidence[:\s]*([01]?\.\d+|[01])/i)
  if (match) {
    const val = parseFloat(match[1])
    if (val >= 0 && val <= 1) return val
  }
  return 0.7 // Default confidence if not stated
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd packages/core && npx tsc --noEmit`
Expected: No errors related to mission-executor.ts

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/missions/mission-executor.ts
git commit -m "feat(missions): add single mission executor"
```

---

### Task 5: Mission Worker — The Polling Loop

**Files:**
- Create: `packages/core/src/missions/mission-worker.ts`

- [ ] **Step 1: Create the worker file**

```typescript
// packages/core/src/missions/mission-worker.ts

import { missions } from '@blade/db'
import { logger } from '@blade/shared'
import { autoAssignMission } from './mission-router.js'
import { executeMission } from './mission-executor.js'
import type { MissionResult, WorkerConfig, DEFAULT_WORKER_CONFIG } from './types.js'

let workerInterval: ReturnType<typeof setInterval> | null = null
let isProcessing = false
const activeMissions = new Map<string, string>() // employeeSlug → missionId

export function startMissionWorker(config: WorkerConfig): void {
  if (workerInterval) {
    logger.warn('mission-worker', 'Worker already running')
    return
  }

  logger.info('mission-worker', `Starting mission worker (poll every ${config.pollIntervalMs}ms)`)

  // Crash recovery: reset stale live missions
  const resetCount = missions.resetStaleLive(15 * 60 * 1000) // 15 min timeout
  if (resetCount > 0) {
    logger.info('mission-worker', `Reset ${resetCount} stale live missions to queued`)
  }

  workerInterval = setInterval(() => {
    if (!isProcessing) {
      processQueue(config).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        logger.error('mission-worker', `Queue processing error: ${msg}`)
      })
    }
  }, config.pollIntervalMs)

  // Also check for clarification timeouts
  setInterval(() => {
    checkClarificationTimeouts(config).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('mission-worker', `Clarification timeout check error: ${msg}`)
    })
  }, 30_000) // Check every 30 seconds

  // Graceful shutdown
  const shutdown = (): void => {
    stopMissionWorker()
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

export function stopMissionWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval)
    workerInterval = null
    logger.info('mission-worker', 'Worker stopped')
  }
}

async function processQueue(config: WorkerConfig): Promise<void> {
  isProcessing = true

  try {
    // Get employees that are currently busy
    const busyEmployees = [...activeMissions.keys()]

    // Find next queued mission for an idle employee
    const mission = missions.getNextQueued(busyEmployees)
    if (!mission) return

    // Track this employee as busy
    activeMissions.set(mission.assignedEmployee!, mission.id)

    logger.info('mission-worker', `Picked up mission "${mission.title}" for ${mission.assignedEmployee}`)

    // Notify via Telegram
    await config.notifyTelegram(
      `[${mission.assignedEmployee}] Starting: ${mission.title}`
    ).catch(() => {})

    try {
      const result = await executeMission({
        missionId: mission.id,
        onClarificationNeeded: async (missionId, question) => {
          missions.setAwaitingInput(missionId, question)
          activeMissions.delete(mission.assignedEmployee!)
          await config.notifyTelegram(
            `[${mission.assignedEmployee}] Question on "${mission.title}": ${question}`
          ).catch(() => {})
        },
      })

      // Store result
      const resultJson = JSON.stringify(result)
      const priority = parsePriority(mission.priority)

      if (priority >= 6) {
        // High priority: pending review
        missions.setPendingReview(mission.id, resultJson, result.summary, result.costUsd)

        const dashboardLink = `${config.dashboardUrl}/missions`
        await config.notifyTelegram(
          `[${mission.assignedEmployee}] Completed: ${mission.title}\n\n` +
          `Summary: ${result.summary}\n\n` +
          `Cost: $${result.costUsd.toFixed(4)} | Confidence: ${(result.confidence * 100).toFixed(0)}%\n\n` +
          `Review: ${dashboardLink}`
        ).catch(() => {})
      } else {
        // Low priority: auto-complete
        missions.complete(mission.id, resultJson, result.summary, result.costUsd)

        await config.notifyTelegram(
          `[${mission.assignedEmployee}] Done: ${mission.title} — ` +
          `${result.artifacts.length} artifacts, $${result.costUsd.toFixed(4)} cost`
        ).catch(() => {})
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)

      // Retry logic
      const retryCount = missions.incrementRetry(mission.id)
      if (retryCount >= config.maxRetriesPerMission) {
        missions.fail(mission.id, msg)
        await config.notifyTelegram(
          `[${mission.assignedEmployee}] Failed: ${mission.title} — ${msg}`
        ).catch(() => {})
      } else {
        logger.warn('mission-worker', `Mission "${mission.title}" failed (attempt ${retryCount}/${config.maxRetriesPerMission}), requeueing`)
      }
    } finally {
      activeMissions.delete(mission.assignedEmployee!)
    }
  } finally {
    isProcessing = false
  }
}

async function checkClarificationTimeouts(config: WorkerConfig): Promise<void> {
  const awaiting = missions.getAwaitingInput()

  for (const mission of awaiting) {
    if (!mission.questionAskedAt) continue

    const askedAt = new Date(mission.questionAskedAt).getTime()
    const elapsed = Date.now() - askedAt

    if (elapsed >= config.clarificationTimeoutMs) {
      // Re-notify — dashboard banner will pick this up via polling
      logger.info('mission-worker', `Clarification timeout for mission "${mission.title}" — re-notifying`)
      await config.notifyTelegram(
        `[Reminder] ${mission.assignedEmployee} is still waiting for your response on "${mission.title}": ${mission.questions}`
      ).catch(() => {})
    }
  }
}

function parsePriority(priority: string): number {
  const num = parseInt(priority, 10)
  if (!isNaN(num)) return num
  const map: Record<string, number> = { critical: 10, high: 8, medium: 5, low: 2 }
  return map[priority.toLowerCase()] ?? 5
}
```

- [ ] **Step 2: Create the barrel export**

Add to `packages/core/src/missions/index.ts` (create if it doesn't exist):

```typescript
// packages/core/src/missions/index.ts
export { startMissionWorker, stopMissionWorker } from './mission-worker.js'
export { executeMission } from './mission-executor.js'
export { autoAssignMission } from './mission-router.js'
export type { MissionResult, WorkerConfig } from './types.js'
```

- [ ] **Step 3: Verify the file compiles**

Run: `cd packages/core && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/missions/mission-worker.ts packages/core/src/missions/index.ts
git commit -m "feat(missions): add polling worker with concurrency and retry logic"
```

---

### Task 6: API Routes — Approve, Reject, Respond

**Files:**
- Create: `apps/web/src/app/api/missions/[id]/approve/route.ts`
- Create: `apps/web/src/app/api/missions/[id]/reject/route.ts`
- Create: `apps/web/src/app/api/missions/[id]/respond/route.ts`

- [ ] **Step 1: Create approve route**

```typescript
// apps/web/src/app/api/missions/[id]/approve/route.ts
import { NextRequest } from 'next/server'
import { initializeDb, missions, activityEvents } from '@blade/db'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = requireAuth(req)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    const { id } = await params
    initializeDb()

    const mission = missions.get(id)
    if (!mission) {
      return Response.json({ success: false, error: 'Mission not found' }, { status: 404 })
    }
    if (mission.status !== 'pending_review') {
      return Response.json({ success: false, error: `Cannot approve mission with status "${mission.status}"` }, { status: 400 })
    }

    missions.approve(id)

    activityEvents.emit({
      eventType: 'mission_approved',
      actorType: 'user',
      actorId: 'user',
      summary: `Mission approved: ${mission.title}`,
      targetType: 'mission',
      targetId: id,
    })

    return Response.json({ success: true, data: missions.get(id) })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to approve mission'
    logger.error('Missions', `approve error: ${msg}`)
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create reject route**

```typescript
// apps/web/src/app/api/missions/[id]/reject/route.ts
import { NextRequest } from 'next/server'
import { initializeDb, missions, activityEvents } from '@blade/db'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = requireAuth(req)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    const { id } = await params
    const body = await req.json()
    const { reason } = body as { reason?: string }

    initializeDb()

    const mission = missions.get(id)
    if (!mission) {
      return Response.json({ success: false, error: 'Mission not found' }, { status: 404 })
    }
    if (mission.status !== 'pending_review') {
      return Response.json({ success: false, error: `Cannot reject mission with status "${mission.status}"` }, { status: 400 })
    }

    missions.reject(id, reason ?? 'Rejected by user')

    activityEvents.emit({
      eventType: 'mission_rejected',
      actorType: 'user',
      actorId: 'user',
      summary: `Mission rejected: ${mission.title}${reason ? ` — ${reason}` : ''}`,
      targetType: 'mission',
      targetId: id,
    })

    return Response.json({ success: true, data: missions.get(id) })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to reject mission'
    logger.error('Missions', `reject error: ${msg}`)
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}
```

- [ ] **Step 3: Create respond route**

```typescript
// apps/web/src/app/api/missions/[id]/respond/route.ts
import { NextRequest } from 'next/server'
import { initializeDb, missions, activityEvents } from '@blade/db'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = requireAuth(req)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    const { id } = await params
    const body = await req.json()
    const { response } = body as { response?: string }

    if (!response) {
      return Response.json({ success: false, error: 'response is required' }, { status: 400 })
    }

    initializeDb()

    const mission = missions.get(id)
    if (!mission) {
      return Response.json({ success: false, error: 'Mission not found' }, { status: 404 })
    }
    if (mission.status !== 'awaiting_input') {
      return Response.json({ success: false, error: `Mission is not awaiting input (status: "${mission.status}")` }, { status: 400 })
    }

    missions.submitResponse(id, response)

    activityEvents.emit({
      eventType: 'mission_response_submitted',
      actorType: 'user',
      actorId: 'user',
      summary: `Responded to ${mission.assignedEmployee}'s question on: ${mission.title}`,
      targetType: 'mission',
      targetId: id,
    })

    return Response.json({ success: true, data: missions.get(id) })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to submit response'
    logger.error('Missions', `respond error: ${msg}`)
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}
```

- [ ] **Step 4: Verify build**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors in the new route files

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/missions/\[id\]/approve/route.ts apps/web/src/app/api/missions/\[id\]/reject/route.ts apps/web/src/app/api/missions/\[id\]/respond/route.ts
git commit -m "feat(api): add mission approve, reject, and respond endpoints"
```

---

### Task 7: Wire Worker into Telegram Service

**Files:**
- Modify: `apps/telegram/src/index.ts`

- [ ] **Step 1: Import the worker**

Add near the top imports of `apps/telegram/src/index.ts`:

```typescript
import { startMissionWorker } from '@blade/core/missions'
```

Note: If the barrel export doesn't resolve, use:
```typescript
import { startMissionWorker } from '../../../packages/core/src/missions/mission-worker.js'
```

- [ ] **Step 2: Start the worker after the bot starts**

Add after the `startTelegramBot()` call in the `main()` function, before the shutdown handlers:

```typescript
  // Start mission execution worker
  const sendTelegramNotification = async (message: string): Promise<void> => {
    try {
      const chatId = allowedChatIds[0] // Primary user
      if (chatId) {
        await bot.sendMessage(chatId, message)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.warn('telegram', `Failed to send mission notification: ${msg}`)
    }
  }

  startMissionWorker({
    pollIntervalMs: 10_000,
    clarificationTimeoutMs: 5 * 60 * 1000,
    maxRetriesPerMission: 3,
    defaultCostBudget: 1.0,
    dashboardUrl: process.env.DASHBOARD_URL ?? 'http://localhost:5174',
    notifyTelegram: sendTelegramNotification,
  })
  logger.info('telegram', 'Mission worker started')
```

- [ ] **Step 3: Add worker shutdown to the shutdown handler**

Update the existing `shutdown` function:

```typescript
  const shutdown = (): void => {
    logger.info('telegram', 'Shutting down...')
    stopMissionWorker()
    bot.stopPolling()
    process.exit(0)
  }
```

Add the import for `stopMissionWorker`:

```typescript
import { startMissionWorker, stopMissionWorker } from '@blade/core/missions'
```

- [ ] **Step 4: Build and verify**

Run: `cd packages/core && npm run build && cd ../../apps/telegram && npm run build`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add apps/telegram/src/index.ts
git commit -m "feat(telegram): wire mission worker into bot startup"
```

---

### Task 8: Dashboard — Add Approve/Reject/Respond to Store and API Client

**Files:**
- Modify: `apps/command/src/lib/api.ts`
- Modify: `apps/command/src/stores/blade-store.ts`

- [ ] **Step 1: Add new API methods to api.ts**

Add to the `api` object in `apps/command/src/lib/api.ts`:

```typescript
  approveMission: (id: string) =>
    apiFetch<Mission>(`/api/missions/${id}/approve`, { method: "POST" }),

  rejectMission: (id: string, reason: string) =>
    apiFetch<Mission>(`/api/missions/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),

  respondToMission: (id: string, response: string) =>
    apiFetch<Mission>(`/api/missions/${id}/respond`, {
      method: "POST",
      body: JSON.stringify({ response }),
    }),
```

- [ ] **Step 2: Add actions to blade-store.ts**

Add to the `BladeState` interface:

```typescript
  approveMission: (id: string) => Promise<void>;
  rejectMission: (id: string, reason: string) => Promise<void>;
  respondToMission: (id: string, response: string) => Promise<void>;
```

Add implementations to the store:

```typescript
  approveMission: async (id) => {
    try {
      await api.approveMission(id)
      await get().fetchMissions()
    } catch (e) {
      console.error("approveMission failed", e)
      throw e
    }
  },

  rejectMission: async (id, reason) => {
    try {
      await api.rejectMission(id, reason)
      await get().fetchMissions()
    } catch (e) {
      console.error("rejectMission failed", e)
      throw e
    }
  },

  respondToMission: async (id, response) => {
    try {
      await api.respondToMission(id, response)
      await get().fetchMissions()
    } catch (e) {
      console.error("respondToMission failed", e)
      throw e
    }
  },
```

- [ ] **Step 3: Update the statusKey function in MissionsPage.tsx**

Update the `statusKey` function to handle new statuses:

```typescript
function statusKey(m: Mission): "queued" | "progress" | "review" | "input" | "done" | "failed" {
  const s = m.status?.toLowerCase() ?? "queued";
  if (s === "done" || s === "completed") return "done";
  if (s === "failed" || s === "error" || s === "rejected") return "failed";
  if (s === "pending_review") return "review";
  if (s === "awaiting_input") return "input";
  if (s === "queued" || s === "pending") return "queued";
  return "progress";
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/command/src/lib/api.ts apps/command/src/stores/blade-store.ts apps/command/src/components/blade/MissionsPage.tsx
git commit -m "feat(dashboard): add mission approve/reject/respond actions and new status columns"
```

---

### Task 9: Build, Deploy, and Verify

- [ ] **Step 1: Full build**

```bash
cd /Users/emekaajufo/Blade\ Super\ Agent && npx turbo build
```

Expected: All packages compile successfully

- [ ] **Step 2: Test the worker locally**

Start the Telegram service locally:
```bash
cd apps/telegram && node dist/index.js
```

Look for log output:
```
[mission-worker] Starting mission worker (poll every 10000ms)
```

- [ ] **Step 3: Test mission creation and execution**

Create a test mission via curl:
```bash
curl -s https://blade-web-production.up.railway.app/api/missions \
  -H "Authorization: Bearer blade-cmd-d0bf9fa35e6c01a184c07314d0da0a28" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test mission: what is 2+2?","description":"Simple math test","priority":"3"}' | python3 -m json.tool
```

Then assign it:
```bash
curl -s https://blade-web-production.up.railway.app/api/missions/assign \
  -H "Authorization: Bearer blade-cmd-d0bf9fa35e6c01a184c07314d0da0a28" \
  -H "Content-Type: application/json" \
  -d '{"missionId":"<ID_FROM_ABOVE>"}' | python3 -m json.tool
```

Expected: Worker picks it up within 10 seconds, executes, stores result, sends Telegram notification

- [ ] **Step 4: Test approval flow**

Create a high-priority mission:
```bash
curl -s https://blade-web-production.up.railway.app/api/missions \
  -H "Authorization: Bearer blade-cmd-d0bf9fa35e6c01a184c07314d0da0a28" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test high-priority mission","priority":"8"}' | python3 -m json.tool
```

Expected: After execution, status should be `pending_review`. Then approve:
```bash
curl -s -X POST https://blade-web-production.up.railway.app/api/missions/<ID>/approve \
  -H "Authorization: Bearer blade-cmd-d0bf9fa35e6c01a184c07314d0da0a28" | python3 -m json.tool
```

Expected: Status changes to `done`

- [ ] **Step 5: Commit final state**

```bash
git add -A
git commit -m "feat(missions): complete mission execution engine — worker, executor, API routes, dashboard integration"
```
