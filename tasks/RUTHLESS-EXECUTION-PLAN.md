# Ruthless Execution Plan

**Wedge:** Blade = the agent command center for founders and operators.

**Core loop:** monitor -> detect -> summarize -> recommend -> execute on approval -> remember outcome

**Rule:** If it doesn't strengthen the core loop, it drops in priority.

---

## What Gets Built (In Order)

### Sprint 1: Durable Control Plane (This Week)

**Goal:** Every run, handoff, approval, and agent state is DB-backed, inspectable, and survives restarts.

| # | Task | Files | LOC Est |
|---|------|-------|---------|
| 1 | Write migration `0007_control_plane.sql` | `packages/db/src/migrations/0007_control_plane.sql` | 120 |
| 2 | Add repositories for new tables | `packages/db/src/repositories.ts` (extend) | 200 |
| 3 | Build `activity_events` table + repo | Part of migration + repo | — |
| 4 | Build `approvals` table + repo | Part of migration + repo | — |
| 5 | Build `monitors` + `monitor_alerts` tables | Part of migration + repo | — |
| 6 | Build `routines` table + repo | Part of migration + repo | — |
| 7 | Build `kpi_definitions` + `kpi_measurements` tables | Part of migration + repo | — |
| 8 | Expand `employees` table (15 new columns) | Part of migration | — |
| 9 | Wire activity event emission into ConversationEngine | `packages/conversation/src/engine.ts` | 30 |
| 10 | Wire activity event emission into agent-loop callbacks | `packages/core/src/agent-loop.ts` | 20 |

**Migration creates 7 tables:**
```
activity_events    — append-only timeline of everything
approvals          — pending/approved/rejected actions  
monitors           — external source watchers
monitor_alerts     — alert history
kpi_definitions    — per-employee KPI specs
kpi_measurements   — time-series KPI data
routines           — scheduled employee tasks
```

**Plus alters `employees` with:** department, objective, manager_id, allowed_tools_json, blocked_tools_json, model_preference, max_budget_per_run, escalation_policy_json, handoff_rules_json, memory_scope, output_channels_json, status, total_runs, total_cost_usd, success_rate.

---

### Sprint 2: Live Activity Feed (Days 3-5)

**Goal:** One screen shows everything happening right now.

| # | Task | Files |
|---|------|-------|
| 1 | Build `/api/timeline/route.ts` — GET paginated events | `apps/web/src/app/api/timeline/route.ts` |
| 2 | Build `/api/runs/route.ts` — GET active/recent runs | `apps/web/src/app/api/runs/route.ts` |
| 3 | Build Runs page — real-time activity feed | `apps/web/src/app/(dashboard)/runs/page.tsx` |
| 4 | Add SSE endpoint for live timeline updates | `apps/web/src/app/api/timeline/stream/route.ts` |
| 5 | Build activity event card component | `apps/web/src/components/timeline/event-card.tsx` |
| 6 | Add filters: by agent, by type, by time | Part of runs page |

**What a run card shows:**
```
agent | goal | stage | tools used | cost | status | blocker | approval needed | result
```

Every action legible. No opaque "Claude finished."

---

### Sprint 3: Trust & Permission Model (Days 5-8)

**Goal:** Users can see exactly what agents can and cannot do. Risky actions require approval.

| # | Task | Files |
|---|------|-------|
| 1 | Build approval API — GET pending, POST approve/reject | `apps/web/src/app/api/approvals/route.ts` |
| 2 | Build approval inbox component | `apps/web/src/components/approvals/inbox.tsx` |
| 3 | Wire approval gates into ConversationEngine | `packages/conversation/src/engine.ts` |
| 4 | Build policy display in agent detail | Part of agent detail page |
| 5 | Add approval requirement detection (high-cost tools, external writes) | `packages/conversation/src/policy-resolver.ts` |
| 6 | Auth hardening — verify every new route has `requireAuth()` | All new API routes |
| 7 | Add audit log viewer (read-only timeline for trust) | Part of runs page |

**Approval triggers:**
- Tool cost > $1
- External API writes (GHL create/update, GitHub PR, Stripe)
- Shell commands
- File deletion

---

### Sprint 4: Employee Objects with KPI Ownership (Days 8-12)

**Goal:** Employees are real product objects with missions, KPIs, routines, and performance history.

| # | Task | Files |
|---|------|-------|
| 1 | Write 8 employee YAML definitions | `packages/core/src/employees/definitions/*.yaml` |
| 2 | Build YAML loader that seeds DB | `packages/control/src/agents/seed.ts` (or core for now) |
| 3 | Build `/api/agents/route.ts` — agent roster CRUD | `apps/web/src/app/api/agents/route.ts` |
| 4 | Build `/api/agents/[id]/route.ts` — agent detail + KPIs | `apps/web/src/app/api/agents/[id]/route.ts` |
| 5 | Build Agents page — roster table | `apps/web/src/app/(dashboard)/agents/page.tsx` |
| 6 | Build agent detail page — KPIs, routines, runs, policy | `apps/web/src/app/(dashboard)/agents/[id]/page.tsx` |
| 7 | Build routine scheduler (cron-based) | Refactor `packages/core/src/employees/proactive.ts` |
| 8 | Wire KPI measurement recording | Extend repositories |

**Starter roster (8 employees):**
- Chief of Staff — coordinator, daily briefing owner
- Product Manager — feature tracking, sprint KPIs
- Engineering Manager — PR cycle time, deploy health
- Growth Lead — MQLs, pipeline value
- SDR — SQLs/week, outreach volume
- Support Lead — resolution time, backlog count
- Ops Manager — system uptime, cost monitoring
- Finance Analyst — burn rate, revenue tracking

Each has: role, mission, 2-3 KPIs, 1-2 routines, allowed tools, escalation rules.

---

### Sprint 5: Proactive Monitors + Daily Briefing (Days 12-16)

**Goal:** Blade watches what matters and tells you what changed before you ask.

| # | Task | Files |
|---|------|-------|
| 1 | Build monitor registry + checker | `packages/core/src/monitors/registry.ts`, `checker.ts` |
| 2 | Build alerter (route to Today view + channels) | `packages/core/src/monitors/alerter.ts` |
| 3 | Build briefing generator | `packages/core/src/monitors/briefing.ts` |
| 4 | Build `/api/monitors/route.ts` | `apps/web/src/app/api/monitors/route.ts` |
| 5 | Build `/api/briefing/route.ts` | `apps/web/src/app/api/briefing/route.ts` |
| 6 | Build Today page — the command center home | `apps/web/src/app/(dashboard)/page.tsx` |
| 7 | Ship 5 built-in monitors | Part of registry |

**Today page shows (one screen):**
```
🔴 ALERTS — what's on fire
📋 ACTIONS — what needs attention  
⏰ SCHEDULED — what's running today
📊 KPIs — what metrics moved
🏃 ACTIVE — what agents are doing right now
📝 BRIEFING — AI-generated executive summary
```

**5 built-in monitors:**
1. **Cost burn rate** — daily spend vs budget (internal, zero setup)
2. **PR velocity** — open PR count, avg review time (GitHub token required)
3. **Memory health** — memory count, avg confidence drift (internal)
4. **Employee health** — success rate, error count per employee (internal)
5. **Pipeline health** — open deals, stale deals (GHL required, optional)

Start with 3 internal monitors (no API keys needed). That's enough to make the Today page real.

---

## What Does NOT Get Built

| Feature | Why It's Cut |
|---------|-------------|
| Slack/email adapters | Channels beyond web+telegram can wait. Core loop first. |
| Memory graph visualization | Nice-to-have. Search + filter is enough for now. |
| RAG improvements / embeddings | Current FTS5 works. Premature optimization. |
| Gamification / XP / achievements | Fun but doesn't strengthen the trust loop. |
| Evolution / self-improve / prompt optimizer | Premature. Get the basics reliable first. |
| Voice / TTS / STT improvements | Niche. Not part of the command center wedge. |
| Competitive moat reports | Marketing artifact, not runtime. |
| Full workflow DAG editor | Visual workflow builder is a v3 feature. |
| packages/control extraction | Logical boundary matters more than physical. Keep in core for now, extract when the seams are proven. |

---

## Exact UI Screens

### Screen 1: Today (default `/`)
The command center. One glance = full situational awareness.

### Screen 2: Agents (`/agents`)
Employee roster with status, current task, KPI health, cost, success rate.
Click into agent detail for KPIs, routines, runs, policy.

### Screen 3: Runs (`/runs`)
Real-time activity timeline. Every tool call, handoff, approval, error.
Filters by agent, type, time. Approval buttons inline.

### Screen 4: Chat (`/chat`)
Full assistant interface (existing, keep as-is).

### Screen 5: Settings (`/settings`)
Existing settings + new policy/permissions section.

That's 5 screens. Not 10. Five screens that are undeniable.

---

## Exact Backend Modules

### New in `packages/db/`
```
migrations/0007_control_plane.sql     — 7 new tables + employee expansion
repositories.ts                        — extend with 7 new repo objects
```

### New in `packages/core/` (stays in core for now)
```
monitors/
  registry.ts       — register monitors with sources and thresholds
  checker.ts         — execute checks on cron schedule
  alerter.ts         — route alerts to activity timeline + channels
  briefing.ts        — daily executive briefing generator
employees/
  definitions/       — 8 YAML employee definitions
  yaml-loader.ts     — load YAMLs and seed DB
```

### New in `apps/web/`
```
src/app/api/
  timeline/route.ts           — GET paginated activity events
  timeline/stream/route.ts    — SSE live updates
  runs/route.ts               — GET active/recent runs
  agents/route.ts             — GET roster, POST create
  agents/[id]/route.ts        — GET detail, PUT update
  agents/[id]/kpis/route.ts   — GET KPI data
  monitors/route.ts           — GET/POST monitors
  approvals/route.ts          — GET pending, POST approve/reject
  briefing/route.ts           — GET today's briefing

src/app/(dashboard)/
  page.tsx                    — Today view (new default)
  agents/page.tsx             — Agent roster
  agents/[id]/page.tsx        — Agent detail
  runs/page.tsx               — Activity timeline

src/components/
  timeline/event-card.tsx     — Activity event display
  approvals/inbox.tsx         — Approval queue
  agents/roster-table.tsx     — Agent roster table
  agents/kpi-card.tsx         — KPI with sparkline
  dashboard/today-section.tsx — Section component for Today view
```

---

## This Week vs Later

### This Week (Do Now)
1. Migration `0007_control_plane.sql` + repositories
2. Activity event emission from engine + agent loop
3. `/api/timeline/route.ts` + Runs page
4. `/api/approvals/route.ts` + approval inbox
5. 3 internal monitors (cost, memory, employee health)

### Next Week
6. 8 employee YAML definitions + CRUD
7. Agents page + agent detail
8. Routine scheduler
9. Today page with briefing
10. Auth hardening on all routes

### Week After
11. KPI measurement pipeline
12. Pipeline/PR monitors (GitHub)
13. Live SSE updates for timeline
14. Agent scorecards
15. Polish and testing

---

## Success Criteria

After these 3 weeks, a founder opens Blade and sees:

- **What changed** — activity feed shows every action with agent, goal, tools, cost, result
- **What matters** — Today page shows alerts, KPI movements, recommended actions
- **What's being handled** — agents with active routines, visible in the roster
- **What needs approval** — approval inbox with approve/reject buttons
- **What the business should do next** — AI-generated daily briefing

If Blade becomes that, it wins.

---

*Do less. Make it undeniable.*
