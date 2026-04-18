# Blade Command Center — Continuation Prompt

> Paste this into Lovable to continue building the command center. The backend API is LIVE — all routes below are deployed and returning real data.

---

## Context

This is the Blade Command Center — a voice-first AI operating system dashboard. The frontend is built in TanStack Start + React 19 + Tailwind + Framer Motion + Radix/shadcn. The backend is Blade Super Agent, deployed on Railway.

**Current state**: 6 pages (Command, Council, Missions, Memory, Calendar, Dispatch) with polished UI but ALL data is hardcoded mock arrays. Voice visualizer is a demo animation loop. No backend connection.

**Goal**: Wire every page to the live backend API. Replace the demo voice loop with always-on ambient Pipecat voice via WebSocket. Add 4 new intelligence panels. Add real-time SSE updates.

**Architecture**: This Lovable app is a SEPARATE frontend that calls the Blade backend via CORS-enabled API routes. All endpoints return `{ success: true, data: ... }` with `Access-Control-Allow-Origin: *`.

---

## API Base URL

```
const API_URL = import.meta.env.VITE_API_URL ?? 'https://YOUR-RAILWAY-URL.up.railway.app'
const WS_URL = import.meta.env.VITE_VOICE_WS_URL ?? 'wss://YOUR-RAILWAY-URL.up.railway.app:7861'
```

Set `VITE_API_URL` in your Lovable environment. All fetch calls go to `${API_URL}/api/...`.

For auth: pass `Authorization: Bearer YOUR_TOKEN` header, or if `BLADE_ALLOW_REMOTE=true` is set on the backend, localhost requests pass without auth.

---

## Complete API Reference

### Core Data

```
GET  /api/health                        → { status, uptime, dbConnected }
GET  /api/employees                     → { data: Employee[] }
GET  /api/missions                      → { data: Mission[] }
POST /api/missions                      → body: { title, description, priority }
PATCH /api/missions/:id                 → body: { status }
GET  /api/jobs                          → { data: Job[] }
POST /api/jobs                          → body: { title, description, repoUrl }
GET  /api/memory?q=search+term          → { data: Memory[] }  (hybrid FTS5 + vector search)
GET  /api/memory/stats                  → { data: { total, pinnedCount, avgConfidence, byType } }
GET  /api/costs?period=today            → { data: { totalCostUsd, byModel, byEmployee } }
GET  /api/timeline?limit=20&actor=slug  → { data: { events: ActivityEvent[], total } }
GET  /api/briefing                      → { data: { briefing: string } }
GET  /api/scorecard                     → { data: ScorecardEntry[] }
GET  /api/approvals                     → { data: Approval[] }
POST /api/approvals/:id                 → body: { decision: 'approved' | 'rejected' }
POST /api/chat                          → body: { message, employeeSlug?, conversationId? }
GET  /api/notifications                 → { data: Notification[] }
```

### Intelligence Systems (NEW — all have CORS headers)

```
GET  /api/routing/stats                 → { data: { taskTypes: [{ taskType, visitCount }] } }
GET  /api/routing/episodes?limit=20     → { data: RoutingEpisode[] }
GET  /api/routing/q-values?taskType=    → { data: [{ taskType, employeeSlug, qValue, visitCount }] }

GET  /api/autopilot/batches             → { data: BatchRun[] }
POST /api/autopilot/batches             → body: { name, maxConcurrent?, maxCostUsd?, jobs: [{ title, description }] }
GET  /api/autopilot/batches/:id         → { data: BatchProgress }
POST /api/autopilot/batches/:id         → body: { action: 'stop' | 'cancel' }

GET  /api/security/events?limit=50      → { data: SecurityEvent[] }
GET  /api/security/stats                → { data: { injectionsToday, exfiltrationsToday, severity } }

GET  /api/reasoning/patterns?taskType=  → { data: ReasoningPattern[] }
GET  /api/reasoning/stats               → { data: { total, byTaskType } }

GET  /api/plugins                       → { data: Plugin[] }
POST /api/plugins                       → body: { name, action: 'enable' | 'disable' }

GET  /api/stream                        → SSE (Server-Sent Events, see Real-Time section)
```

---

## Phase 1: Wire Existing Pages to Real Data

### Command Page (/) — Replace ALL hardcoded data

**TopBar status gauges** (API / VOICE / COMMS):
```typescript
const health = await fetch(`${API_URL}/api/health`).then(r => r.json())
// Map to gauges: API = health.dbConnected, VOICE = 'ok', COMMS = health.status
```

**Spend ticker**:
```typescript
const costs = await fetch(`${API_URL}/api/costs?period=today`).then(r => r.json())
// costs.data.totalCostUsd → TickerNumber component
```

**Mission HUD widget** (orbital widget showing active count):
```typescript
const missions = await fetch(`${API_URL}/api/missions`).then(r => r.json())
const active = missions.data.filter(m => m.status === 'live').length
```

**Memory HUD widget**:
```typescript
const memStats = await fetch(`${API_URL}/api/memory/stats`).then(r => r.json())
// memStats.data.total → memory count display
```

**Delegation feed** (replace SEED messages):
```typescript
const timeline = await fetch(`${API_URL}/api/timeline?limit=10`).then(r => r.json())
// Map timeline.data.events to the Msg[] format:
// { id, role: event.actorType === 'employee' ? 'gemini' : 'you', text: event.summary }
```

### Council Page (/council) — Replace hardcoded agents

```typescript
const employees = await fetch(`${API_URL}/api/employees`).then(r => r.json())
// Map employees.data to Agent format:
// { id: e.slug, name: e.name, role: e.title, short: e.description, 
//   color: DEPARTMENT_COLORS[e.department]?.color ?? '#8B5CF6',
//   glow: DEPARTMENT_COLORS[e.department]?.glow ?? '...',
//   domains: [e.department] }

// For each employee, fetch recent activity:
const activity = await fetch(`${API_URL}/api/timeline?actor=${slug}&limit=5`).then(r => r.json())
```

### Missions Page (/missions) — Replace MISSIONS array

```typescript
// Fetch
const missions = await fetch(`${API_URL}/api/missions`).then(r => r.json())
// Map to existing Mission interface, group by assignedEmployee for kanban lanes

// Create mission (from "New Mission" modal):
await fetch(`${API_URL}/api/missions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title, description, priority: parseInt(priority) })
})
// Backend auto-assigns via Q-learning router
```

### Memory Page (/memory) — Replace MEMS array

```typescript
// Search
const results = await fetch(`${API_URL}/api/memory?q=${encodeURIComponent(query)}`).then(r => r.json())
// Map to card format: importance, confidence, tags, source, accessCount

// Also show ReasoningBank patterns:
const patterns = await fetch(`${API_URL}/api/reasoning/patterns`).then(r => r.json())
```

### Dispatch Page (/dispatch) — Replace DISPATCHES array

```typescript
const jobs = await fetch(`${API_URL}/api/jobs`).then(r => r.json())
// Map jobs.data to dispatch cards
// status lifecycle: queued → cloning → branching → coding → testing → pr_creating → completed
// Show prUrl when status === 'completed'
```

### Calendar Page (/calendar) — Wire to routines

```typescript
// Routines are per-employee scheduled tasks
// Fetch via /api/employees and look at routine definitions
// Map cron expressions to calendar grid blocks
```

---

## Phase 2: Add 4 Intelligence Panels

### Q-Router Brain Panel

Add to the Council page or as a collapsible section on Command page.

```typescript
// Fetch data
const stats = await fetch(`${API_URL}/api/routing/stats`).then(r => r.json())
const episodes = await fetch(`${API_URL}/api/routing/episodes?limit=10`).then(r => r.json())
const qValues = await fetch(`${API_URL}/api/routing/q-values`).then(r => r.json())
```

**Visualizations**:
- **Heatmap**: Grid of taskType (rows) × employee (columns), cell color = Q-value (0=red, 0.5=yellow, 1=green). Use qValues data.
- **Routing accuracy**: Line chart of episodes resolved with reward > 0.7 over time. Use Recharts.
- **Task type distribution**: Pie chart of stats.data.taskTypes by visitCount.
- **Recent decisions**: List showing `"${episode.taskType} → ${episode.selectedEmployee} (${episode.selectionMethod})"` with reward badge.

### Autopilot Control Panel

Add as a new tab or section on the Command page.

```typescript
const batches = await fetch(`${API_URL}/api/autopilot/batches`).then(r => r.json())
// For each running batch:
const progress = await fetch(`${API_URL}/api/autopilot/batches/${batch.id}`).then(r => r.json())
```

**UI Elements**:
- Batch list with status badges (running/paused/completed/failed/budget_exceeded)
- Progress bar: `completedJobs / totalJobs`
- Cost accumulator: `$${totalCostUsd.toFixed(2)} / $${maxCostUsd ?? '∞'}`
- "New Batch" button → modal with name, max concurrent, budget, job list textarea
- "Stop" / "Cancel" buttons per batch
- Stall indicator: highlight jobs where `runningJobs > 0` and no progress for 5+ minutes

```typescript
// Create batch
await fetch(`${API_URL}/api/autopilot/batches`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Auth refactor batch',
    maxConcurrent: 2,
    maxCostUsd: 5.00,
    jobs: [
      { title: 'Refactor login', description: 'Move to OAuth2' },
      { title: 'Add MFA', description: 'TOTP support' },
    ]
  })
})

// Stop batch
await fetch(`${API_URL}/api/autopilot/batches/${id}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'stop' })
})
```

### Security Feed Panel

Add to the Command page bottom bar or as a collapsible panel.

```typescript
const stats = await fetch(`${API_URL}/api/security/stats`).then(r => r.json())
const events = await fetch(`${API_URL}/api/security/events?limit=20`).then(r => r.json())
```

**UI Elements**:
- Severity indicator: green dot (clear), yellow (elevated), red (critical) — from `stats.data.severity`
- Counter badges: `${injectionsToday} blocked` + `${exfiltrationsToday} redacted`
- Event list: timestamp, type (injection/exfiltration), summary, severity badge
- Use red glow animation on critical events (matches the Blade design language)

### ReasoningBank Explorer

Add to the Memory page or as a new tab.

```typescript
const stats = await fetch(`${API_URL}/api/reasoning/stats`).then(r => r.json())
const patterns = await fetch(`${API_URL}/api/reasoning/patterns?limit=20`).then(r => r.json())
```

**UI Elements**:
- Pattern cards showing: taskType, approach text, confidence gauge, useCount, successCount
- Filter by taskType dropdown
- Stats bar: total patterns, breakdown by type
- Confidence visualization: progress bar colored by confidence level (green > 0.7, yellow > 0.4, red below)

---

## Phase 3: Always-On Ambient Voice

Replace the demo VoiceVisualizer loop with real Pipecat + Gemini Live voice.

### Connection

The backend runs a Pipecat server with a WebSocket proxy for cross-origin access:

```typescript
const VOICE_WS_URL = import.meta.env.VITE_VOICE_WS_URL ?? 'ws://localhost:7861'
```

The proxy runs on port 7861 and forwards to the Pipecat server on port 7860. It handles binary audio frames bidirectionally.

### Always-On Behavior

```typescript
// On Command page mount:
useEffect(() => {
  const ws = new WebSocket(VOICE_WS_URL)
  
  // Start mic capture immediately (always-on ambient)
  navigator.mediaDevices.getUserMedia({ 
    audio: { 
      sampleRate: 16000,
      echoCancellation: true,
      noiseSuppression: true 
    } 
  }).then(stream => {
    const audioContext = new AudioContext({ sampleRate: 16000 })
    const source = audioContext.createMediaStreamSource(stream)
    const processor = audioContext.createScriptProcessor(4096, 1, 1)
    
    processor.onaudioprocess = (e) => {
      if (ws.readyState === WebSocket.OPEN && !isMuted) {
        const float32 = e.inputBuffer.getChannelData(0)
        // Convert float32 → int16 PCM
        const int16 = new Int16Array(float32.length)
        for (let i = 0; i < float32.length; i++) {
          int16[i] = Math.max(-32768, Math.min(32767, Math.round(float32[i] * 32767)))
        }
        ws.send(int16.buffer)
      }
    }
    
    source.connect(processor)
    processor.connect(audioContext.destination)
  })

  // Handle incoming events from Pipecat
  ws.onmessage = (event) => {
    if (typeof event.data === 'string') {
      const msg = JSON.parse(event.data)
      if (msg.type === 'transcript') {
        // Update transcript display
        addTranscriptEntry(msg.role, msg.text)
      }
      if (msg.type === 'agent_speaking') {
        setVoiceState('speaking')
      }
      if (msg.type === 'agent_thinking') {
        setVoiceState('thinking')
        setDispatchTo(msg.agent)  // Show which agent is handling
      }
    } else {
      // Binary = audio output from agent, play it
      playAudioChunk(event.data)
    }
  }
  
  return () => ws.close()
}, [])
```

### VoiceVisualizer State Mapping

```typescript
// Default state is 'listening' (always-on)
const [voiceState, setVoiceState] = useState<VizState>('listening')
const [isMuted, setIsMuted] = useState(false)

// Mute button (not talk button)
<button onClick={() => setIsMuted(!isMuted)}>
  {isMuted ? '🔇 Unmute' : '🎤 Mute'}
</button>

// When muted, show idle state
// When unmuted, default to listening
// Speaking/thinking states come from WebSocket events
```

### Voice Commands (handled by Gemini Live on the backend)

The Pipecat server has built-in tool calling. When you say things like:
- "What's the status?" → Gemini calls the briefing tool
- "Assign X to Y" → Gemini calls the delegation tool
- "Talk to [employee]" → Gemini switches the active agent voice

No frontend command parsing needed — Gemini handles intent detection natively.

---

## Phase 4: Real-Time SSE Updates

Connect to the SSE stream for live dashboard updates:

```typescript
useEffect(() => {
  const eventSource = new EventSource(`${API_URL}/api/stream`)
  
  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data)
    
    switch (data.type) {
      case 'activity':
        // Prepend to Hive Mind feed
        addTimelineEvent(data.payload)
        break
      case 'connected':
        console.log('SSE connected')
        break
    }
  }
  
  eventSource.onerror = () => {
    // Auto-reconnect (EventSource does this by default)
  }
  
  return () => eventSource.close()
}, [])
```

Use Sonner (already installed) for toast notifications on important events:
```typescript
import { toast } from 'sonner'

// On security event:
toast.error('Injection attempt blocked', { description: event.summary })

// On job completion:
toast.success('PR opened', { description: event.summary })

// On batch completion:
toast.info('Batch complete', { description: `${completed} jobs done, $${cost} spent` })
```

---

## Component Mapping (Lovable → Blade API)

| Lovable Component | Data Source | Notes |
|-------------------|------------|-------|
| `TopBar` gauges | `GET /api/health` + `GET /api/security/stats` | Green/yellow/red from severity |
| `TopBar` spend | `GET /api/costs?period=today` | `totalCostUsd` → TickerNumber |
| `CommandPage` HUD widgets | `/api/missions` + `/api/memory/stats` | Count active/total |
| `CommandPage` delegation feed | `GET /api/timeline?limit=10` | Replace SEED array |
| `CommandPage` transcript | WebSocket `ws://host:7861` | Real voice transcript |
| `CouncilPage` agent cards | `GET /api/employees` | Map to Agent interface |
| `MissionsPage` lanes | `GET /api/missions` | Group by assignedEmployee |
| `MemoryPage` cards | `GET /api/memory?q=` | Hybrid search results |
| `DispatchPage` items | `GET /api/jobs` | Job lifecycle status |
| `CalendarPage` events | Employee routines | Cron → calendar blocks |
| **NEW** Q-Router panel | `/api/routing/stats` + `/q-values` + `/episodes` | Heatmap + charts |
| **NEW** Autopilot panel | `/api/autopilot/batches` + `/:id` | Progress + controls |
| **NEW** Security panel | `/api/security/stats` + `/events` | Severity + feed |
| **NEW** ReasoningBank | `/api/reasoning/patterns` + `/stats` | Pattern cards |

## Agent Color Mapping

```typescript
const DEPARTMENT_COLORS: Record<string, { color: string; glow: string }> = {
  leadership:  { color: '#DC2626', glow: '0 0 24px #DC262640' },
  sales:       { color: '#7C3AED', glow: '0 0 24px #7C3AED40' },
  marketing:   { color: '#2563EB', glow: '0 0 24px #2563EB40' },
  content:     { color: '#D97706', glow: '0 0 24px #D9770640' },
  ops:         { color: '#6B7280', glow: '0 0 24px #6B728040' },
  engineering: { color: '#10B981', glow: '0 0 24px #10B98140' },
  general:     { color: '#8B5CF6', glow: '0 0 24px #8B5CF640' },
}
```

## State Management

Replace local useState with Zustand for cross-component state:

```typescript
// src/stores/blade-store.ts
import { create } from 'zustand'

interface BladeState {
  employees: Employee[]
  missions: Mission[]
  memories: Memory[]
  jobs: Job[]
  batchRuns: BatchRun[]
  securityStats: { injectionsToday: number; exfiltrationsToday: number; severity: string }
  routingStats: { taskTypes: { taskType: string; visitCount: number }[] }
  voiceState: 'idle' | 'listening' | 'thinking' | 'speaking'
  isMuted: boolean
  activeEmployee: string | null
  todayCost: number
  
  fetchEmployees: () => Promise<void>
  fetchMissions: () => Promise<void>
  createMission: (title: string, description: string, priority: number) => Promise<void>
  toggleMute: () => void
  setVoiceState: (state: BladeState['voiceState']) => void
}
```

## Environment Variables

```env
VITE_API_URL=https://your-railway-url.up.railway.app
VITE_VOICE_WS_URL=wss://your-railway-url.up.railway.app:7861
```

## Design Principles

1. **Voice is always on** — Default state is listening, not idle. Push-to-mute, not push-to-talk.
2. **Single pane of glass** — Command page shows everything without scrolling.
3. **Real-time by default** — SSE stream updates all widgets live. No manual refresh.
4. **Intelligence is visible** — Show Q-router learning, memory consolidating, patterns forming. The system feels alive.
5. **Cost-aware** — Always show the spend. Token efficiency is visible.
6. **Security is ambient** — Green dot when clear, red pulse when threats detected.
