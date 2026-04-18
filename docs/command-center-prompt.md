# Blade Command Center — Continuation Prompt

> Paste this into Lovable (or any AI coding tool) to continue building the command center with full awareness of the Blade backend.

---

## Context

This is the Blade Command Center — a voice-first AI operating system dashboard. The frontend is built in TanStack Start + React 19 + Tailwind + Framer Motion + Radix/shadcn. The backend is Blade Super Agent, a TypeScript monorepo deployed on Railway with a full intelligence stack.

**Current state**: The frontend has 6 pages (Command, Council, Missions, Memory, Calendar, Dispatch) with beautiful UI but ALL data is hardcoded. No backend connection. Voice visualizer is demo-only (4-second animation loop). No real-time updates.

**Goal**: Wire this to the real Blade backend and make it a live, functional command center with real voice interaction.

---

## The Backend (Blade Super Agent)

The backend runs on Railway at the same domain. All API routes are at `/api/*`. Here's what's available:

### Existing API Routes
```
GET  /api/health                    — System health check
GET  /api/employees                 — List all employees (active/inactive)
POST /api/employees/:slug/activate  — Activate an employee
GET  /api/agents                    — List active agents with status
GET  /api/chat                      — Send message, get response (SSE stream)
POST /api/chat                      — Send message to employee
GET  /api/jobs                      — List coding jobs
POST /api/jobs                      — Create new coding job
GET  /api/memory                    — List memories (search, filter)
POST /api/memory                    — Save a memory
GET  /api/memory/stats              — Memory statistics
GET  /api/missions                  — List missions
POST /api/missions                  — Create mission
PATCH /api/missions/:id             — Update mission status
GET  /api/costs                     — Cost breakdown by model/employee/day
GET  /api/briefing                  — Generate morning briefing
GET  /api/approvals                 — Pending approval requests
POST /api/approvals/:id             — Approve/reject
GET  /api/voice/token               — Get LiveKit participant token
POST /api/voice/token               — Generate voice session token
GET  /api/notifications             — Recent notifications
GET  /api/timeline                  — Activity event feed (Hive Mind)
GET  /api/scorecard                 — Employee performance metrics
```

### New Intelligence Systems (need API routes built)
These backend systems exist but DON'T have API routes yet. Build them:

```
GET  /api/routing/stats             — Q-learning router stats (task types, Q-values, accuracy)
GET  /api/routing/episodes          — Recent routing decisions
GET  /api/autopilot/batches         — List batch runs
POST /api/autopilot/batches         — Create batch run
GET  /api/autopilot/batches/:id     — Batch progress
POST /api/autopilot/batches/:id/stop — Stop batch
GET  /api/security/events           — Recent injection attempts + exfiltration blocks
GET  /api/plugins                   — List installed plugins
POST /api/plugins/:name/enable      — Enable plugin
POST /api/plugins/:name/disable     — Disable plugin
GET  /api/reasoning/patterns        — ReasoningBank patterns
GET  /api/reasoning/stats           — Pattern stats by task type
```

### Backend Functions Available (import from @blade/core)
```typescript
// Employees & Hive Mind
import { getAllEmployees, getActiveEmployees, logEmployeeActivity, getTeamActivity } from '@blade/core'

// Memory (now with vector search)
import { retrieveRelevant, retrieveRelevantAsync, processMemoryFeedback } from '@blade/core'

// Routing Intelligence
import { classifyTask, selectEmployee, autoRouteModel, analyzeComplexity } from '@blade/core'

// Autopilot
import { startBatch, stopBatch, getBatchProgress, isBatchComplete } from '@blade/core'

// Security
import { detectInjection, scanForSecrets } from '@blade/core'

// Plugins
import { listPlugins, installPlugin, enablePlugin, disablePlugin } from '@blade/core'

// ReasoningBank
import { storePattern, findSimilarPatterns, buildPatternContext } from '@blade/core'

// Claude Agent SDK
import { executeEmployeeTask, isSdkAvailable } from '@blade/core'

// Voice
import { createWarRoomSession, processVoiceTurn, generateParticipantToken } from '@blade/core'

// Missions
import { autoAssignMission } from '@blade/core'  // Uses Q-learning router

// Cost
import { calculateCost, formatCost } from '@blade/core'
```

---

## What to Build

### Phase 1: Wire Existing Pages to Real Data

**Command Page (/)** — The main screen. Replace hardcoded data:
- Top status gauges: fetch from `/api/health` (API status, voice status, comms status)
- Spend ticker: fetch from `/api/costs` with `?period=today`
- Mission HUD widget: fetch from `/api/missions?status=live` for count
- Memory HUD widget: fetch from `/api/memory/stats` for total count
- Delegation feed: fetch from `/api/timeline?limit=10` for recent Hive Mind activity
- Session timer: track from voice session start

**Council Page (/council)** — Map to real employees:
- Replace Gemini/Nova/Echo/Muse/Forge with actual employees from `/api/employees`
- Each card shows: name, title, status (active/idle), successRate, totalRuns, totalCostUsd
- Add "Assign Mission" button that opens the new mission modal
- Show employee's recent activity from `/api/timeline?actorId={slug}`
- The agent color mapping: keep the existing color system but map dynamically. Assign colors based on employee index or department.

**Missions Page (/missions)** — Wire to real missions:
- Fetch from `/api/missions`
- "New Mission" modal should POST to `/api/missions` with title, description, priority
- Auto-assign uses the Q-learning router (backend handles this via `autoAssignMission`)
- Status updates via PATCH `/api/missions/:id`
- Group by agent (assignedEmployee) in the kanban lanes
- Show which routing method was used (q_learning, gemini_fallback, exploration) in mission detail

**Memory Page (/memory)** — Wire to real memory:
- Search: GET `/api/memory?q={query}` — now uses hybrid FTS5 + vector search
- Display: importance level, confidence score, tags, source, access count
- Add "Pin" button (prevents decay)
- Show insights from consolidation engine
- Show ReasoningBank patterns: GET `/api/reasoning/patterns`

**Calendar Page (/calendar)** — Wire to employee routines:
- Fetch from employee routine definitions (routines table)
- Show scheduled tasks, cron expressions as calendar blocks

**Dispatch Page (/dispatch)** — Wire to coding jobs:
- Fetch from `/api/jobs`
- Show job lifecycle: queued → cloning → coding → testing → pr_creating → completed
- "New Job" creates a coding pipeline run
- Show PR URL when complete

### Phase 2: New Intelligence Panels

Add these as collapsible panels or new sections within existing pages:

**Autopilot Panel** (add to Command page or new tab):
- List active batch runs from `/api/autopilot/batches`
- Show progress bars, job counts, cost accumulation
- "New Batch" button to queue multiple jobs
- "Stop Batch" button
- Stall alerts (highlight jobs stuck > 5 min)

**Q-Router Insights** (add to Council page):
- Show routing accuracy over time (chart)
- Task type distribution (pie chart)
- Q-value heatmap: task_type × employee grid showing learned preferences
- Recent routing episodes with method used

**Security Dashboard** (add to Command page bottom bar or new panel):
- Injection attempts count (today)
- Exfiltration blocks count (today)
- Recent security events list
- Severity distribution

**Plugin Manager** (add to settings or new page):
- List installed plugins with enable/disable toggle
- Crash count indicator
- Plugin type badges (hook/tool/provider/worker)

### Phase 3: Real Voice Integration

Replace the demo voice loop with actual voice:

**Option A: Pipecat + Gemini Live (existing War Room architecture)**
The backend already has a Pipecat server at `warroom/server.py` that handles:
- WebSocket transport for audio
- Gemini Live for speech-to-speech
- Agent voice routing (each employee has a distinct voice)

Wire the VoiceVisualizer to this:
1. On mic button click: connect WebSocket to `ws://[backend]/ws/voice`
2. Stream audio from browser mic via MediaRecorder API
3. Receive transcribed text + agent responses via WebSocket events
4. Update VoiceVisualizer state based on actual audio state (listening/speaking/thinking)
5. Show real transcript in the chat area
6. Support "talk to [employee]" — route voice to specific employee

**Option B: LiveKit (if Pipecat isn't available)**
Use `/api/voice/token` to get a LiveKit participant token, then use LiveKit's client SDK for real-time voice.

**Voice Commands to Support**:
- "What's the status?" → Triggers briefing from `/api/briefing`
- "Assign [task] to [employee]" → Creates mission via POST `/api/missions`
- "Show me the costs" → Reads cost summary
- "Start a batch of [description]" → Creates autopilot batch
- "How's [employee] doing?" → Reads employee scorecard

### Phase 4: Real-Time Updates

Add SSE (Server-Sent Events) for live dashboard updates:

**Create `/api/stream` endpoint** that emits:
```typescript
event: activity     // Hive Mind events (employee did something)
event: mission      // Mission status changed
event: job          // Coding job progress
event: security     // Injection/exfiltration alert
event: cost         // Cost update
event: routing      // Q-router learned something new
event: memory       // New memory saved or consolidated
event: batch        // Autopilot batch progress
```

On the frontend:
- Use EventSource to connect to `/api/stream`
- Update all dashboard widgets in real-time
- Show toast notifications for important events (security alerts, job completions)
- Animate the Hive Mind feed with new entries sliding in

---

## Existing Component Mapping

Map the current Lovable components to Blade backend entities:

| Lovable Component | Blade Backend | Notes |
|-------------------|---------------|-------|
| Agent (Gemini/Nova/etc) | Employee (from employees table) | Map by slug, use real names/titles |
| VizState | Voice session state | Wire to actual WebSocket |
| Mission | Mission (from missions table) | Add Q-router metadata |
| Msg (transcript) | Conversation messages | Stream via SSE |
| MEMS (memory cards) | Memories (from memories table) | Add vector search, importance |
| SCHED (calendar) | Routines (from routines table) | Cron-based scheduling |
| DISPATCHES | Jobs (from jobs table) | Coding pipeline lifecycle |

## Agent Color Mapping

Keep the existing color scheme but map to real employee departments:

```typescript
const DEPARTMENT_COLORS: Record<string, { color: string; glow: string }> = {
  leadership: { color: '#DC2626', glow: '0 0 24px #DC262640' },  // Red
  sales:      { color: '#7C3AED', glow: '0 0 24px #7C3AED40' },  // Purple
  marketing:  { color: '#2563EB', glow: '0 0 24px #2563EB40' },  // Blue
  content:    { color: '#D97706', glow: '0 0 24px #D9770640' },  // Orange
  ops:        { color: '#6B7280', glow: '0 0 24px #6B728040' },  // Gray
  engineering:{ color: '#10B981', glow: '0 0 24px #10B98140' },  // Green
  general:    { color: '#8B5CF6', glow: '0 0 24px #8B5CF640' },  // Indigo
}
```

---

## State Management Recommendation

Replace local useState with Zustand for cross-component state:

```typescript
// src/stores/blade-store.ts
interface BladeState {
  employees: Employee[]
  missions: Mission[]
  memories: Memory[]
  jobs: Job[]
  batchRuns: BatchRun[]
  securityEvents: SecurityEvent[]
  routingStats: RoutingStats
  voiceState: 'idle' | 'listening' | 'thinking' | 'speaking'
  activeEmployee: string | null
  todayCost: number
  
  // Actions
  fetchEmployees: () => Promise<void>
  fetchMissions: () => Promise<void>
  createMission: (params: CreateMissionParams) => Promise<void>
  sendMessage: (employeeSlug: string, message: string) => Promise<string>
  startVoice: () => void
  stopVoice: () => void
}
```

---

## Environment Variables

```env
VITE_API_URL=https://your-railway-url.up.railway.app  # or http://localhost:3000 for dev
VITE_WS_URL=wss://your-railway-url.up.railway.app     # WebSocket for voice
```

---

## Design Principles

1. **Voice is always one tap away** — The mic button is persistent, not hidden behind navigation
2. **Single pane of glass** — The Command page should show everything important without scrolling
3. **Real-time by default** — No manual refresh. Data flows in via SSE.
4. **Employee-centric** — Everything is organized around who's doing what
5. **Cost-aware** — Always show the spend. Token efficiency is visible.
6. **Intelligence is visible** — Show the Q-router learning, memory consolidating, patterns forming. The system should feel alive and getting smarter.
