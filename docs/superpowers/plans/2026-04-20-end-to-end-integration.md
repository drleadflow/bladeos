# End-to-End Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all three channels (voice, dashboard, Telegram) produce identical mission behavior with consistent notifications, a mission detail drawer, and notification banners.

**Architecture:** The notifications table and API already exist (`notifications.create()`, `GET /api/notifications`). We add: a notification dispatcher called by the mission worker, a MissionDetailDrawer component, a NotificationBanner component, enhanced MissionCard states, dashboard polling for notifications, and a DB migration for source_channel on missions.

**Tech Stack:** TypeScript (ESM), React 19, Zustand, Framer Motion, Tailwind CSS

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/db/src/migrations/0029_mission_source.sql` | Create | Add source_channel + conversation_id to missions |
| `packages/core/src/missions/notification-dispatcher.ts` | Create | Route notifications to notifications table + Telegram |
| `packages/core/src/missions/mission-worker.ts` | Modify | Use notification dispatcher instead of direct Telegram calls |
| `apps/command/src/components/blade/MissionDetailDrawer.tsx` | Create | Full mission result view with approve/reject/respond |
| `apps/command/src/components/blade/NotificationBanner.tsx` | Create | Top-of-page urgent notification bar |
| `apps/command/src/components/blade/MissionCard.tsx` | Create | Enhanced kanban card with status-specific UI |
| `apps/command/src/components/blade/MissionsPage.tsx` | Modify | Use new MissionCard, add detail drawer, new kanban columns |
| `apps/command/src/stores/blade-store.ts` | Modify | Add notifications polling, selected mission state |
| `apps/command/src/components/blade/AppShell.tsx` | Modify | Mount NotificationBanner |

---

### Task 1: DB Migration — Source Channel

**Files:**
- Create: `packages/db/src/migrations/0029_mission_source.sql`

- [ ] **Step 1: Create the migration**

```sql
-- 0029_mission_source.sql
-- Track which channel created each mission and link to conversation

ALTER TABLE missions ADD COLUMN source_channel TEXT DEFAULT 'unknown';
ALTER TABLE missions ADD COLUMN conversation_id TEXT;
```

- [ ] **Step 2: Commit**

```bash
git add packages/db/src/migrations/0029_mission_source.sql
git commit -m "feat(db): add source_channel and conversation_id to missions"
```

---

### Task 2: Notification Dispatcher

**Files:**
- Create: `packages/core/src/missions/notification-dispatcher.ts`

- [ ] **Step 1: Create the dispatcher**

```typescript
// packages/core/src/missions/notification-dispatcher.ts

import { notifications } from '@blade/db'
import { logger } from '@blade/shared'

export interface MissionNotification {
  eventType: string
  missionId: string
  title: string
  summary: string
  priority: number
  assignedEmployee: string
  dashboardUrl: string
}

export interface DispatcherConfig {
  notifyTelegram: (message: string) => Promise<void>
  dashboardUrl: string
}

let dispatcherConfig: DispatcherConfig | null = null

export function initDispatcher(config: DispatcherConfig): void {
  dispatcherConfig = config
}

export async function dispatchMissionNotification(notification: MissionNotification): Promise<void> {
  const { eventType, missionId, title, summary, assignedEmployee, dashboardUrl } = notification

  // 1. Always store in notifications table (dashboard polls this)
  const typeMap: Record<string, string> = {
    mission_started: 'info',
    mission_completed: 'info',
    mission_pending_review: 'mission_review',
    mission_failed: 'mission_failed',
    mission_awaiting_input: 'mission_input',
    mission_approved: 'info',
    mission_rejected: 'info',
  }

  notifications.create({
    title: `[${assignedEmployee}] ${eventType.replace('mission_', '').replace('_', ' ')}`,
    message: `${title}: ${summary}`,
    type: typeMap[eventType] ?? 'info',
    employeeSlug: assignedEmployee,
  })

  // 2. Send to Telegram
  if (!dispatcherConfig) {
    logger.warn('notification-dispatcher', 'Dispatcher not initialized — skipping Telegram')
    return
  }

  let telegramMessage = ''

  switch (eventType) {
    case 'mission_started':
      telegramMessage = `[${assignedEmployee}] Starting: ${title}`
      break
    case 'mission_completed':
      telegramMessage = `[${assignedEmployee}] Done: ${title} — ${summary}`
      break
    case 'mission_pending_review':
      telegramMessage = [
        `[${assignedEmployee}] Completed: ${title}`,
        '',
        `Summary: ${summary}`,
        '',
        `Review: ${dashboardUrl}/missions`,
      ].join('\n')
      break
    case 'mission_failed':
      telegramMessage = `[${assignedEmployee}] Failed: ${title} — ${summary}`
      break
    case 'mission_awaiting_input':
      telegramMessage = `[${assignedEmployee}] Question on "${title}": ${summary}`
      break
    default:
      telegramMessage = `[${assignedEmployee}] ${eventType}: ${title}`
  }

  await dispatcherConfig.notifyTelegram(telegramMessage).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn('notification-dispatcher', `Telegram send failed: ${msg}`)
  })
}
```

- [ ] **Step 2: Export from index.ts**

Add to `packages/core/src/missions/index.ts`:

```typescript
export { initDispatcher, dispatchMissionNotification } from './notification-dispatcher.js'
export type { MissionNotification, DispatcherConfig } from './notification-dispatcher.js'
```

- [ ] **Step 3: Build and verify**

Run: `cd packages/core && npm run build`

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/missions/notification-dispatcher.ts packages/core/src/missions/index.ts
git commit -m "feat(missions): add notification dispatcher for cross-channel routing"
```

---

### Task 3: Wire Dispatcher into Mission Worker

**Files:**
- Modify: `packages/core/src/missions/mission-worker.ts`

- [ ] **Step 1: Import and use dispatcher**

Read `mission-worker.ts`. Replace the direct `config.notifyTelegram(...)` calls with `dispatchMissionNotification(...)` calls.

Add import:
```typescript
import { initDispatcher, dispatchMissionNotification } from './notification-dispatcher.js'
```

In `startMissionWorker`, add after the crash recovery:
```typescript
  initDispatcher({
    notifyTelegram: config.notifyTelegram,
    dashboardUrl: config.dashboardUrl,
  })
```

Replace each `await config.notifyTelegram(...)` call with a `dispatchMissionNotification(...)` call:

For "Starting" notification:
```typescript
    await dispatchMissionNotification({
      eventType: 'mission_started',
      missionId: mission.id,
      title: mission.title,
      summary: '',
      priority: parsePriority(mission.priority),
      assignedEmployee: mission.assignedEmployee!,
      dashboardUrl: config.dashboardUrl,
    })
```

For pending review:
```typescript
    await dispatchMissionNotification({
      eventType: 'mission_pending_review',
      missionId: mission.id,
      title: mission.title,
      summary: result.summary,
      priority: parsePriority(mission.priority),
      assignedEmployee: mission.assignedEmployee!,
      dashboardUrl: config.dashboardUrl,
    })
```

For auto-complete:
```typescript
    await dispatchMissionNotification({
      eventType: 'mission_completed',
      missionId: mission.id,
      title: mission.title,
      summary: `${result.artifacts.length} artifacts, $${result.costUsd.toFixed(4)} cost`,
      priority: parsePriority(mission.priority),
      assignedEmployee: mission.assignedEmployee!,
      dashboardUrl: config.dashboardUrl,
    })
```

For failure:
```typescript
    await dispatchMissionNotification({
      eventType: 'mission_failed',
      missionId: mission.id,
      title: mission.title,
      summary: msg,
      priority: parsePriority(mission.priority),
      assignedEmployee: mission.assignedEmployee!,
      dashboardUrl: config.dashboardUrl,
    })
```

- [ ] **Step 2: Build and verify**

Run: `cd packages/core && npm run build`

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/missions/mission-worker.ts
git commit -m "feat(missions): wire notification dispatcher into worker"
```

---

### Task 4: MissionDetailDrawer Component

**Files:**
- Create: `apps/command/src/components/blade/MissionDetailDrawer.tsx`

- [ ] **Step 1: Create the drawer**

```tsx
// apps/command/src/components/blade/MissionDetailDrawer.tsx
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Check, XCircle, Send, ExternalLink } from "lucide-react";
import { ChannelBadge } from "./ChannelBadge";
import { useBladeStore } from "@/stores/blade-store";
import type { Mission } from "@/lib/api";

interface MissionDetailDrawerProps {
  mission: Mission | null;
  onClose: () => void;
}

function parseResult(result: string | null | undefined): {
  summary: string; findings: string; artifacts: string[]; confidence: number; costUsd: number; tokensUsed: number; employeeModel: string; durationMs: number;
} | null {
  if (!result) return null;
  try {
    return JSON.parse(result);
  } catch {
    return { summary: result.slice(0, 300), findings: result, artifacts: [], confidence: 0, costUsd: 0, tokensUsed: 0, employeeModel: "unknown", durationMs: 0 };
  }
}

export function MissionDetailDrawer({ mission, onClose }: MissionDetailDrawerProps) {
  const approveMission = useBladeStore((s) => s.approveMission);
  const rejectMission = useBladeStore((s) => s.rejectMission);
  const respondToMission = useBladeStore((s) => s.respondToMission);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [responseText, setResponseText] = useState("");
  const [acting, setActing] = useState(false);

  if (!mission) return null;

  const parsed = parseResult(mission.result);
  const duration = parsed?.durationMs ? `${(parsed.durationMs / 1000).toFixed(1)}s` : "—";

  const handleApprove = async () => {
    setActing(true);
    try { await approveMission(mission.id); onClose(); } catch { /* toast */ }
    setActing(false);
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    setActing(true);
    try { await rejectMission(mission.id, rejectReason); onClose(); } catch { /* toast */ }
    setActing(false);
  };

  const handleRespond = async () => {
    if (!responseText.trim()) return;
    setActing(true);
    try { await respondToMission(mission.id, responseText); onClose(); } catch { /* toast */ }
    setActing(false);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: 420, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 420, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="fixed right-0 top-0 z-50 flex h-screen w-[420px] flex-col border-l border-[var(--blade-border)] bg-[#0a0a0f]/95 backdrop-blur-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--blade-border)] px-4 py-3">
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/60">mission detail</div>
          <button onClick={onClose} className="text-white/40 hover:text-white/80"><X size={16} /></button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Title + meta */}
          <div>
            <div className="font-mono text-sm text-white">{mission.title}</div>
            <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-white/40">
              <span>Priority: {mission.priority}</span>
              <span>·</span>
              <span>{mission.assignedEmployee ?? "unassigned"}</span>
              <span>·</span>
              <span>{duration}</span>
              {mission.sourceChannel && (
                <>
                  <span>·</span>
                  <ChannelBadge channel={mission.sourceChannel} />
                </>
              )}
            </div>
            <div className="mt-1 inline-block rounded-sm border border-white/10 px-1.5 py-0.5 font-mono text-[9px] uppercase text-white/50">
              {mission.status}
            </div>
          </div>

          {/* Description */}
          {mission.description && (
            <div>
              <div className="font-mono text-[9px] uppercase tracking-wider text-white/30 mb-1">Description</div>
              <div className="text-sm text-white/70">{mission.description}</div>
            </div>
          )}

          {/* Result */}
          {parsed && (
            <>
              <div>
                <div className="font-mono text-[9px] uppercase tracking-wider text-white/30 mb-1">Summary</div>
                <div className="text-sm text-white/80">{parsed.summary}</div>
              </div>

              <div>
                <div className="font-mono text-[9px] uppercase tracking-wider text-white/30 mb-1">Full Findings</div>
                <div className="max-h-48 overflow-y-auto rounded-md bg-white/5 p-3 text-xs text-white/70 whitespace-pre-wrap">
                  {parsed.findings}
                </div>
              </div>

              {parsed.artifacts.length > 0 && (
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-wider text-white/30 mb-1">Artifacts</div>
                  <ul className="space-y-1">
                    {parsed.artifacts.map((a, i) => (
                      <li key={i} className="flex items-center gap-1 font-mono text-[11px] text-blue-400">
                        <ExternalLink size={10} />
                        <a href={a.startsWith("http") ? a : undefined} target="_blank" rel="noreferrer" className="hover:underline truncate">{a}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex gap-4 font-mono text-[10px] text-white/40">
                <span>Confidence: {(parsed.confidence * 100).toFixed(0)}%</span>
                <span>Cost: ${parsed.costUsd.toFixed(4)}</span>
                <span>Tokens: {parsed.tokensUsed.toLocaleString()}</span>
                <span>Model: {parsed.employeeModel}</span>
              </div>
            </>
          )}

          {/* Awaiting input */}
          {mission.status === "awaiting_input" && mission.questions && (
            <div className="rounded-md border border-orange-500/30 bg-orange-500/10 p-3">
              <div className="font-mono text-[9px] uppercase text-orange-400 mb-1">{mission.assignedEmployee} is asking:</div>
              <div className="text-sm text-white/80 mb-2">{mission.questions}</div>
              <div className="flex gap-2">
                <input
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  placeholder="Your response..."
                  className="flex-1 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-sm text-white outline-none"
                  onKeyDown={(e) => { if (e.key === "Enter") handleRespond(); }}
                />
                <button onClick={handleRespond} disabled={acting || !responseText.trim()} className="rounded-md bg-orange-500 px-3 py-1.5 font-mono text-[10px] uppercase text-white disabled:opacity-30">
                  <Send size={12} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        {mission.status === "pending_review" && (
          <div className="border-t border-[var(--blade-border)] px-4 py-3 space-y-2">
            {!showRejectInput ? (
              <div className="flex gap-2">
                <button onClick={handleApprove} disabled={acting} className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-green-600 py-2 font-mono text-[10px] uppercase text-white hover:bg-green-500 disabled:opacity-30">
                  <Check size={12} /> Approve
                </button>
                <button onClick={() => setShowRejectInput(true)} disabled={acting} className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-red-500/50 py-2 font-mono text-[10px] uppercase text-red-400 hover:bg-red-500/10 disabled:opacity-30">
                  <XCircle size={12} /> Reject
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Rejection reason..."
                  className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-sm text-white outline-none"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") handleReject(); if (e.key === "Escape") setShowRejectInput(false); }}
                />
                <div className="flex gap-2">
                  <button onClick={handleReject} disabled={acting || !rejectReason.trim()} className="flex-1 rounded-md bg-red-600 py-1.5 font-mono text-[10px] uppercase text-white disabled:opacity-30">Confirm Reject</button>
                  <button onClick={() => setShowRejectInput(false)} className="flex-1 rounded-md border border-white/10 py-1.5 font-mono text-[10px] uppercase text-white/50">Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/command/src/components/blade/MissionDetailDrawer.tsx
git commit -m "feat(dashboard): add MissionDetailDrawer with approve/reject/respond"
```

---

### Task 5: NotificationBanner Component

**Files:**
- Create: `apps/command/src/components/blade/NotificationBanner.tsx`

- [ ] **Step 1: Create the banner**

```tsx
// apps/command/src/components/blade/NotificationBanner.tsx
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X, Check, MessageSquare } from "lucide-react";
import { API_URL } from "@/lib/api";

const AUTH_TOKEN = import.meta.env.VITE_BLADE_TOKEN as string | undefined;

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: string;
}

export function NotificationBanner() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    const poll = async () => {
      try {
        const headers: Record<string, string> = {};
        if (AUTH_TOKEN) headers["Authorization"] = `Bearer ${AUTH_TOKEN}`;
        const res = await fetch(`${API_URL}/api/notifications`, { headers });
        const json = await res.json();
        if (json.success && json.data) {
          const unread = json.data.filter((n: Notification) => !n.read && ["mission_review", "mission_failed", "mission_input"].includes(n.type));
          setNotifications(unread.slice(0, 3));
        }
      } catch { /* ignore */ }
    };

    poll();
    const interval = setInterval(poll, 10_000);
    return () => clearInterval(interval);
  }, []);

  const dismiss = async (id: string) => {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (AUTH_TOKEN) headers["Authorization"] = `Bearer ${AUTH_TOKEN}`;
      await fetch(`${API_URL}/api/notifications`, {
        method: "POST",
        headers,
        body: JSON.stringify({ id }),
      });
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch { /* ignore */ }
  };

  if (notifications.length === 0) return null;

  const typeConfig: Record<string, { color: string; icon: typeof AlertTriangle }> = {
    mission_review: { color: "#22C55E", icon: Check },
    mission_failed: { color: "#EF4444", icon: AlertTriangle },
    mission_input: { color: "#F59E0B", icon: MessageSquare },
  };

  return (
    <div className="fixed top-12 left-16 right-0 z-40 px-4 space-y-1">
      <AnimatePresence>
        {notifications.map((n) => {
          const cfg = typeConfig[n.type] ?? { color: "#666", icon: AlertTriangle };
          const Icon = cfg.icon;
          return (
            <motion.div
              key={n.id}
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              className="flex items-center gap-3 rounded-md border px-4 py-2 backdrop-blur-xl"
              style={{ borderColor: `${cfg.color}44`, background: `${cfg.color}11` }}
            >
              <Icon size={14} style={{ color: cfg.color }} />
              <div className="flex-1">
                <div className="font-mono text-[10px] uppercase" style={{ color: cfg.color }}>{n.title}</div>
                <div className="font-mono text-[11px] text-white/60 truncate">{n.message}</div>
              </div>
              <button onClick={() => dismiss(n.id)} className="text-white/30 hover:text-white/60">
                <X size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/command/src/components/blade/NotificationBanner.tsx
git commit -m "feat(dashboard): add NotificationBanner for urgent mission events"
```

---

### Task 6: Mount NotificationBanner in AppShell

**Files:**
- Modify: `apps/command/src/components/blade/AppShell.tsx`

- [ ] **Step 1: Add import and component**

Add import:
```tsx
import { NotificationBanner } from "./NotificationBanner";
```

Add `<NotificationBanner />` right after `<TopBar />`:
```tsx
      <TopBar />
      <NotificationBanner />
```

- [ ] **Step 2: Commit**

```bash
git add apps/command/src/components/blade/AppShell.tsx
git commit -m "feat(dashboard): mount NotificationBanner in AppShell"
```

---

### Task 7: Enhanced MissionsPage with Detail Drawer

**Files:**
- Modify: `apps/command/src/components/blade/MissionsPage.tsx`

- [ ] **Step 1: Add MissionDetailDrawer integration**

Read the current MissionsPage.tsx. Add:

1. Import at top:
```tsx
import { MissionDetailDrawer } from "./MissionDetailDrawer";
```

2. Add state for selected mission inside the component:
```tsx
const [selectedMission, setSelectedMission] = useState<Mission | null>(null);
```

3. Update the `MissionBlock` `onClick` to set the selected mission:
```tsx
onClick={() => setSelectedMission(m)}
```

4. Add the drawer at the end of the component's return, inside the root div:
```tsx
<MissionDetailDrawer
  mission={selectedMission}
  onClose={() => { setSelectedMission(null); fetchMissions(); }}
/>
```

Where `fetchMissions` is from `useBladeStore((s) => s.fetchMissions)`.

5. Add "review" and "input" to the lane definitions. Find where the kanban lanes are rendered. Add two new lanes between "progress" and "done":

For "review" (pending_review):
- Title: "REVIEW"
- Color: `#22C55E` (green)

For "input" (awaiting_input):
- Title: "INPUT NEEDED"
- Color: `#F59E0B` (amber)

- [ ] **Step 2: Commit**

```bash
git add apps/command/src/components/blade/MissionsPage.tsx
git commit -m "feat(dashboard): add mission detail drawer and new kanban columns to MissionsPage"
```

---

### Task 8: Build and Verify

- [ ] **Step 1: Build core packages**

```bash
cd /Users/emekaajufo/Blade\ Super\ Agent && npx turbo build --filter=@blade/db --filter=@blade/core
```

- [ ] **Step 2: Restart Vite dev server**

```bash
pkill -f "vite.*5174" 2>/dev/null; sleep 1
cd apps/command && npx vite dev --port 5174 > /tmp/blade-vite.log 2>&1 &
sleep 3 && tail -3 /tmp/blade-vite.log
```

- [ ] **Step 3: Verify at http://localhost:5174**

- Command bar visible at bottom of every page
- Cmd+K focuses input
- Missions page shows kanban with new columns
- Clicking a mission opens the detail drawer
- Notification banners appear for urgent items

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete end-to-end integration — notifications, detail drawer, cross-channel"
```
