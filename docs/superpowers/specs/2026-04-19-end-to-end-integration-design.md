# End-to-End Integration — Design Spec

**Date:** 2026-04-19
**Status:** Draft
**Scope:** Part 4 of 4 — Command Center upgrade series
**Depends on:** Part 1 (Mission Execution Engine), Part 2 (Voice Agent), Part 3 (Dashboard Parity)

## Problem

Voice, dashboard, and Telegram are three separate interfaces that happen to share a database. There is no guarantee that creating a mission from voice produces the same behavior as creating one from Telegram. Notifications don't route consistently. The dashboard doesn't reflect what's happening in real-time. The system feels like three disconnected tools instead of one platform.

## Goal

Make it so the channel you use doesn't matter. Voice, dashboard chat, and Telegram all produce identical mission behavior, consistent notifications, and the same result experience. The integration test is: can you start work on one channel and finish it on another without friction?

## Design

### 1. Channel-Agnostic Mission Creation

All three channels create missions through the same path.

**Flow (identical for all channels):**

```
User intent → Conversation Engine → create_mission tool → missions.create() → Mission Worker picks up
```

| Channel | How it reaches the conversation engine |
|---------|---------------------------------------|
| Voice | Gemini calls `create_mission` tool in `tools.py` → `POST /api/missions` |
| Dashboard chat | User types in command bar → `POST /api/chat` → agent loop calls `create_mission` tool → `missions.create()` |
| Telegram | User sends message → `telegram-bot.ts` → agent loop calls `create_mission` tool → `missions.create()` |

**Key constraint:** The `create_mission` tool is the single entry point. No channel-specific mission creation logic. The tool stores the `channel` field on the mission row for audit purposes, but it doesn't affect execution.

**Mission row additions:**

```sql
ALTER TABLE missions ADD COLUMN source_channel TEXT DEFAULT 'unknown';  -- 'voice' | 'dashboard' | 'telegram'
ALTER TABLE missions ADD COLUMN conversation_id TEXT;                    -- Links back to the conversation that created it
```

### 2. Notification Routing

When a mission event occurs, notifications are sent to all active channels.

**Notification events:**

| Event | Telegram | Voice | Dashboard |
|-------|----------|-------|-----------|
| Mission started | Message | Silent (briefing catches it) | Status update on kanban |
| Mission completed (auto, priority 1-5) | Summary message | Silent | Status update on kanban |
| Mission needs review (priority 6-10) | Summary + dashboard link | Spoken interrupt (if session active) | Banner + approve/reject on card |
| Mission failed | Error message | Spoken interrupt (if session active) | Banner + status update |
| Clarification needed | Question message (reply to answer) | Spoken interrupt (if session active) | Pulsing card + input field |
| Clarification timeout (5 min) | Repeat message | Spoken reminder | Banner escalation |

**Implementation — Notification dispatcher:**

```typescript
// packages/core/src/missions/notification-dispatcher.ts

interface NotificationTarget {
  telegram: boolean    // Always true
  voice: boolean       // True only if voice session is active
  dashboard: boolean   // Always true (handled by polling)
}

interface MissionNotification {
  eventType: string
  missionId: string
  title: string
  summary: string
  priority: number
  assignedEmployee: string
  dashboardUrl: string
}

async function dispatchNotification(
  notification: MissionNotification,
  targets: NotificationTarget
): Promise<void> {
  // Telegram — always
  if (targets.telegram) {
    await sendTelegramNotification(notification)
  }

  // Voice — only if active session
  if (targets.voice) {
    await pushVoiceInterrupt(notification)
  }

  // Dashboard — store in notifications table for polling
  await storeNotification(notification)
}
```

**Voice session detection:** The voice agent registers itself as active when a LiveKit session starts (writes a row to a `voice_sessions` table or a simple flag in Redis/memory). The notification dispatcher checks this flag before attempting a voice interrupt.

**Dashboard notifications:** Stored in a `notifications` table, polled by the dashboard every 10 seconds alongside missions. Dismissed when read.

### 3. Dashboard Real-Time Updates

**Polling strategy (v1):**
- `/api/missions` polled every 10 seconds (existing)
- `/api/notifications` polled every 10 seconds (new)
- Dashboard Zustand store merges updates, triggers re-renders

**Kanban card states:**

| Status | Card appearance |
|--------|----------------|
| `queued` | Grey card, waiting indicator |
| `live` | Blue border, spinner, employee avatar |
| `awaiting_input` | Orange pulsing border, question text, input field |
| `pending_review` | Green border, "Review" badge, approve/reject buttons |
| `done` | Muted card, checkmark, click to view result |
| `failed` | Red border, error icon, click to view details |
| `rejected` | Muted card with strikethrough, reason shown |

**Banner notifications:**
- Fixed position banner at top of dashboard (below the header)
- Shows for: `awaiting_input` (after 5 min timeout), `pending_review`, `failed`
- Each banner has an action button (respond / approve / view)
- Dismissible, auto-dismiss after action taken

### 4. Mission Detail Drawer

Clicking any mission card opens a detail drawer from the right side (same pattern as chat drawer).

**Contents:**

```
┌─────────────────────────────────────┐
│ Research Competitor Pricing          │
│ Priority: 8  ·  Nova  ·  2m 34s     │
│ Created via [voice]                  │
├─────────────────────────────────────┤
│ Summary                              │
│ Found 5 direct competitors with...   │
├─────────────────────────────────────┤
│ Full Findings                        │
│ [expandable section with full text]  │
├─────────────────────────────────────┤
│ Artifacts                            │
│ • https://competitor-a.com/pricing   │
│ • https://competitor-b.com/plans     │
├─────────────────────────────────────┤
│ Confidence: 0.85  ·  Cost: $0.04    │
│ Tokens: 12,450  ·  Model: sonnet    │
├─────────────────────────────────────┤
│ [Approve]  [Reject with reason]      │
└─────────────────────────────────────┘
```

For `awaiting_input` missions, the bottom section shows:

```
┌─────────────────────────────────────┐
│ Nova is asking:                      │
│ "Which competitors should I focus    │
│  on — US only or global?"            │
│                                      │
│ [text input field]  [Send Response]  │
└─────────────────────────────────────┘
```

**Component:** `MissionDetailDrawer.tsx`

### 5. Cross-Channel Conversation Continuity

When a mission is created from a conversation, the `conversation_id` is stored on the mission. This enables:

- Dashboard chat: "What happened with that research mission?" → Blade knows which mission you mean from conversation context
- Telegram: "Approve the last mission" → resolves from conversation history
- Voice: "What did Nova find?" → Gemini checks recent missions from the current user

**No new infrastructure needed.** The conversation engine already tracks conversation IDs. The mission just stores which conversation created it.

### 6. Integration Test Flows

These flows must produce identical behavior regardless of channel:

**Flow 1: Create → Execute → Auto-complete**
1. User says/types "Check my ad spend for this month" (any channel)
2. Gemini answers directly via `meta_account_performance` tool (not a mission — simple query)
3. Result spoken/displayed immediately

**Flow 2: Create → Execute → Review → Approve**
1. User says/types "Research competitor pricing for IV Wellness" (any channel)
2. Gemini creates mission (priority 7), dispatches to Nova
3. Mission worker picks up within 10 seconds
4. Nova executes: web search, analysis, structured result
5. Status moves: queued → live → pending_review
6. Telegram: summary + dashboard link
7. Voice (if active): "Nova finished the competitor research. 5 competitors found. Ready for your review."
8. Dashboard: kanban card shows "Review" badge with approve/reject
9. User approves from any channel → status = done

**Flow 3: Create → Clarification → Resume → Complete**
1. User creates mission "Analyze our funnel performance" (any channel)
2. Employee starts, realizes it needs to know which funnel
3. Status → awaiting_input, question sent to Telegram
4. 5 minutes pass with no response → banner appears on dashboard
5. User responds from dashboard input field
6. Employee resumes, completes, auto-approves (priority 4)

**Flow 4: Cross-channel handoff**
1. User creates mission from Telegram on phone
2. Opens dashboard on laptop, sees mission in "Live" on kanban
3. Mission completes, notification appears on dashboard
4. User approves from dashboard
5. Telegram receives "Mission approved" confirmation

## New Database Schema

**Notifications table:**

```sql
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,              -- 'mission_review', 'mission_failed', 'mission_input', 'escalation'
  mission_id TEXT,
  title TEXT NOT NULL,
  body TEXT,
  action_url TEXT,                 -- Dashboard deep link
  read INTEGER DEFAULT 0,
  dismissed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
```

**Voice sessions tracking:**

```sql
CREATE TABLE voice_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  room_name TEXT,
  started_at TEXT DEFAULT (datetime('now')),
  ended_at TEXT,
  is_active INTEGER DEFAULT 1
);
```

**Mission table additions (from section 1):**

```sql
ALTER TABLE missions ADD COLUMN source_channel TEXT DEFAULT 'unknown';
ALTER TABLE missions ADD COLUMN conversation_id TEXT;
```

## Files to Create

**Backend:**
- `packages/core/src/missions/notification-dispatcher.ts` — Routes notifications to all active channels
- `apps/web/src/app/api/notifications/route.ts` — GET notifications for dashboard polling
- `apps/web/src/app/api/notifications/[id]/dismiss/route.ts` — Dismiss a notification
- `packages/db/src/migrations/0027-notifications.ts` — Notifications table
- `packages/db/src/migrations/0028-voice-sessions.ts` — Voice sessions table
- `packages/db/src/migrations/0029-mission-source.ts` — source_channel and conversation_id columns
- `packages/db/src/repos/notifications.ts` — Notification CRUD

**Frontend:**
- `apps/command/src/components/blade/MissionDetailDrawer.tsx` — Full mission result view
- `apps/command/src/components/blade/NotificationBanner.tsx` — Top-of-page urgent notifications
- `apps/command/src/components/blade/MissionCard.tsx` — Enhanced kanban card with status-specific UI

**Modify:**
- `apps/command/src/components/blade/MissionsPage.tsx` — Add new kanban columns, card states, detail drawer
- `apps/command/src/stores/blade-store.ts` — Add notifications state, mission detail actions, polling
- `livekit-agent/agent.py` — Register/deregister voice session on connect/disconnect
- `packages/core/src/missions/mission-worker.ts` — Call notification dispatcher on status changes
- `packages/conversation/src/engine.ts` — Pass conversation_id to mission creation

## Out of Scope (v1)

- Live progress streaming (SSE/WebSocket for real-time build log)
- Mission dependency chains
- Dashboard push notifications (browser Notification API)
- Mobile-responsive dashboard layout
- Mission analytics (average completion time, success rates by employee)

## Success Criteria

1. Create mission from voice → see it on dashboard kanban within 10 seconds
2. Create mission from dashboard chat → receive Telegram notification when complete
3. Create mission from Telegram → approve from dashboard
4. All three flows produce identical mission rows and results
5. `pending_review` missions show approve/reject inline on the kanban card
6. `awaiting_input` missions show the question with input on dashboard after 5-minute timeout
7. Banner notifications appear for urgent items across all pages
8. Mission detail drawer shows full structured result with artifacts
9. Voice agent interrupts with mission events during active session
10. Polling updates dashboard every 10 seconds without page refresh
