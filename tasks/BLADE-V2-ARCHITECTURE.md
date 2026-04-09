# Blade v2 Architecture Spec

**Vision:** Blade becomes an Agent Operating System with one shared core and three product surfaces: Assistant, Employees, and Command Center.

**Date:** 2026-04-08
**Status:** Draft
**Author:** Claude + Emeka

---

## Table of Contents

1. [Current State Audit](#1-current-state-audit)
2. [Target Architecture](#2-target-architecture)
3. [Conversation Service](#3-conversation-service)
4. [Control Plane vs Execution Plane](#4-control-plane-vs-execution-plane)
5. [Employees as First-Class Objects](#5-employees-as-first-class-objects)
6. [Monitoring Layer](#6-monitoring-layer)
7. [Multi-Agent Orchestration](#7-multi-agent-orchestration)
8. [Command Center UI](#8-command-center-ui)
9. [Employee Roster](#9-employee-roster)
10. [Module Map: Add / Refactor / Retire](#10-module-map)
11. [Migration Plan: New Tables](#11-migration-plan)
12. [Package Restructure](#12-package-restructure)
13. [30 / 60 / 90 Roadmap](#13-roadmap)
14. [Risk Register](#14-risk-register)

---

## 1. Current State Audit

### What Exists (12,202 LOC across 79 files in core)

| Layer | Files | LOC | Health |
|-------|-------|-----|--------|
| Agent Loop | `agent-loop.ts` | 319 | Solid. Callback-driven, cost-gated, stuck-loop detection. |
| Model Provider | `model-provider.ts` | 707 | Works. Supports Anthropic, OpenAI, OpenRouter, Claude CLI. Smart routing exists. |
| Tool Registry | `tool-registry.ts` + `tools/*` | 1,649 | Good. Scoped tools, 50+ registered. |
| Employees | `employees/*` | 1,567 | Promising but half-baked. Definitions exist, proactive behaviors defined but not reliably scheduled. |
| Orchestration | `orchestration/*` | 374 | DAG engine works. State stored in-memory with DB backup. |
| Coding Pipeline | `pipeline/*` | 847 | Production-grade. Clone -> Branch -> Docker -> Code -> Test -> PR. |
| Chat | `chat/reply.ts` + `apps/web/api/chat/route.ts` | ~300 | Functional SSE streaming. Channel logic baked into route.ts. |
| Telegram | `integrations/telegram.ts` | 482 | Works but duplicates conversation logic from route.ts. |
| Learning | `learning/*` | 478 | Post-conversation and post-job extraction. Memory injection. |
| Intelligence | `intelligence/*` | 827 | Predictions, emotional awareness. Not wired to UI. |
| Memory | `memory/*` + DB FTS5 | 230 | FTS5 retrieval. No vector embeddings yet. |
| Skills | `skills/*` | 439 | Load/select/generate. YAML format. |
| Gamification | `gamification/*` | 417 | XP, streaks, achievements. Wired to CLI. |
| Evolution | `evolution/*` | 602 | Self-evolve, prompt optimizer, competitive moat. |
| DB | 6 migrations, 20+ repos | ~800 | SQLite + better-sqlite3. WAL mode. Solid for single-node. |
| Web | Next.js 14 App Router | ~2,000 | Chat, Jobs, Costs, Settings, Onboarding. Dark theme. |
| CLI | 14 commands | ~600 | Setup, chat, code, jobs, costs, team, briefing, evolve. |

### What's Missing

| Gap | Impact |
|-----|--------|
| No unified conversation engine | Telegram and web duplicate reply logic |
| No control/execution plane boundary | Everything lives in `core`; no clear API surface |
| Employees are prompts, not product objects | No runtime lifecycle, no tool scoping per employee, no policy enforcement |
| No monitoring subsystem | Intelligence module predicts but doesn't watch external sources |
| Orchestration state is fragile | In-memory maps with DB fallback; no event sourcing |
| No approval/policy engine | Any agent can use any tool |
| No activity timeline | SSE events are consumed and discarded; no audit trail for UI |
| No multi-channel sync | Conversation in Telegram can't continue in web |
| Dashboard has 4 views | Needs 6+ for command center vision |

---

## 2. Target Architecture

```
                         BLADE v2 ARCHITECTURE
  ================================================================

  ┌──────────────────────── PRODUCT SURFACES ─────────────────────┐
  │                                                                │
  │  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
  │  │  Assistant   │  │  Employees   │  │   Command Center      │ │
  │  │  (Chat UI,   │  │  (Roster,    │  │   (Today, Agents,     │ │
  │  │   Telegram,  │  │   KPIs,      │  │    Runs, Business,    │ │
  │  │   CLI, API)  │  │   Routines)  │  │    Memory, Control)   │ │
  │  └──────┬───────┘  └──────┬───────┘  └───────────┬───────────┘ │
  │         │                 │                      │              │
  └─────────┼─────────────────┼──────────────────────┼─────────────┘
            │                 │                      │
  ┌─────────▼─────────────────▼──────────────────────▼─────────────┐
  │                     CONVERSATION SERVICE                        │
  │  Unified reply engine, memory retrieval, tool policy,           │
  │  activity traces, channel adapters                              │
  └─────────────────────────────┬──────────────────────────────────┘
                                │
  ┌─────────────────────────────▼──────────────────────────────────┐
  │                       CONTROL PLANE                             │
  │                                                                 │
  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
  │  │  Users &  │ │ Agents & │ │ Policies │ │ Monitors │          │
  │  │  Auth     │ │ Registry │ │ & Approvals│ │ & KPIs  │          │
  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
  │  │  Jobs &   │ │ Schedules│ │ Memory & │ │ Costs &  │          │
  │  │  Runs     │ │ & Cron   │ │ Skills   │ │ Budgets  │          │
  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
  │  ┌──────────────────────────────────────────────┐              │
  │  │              Activity Timeline                │              │
  │  │  (Event store for all actions, decisions,     │              │
  │  │   tool calls, approvals, errors)              │              │
  │  └──────────────────────────────────────────────┘              │
  └─────────────────────────────┬──────────────────────────────────┘
                                │
  ┌─────────────────────────────▼──────────────────────────────────┐
  │                      EXECUTION PLANE                            │
  │                                                                 │
  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
  │  │  Agent    │ │  Tool    │ │  Docker  │ │  Sub-    │          │
  │  │  Loop     │ │  Runner  │ │  Sandbox │ │  Agents  │          │
  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
  │  ┌──────────┐ ┌──────────┐ ┌──────────┐                       │
  │  │  Coding  │ │  Model   │ │  Channel │                       │
  │  │  Pipeline│ │  Provider│ │  Adapters │                       │
  │  └──────────┘ └──────────┘ └──────────┘                       │
  └────────────────────────────────────────────────────────────────┘
```

### Package Map (Target)

```
packages/
  core/              → EXECUTION PLANE (agent loop, tools, model, pipeline)
  control/           → CONTROL PLANE (NEW — agents, policies, monitors, timeline)
  conversation/      → CONVERSATION SERVICE (NEW — unified engine + adapters)
  db/                → Database layer (expanded migrations)
  shared/            → Logger, config, env (unchanged)
  docker-runner/     → Docker sandbox (unchanged)

apps/
  web/               → Command Center + Assistant UI (expanded)
  cli/               → Terminal interface (expanded)
  api/               → REST/WebSocket API server (NEW — extracted from web)
```

---

## 3. Conversation Service

### Problem

Today, `apps/web/src/app/api/chat/route.ts` and `packages/core/src/integrations/telegram.ts` both:
- Build system prompts
- Retrieve memories
- Call `runAgentLoop()` or `runConversationReply()`
- Persist messages
- Track costs
- Format responses

This means every new channel (Slack, email, WhatsApp, API) requires duplicating ~200 lines of orchestration logic.

### Solution: `packages/conversation/`

```
packages/conversation/src/
  index.ts                    # Public exports
  engine.ts                   # ConversationEngine class
  types.ts                    # ConversationRequest, ConversationEvent, etc.
  context-builder.ts          # System prompt + memory + employee context assembly
  policy-resolver.ts          # Which tools/models this conversation is allowed
  activity-emitter.ts         # Emit structured events to the activity timeline
  adapters/
    web.ts                    # SSE adapter (replaces route.ts logic)
    telegram.ts               # Telegram adapter (replaces telegram.ts logic)
    cli.ts                    # CLI adapter
    api.ts                    # REST API adapter (for external integrations)
    slack.ts                  # Future
    email.ts                  # Future
```

### ConversationEngine API

```typescript
interface ConversationEngine {
  // Core method — all channels call this
  reply(request: ConversationRequest): AsyncGenerator<ConversationEvent>

  // Lifecycle
  startConversation(channelId: string, channel: ChannelType): ConversationId
  resumeConversation(conversationId: ConversationId): ConversationState
  getHistory(conversationId: ConversationId, limit?: number): Message[]

  // Cross-channel sync
  linkChannel(conversationId: ConversationId, channelId: string, channel: ChannelType): void
}

interface ConversationRequest {
  conversationId: ConversationId
  message: string
  channel: ChannelType
  channelMetadata?: Record<string, unknown>  // Telegram chat_id, web session, etc.
  employeeId?: string                         // Which employee is responding
  userId: string
}

type ConversationEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; name: string; input: unknown; result: unknown; success: boolean }
  | { type: 'turn'; iteration: number; toolCalls: number }
  | { type: 'thinking'; summary: string }
  | { type: 'handoff'; from: string; to: string; reason: string }
  | { type: 'approval_required'; action: string; toolName: string }
  | { type: 'done'; response: string; cost: number; toolCalls: number }
  | { type: 'error'; message: string }
```

### What Changes

| Current File | Action | Details |
|-------------|--------|---------|
| `apps/web/src/app/api/chat/route.ts` | **Refactor** | Becomes thin SSE adapter calling `engine.reply()` |
| `packages/core/src/integrations/telegram.ts` | **Refactor** | Becomes thin adapter calling `engine.reply()` |
| `packages/core/src/chat/reply.ts` | **Move** | Logic absorbed into `ConversationEngine.reply()` |
| `packages/core/src/learning/memory-injection.ts` | **Move** | Becomes `context-builder.ts` |

### Channel Adapter Contract

```typescript
interface ChannelAdapter {
  channel: ChannelType
  formatResponse(events: AsyncGenerator<ConversationEvent>): unknown
  parseIncoming(raw: unknown): ConversationRequest
  sendResponse(formatted: unknown): Promise<void>
}
```

Each adapter is ~50-80 lines. The engine does the work.

---

## 4. Control Plane vs Execution Plane

### Problem

Today, `packages/core/` mixes:
- **Control concerns**: Employee registration, workflow definitions, handoff routing, scorecard tracking, cron scheduling
- **Execution concerns**: Agent loop, tool execution, model calling, Docker sandboxing

This makes it hard to add policies, approvals, audit trails, and dashboard queries without touching execution code.

### Solution: Split into `packages/control/` and keep `packages/core/` as execution-only

### `packages/control/src/`

```
packages/control/src/
  index.ts
  types.ts

  agents/
    registry.ts              # Agent/employee registration and lifecycle
    lifecycle.ts             # Activate, deactivate, suspend, resume
    policy.ts                # Tool allowlists, model restrictions, budget caps per agent

  jobs/
    manager.ts               # Job creation, status transitions, assignment
    runner.ts                # Delegates to execution plane

  schedules/
    cron-manager.ts          # Cron registration, execution tracking
    routine-runner.ts        # Employee routine execution

  workflows/
    definition-store.ts      # Workflow CRUD (replaces in-memory defineWorkflow)
    execution-manager.ts     # Run, pause, resume, cancel workflows
    step-router.ts           # Route steps to correct agent/employee

  approvals/
    policy-engine.ts         # Approval rules (tool X requires human approval)
    inbox.ts                 # Pending approvals queue
    resolver.ts              # Approve/reject with audit trail

  monitors/
    monitor-registry.ts      # Register KPI sources and thresholds
    checker.ts               # Run checks on schedule, detect anomalies
    alerter.ts               # Route alerts to channels/employees

  timeline/
    event-store.ts           # Append-only activity log
    query.ts                 # Query events by agent, time, type
    types.ts                 # ActivityEvent union type

  memory/
    memory-manager.ts        # CRUD + search (wraps DB repos)
    scope.ts                 # Memory scoping per agent/conversation

  costs/
    budget-manager.ts        # Per-agent and global budgets
    tracker.ts               # Real-time cost aggregation
```

### `packages/core/src/` (Execution Plane — what stays)

```
packages/core/src/
  agent-loop.ts              # STAYS — core execution engine
  model-provider.ts          # STAYS — LLM calling
  tool-registry.ts           # STAYS — tool execution
  cost-tracker.ts            # STAYS — token pricing math
  personality.ts             # STAYS

  tools/                     # STAYS — all tool implementations
  pipeline/                  # STAYS — coding pipeline
  memory/                    # STAYS — in-process retrieval (FTS5)
  rag/                       # STAYS — document ingestion
  voice/                     # STAYS — TTS/STT
  security/                  # STAYS — env sanitization

  # REMOVED from core (moved to control):
  # employees/               → packages/control/src/agents/
  # orchestration/           → packages/control/src/workflows/
  # cron/                    → packages/control/src/schedules/
  # webhooks/                → packages/control/src/workflows/ (trigger handling)
  # intelligence/            → packages/control/src/monitors/
  # evolution/               → packages/control/src/agents/ (self-improve becomes agent lifecycle)
  # gamification/            → packages/control/src/agents/ (part of agent profile)
  # learning/                → packages/control/src/memory/
  # skills/                  → packages/control/src/agents/ (skills are agent capabilities)
```

### Boundary Contract

The control plane calls the execution plane through a clean interface:

```typescript
// packages/core/src/execution-api.ts (NEW)
export interface ExecutionAPI {
  // Run an agent loop
  runLoop(options: AgentLoopOptions): AsyncGenerator<AgentEvent>

  // Execute a single tool
  executeTool(name: string, input: Record<string, unknown>, context: ExecutionContext): Promise<ToolCallResult>

  // Run the coding pipeline
  runCodingPipeline(options: CodingPipelineOptions): Promise<CodingPipelineResult>

  // Model operations
  callModel(config: ModelConfig, systemPrompt: string, messages: AgentMessage[], tools?: ToolDefinition[]): Promise<ModelResponse>
  streamModel(config: ModelConfig, systemPrompt: string, messages: AgentMessage[], tools?: ToolDefinition[]): AsyncGenerator<StreamEvent>

  // Tool management
  getToolDefinitions(scope?: string): ToolDefinition[]
  createToolScope(id: string, allowedTools: string[]): void
  destroyToolScope(id: string): void
}
```

---

## 5. Employees as First-Class Objects

### Problem

Today, employees are:
- Type definitions in `employees/types.ts`
- Side-effect registrations via `registerEmployee()` at import time
- Global tool access (no per-employee restrictions)
- In-memory handoffs (lost on restart)
- Scorecard entries without trend analysis

### Target: Employee as a Durable, Policy-Bound, Observable Product Object

### New Employee Schema

```typescript
interface Employee {
  // Identity
  id: string                          // e.g., "chief-of-staff"
  name: string                        // "Chief of Staff"
  title: string                       // "Executive Assistant & Strategic Advisor"
  department: Department              // "executive" | "engineering" | "sales" | "marketing" | ...
  icon: string                        // Emoji or icon key

  // Behavior
  systemPrompt: string                // Base personality
  archetype: Archetype                // "coach" | "operator"
  personality: PersonalityConfig      // Tone, formality, humor level

  // Capabilities
  allowedTools: string[]              // Whitelist of tool names
  blockedTools: string[]              // Explicit denials
  modelPreference: ModelTier          // "light" | "standard" | "heavy"
  maxBudgetPerRun: number             // USD cap per invocation
  maxConcurrentRuns: number           // Parallel execution limit

  // Organization
  manager: string | null              // Employee ID of manager (null = reports to user)
  directReports: string[]             // Employee IDs
  escalationPolicy: EscalationPolicy  // When and how to escalate
  handoffRules: HandoffRule[]         // Auto-handoff conditions

  // Accountability
  objective: string                   // OKR-style objective
  kpis: KPIDefinition[]              // Measurable targets
  routines: Routine[]                 // Scheduled recurring tasks

  // Memory
  memoryScope: MemoryScope            // What memories this employee can access
  outputChannels: ChannelType[]       // Where this employee sends results

  // Metadata
  status: EmployeeStatus              // "active" | "suspended" | "onboarding" | "archived"
  hiredAt: string
  lastActiveAt: string
  totalRuns: number
  totalCost: number
  successRate: number
}

interface KPIDefinition {
  id: string
  name: string                        // "Revenue Pipeline Value"
  description: string
  source: KPISource                   // How to measure it
  target: number
  unit: string                        // "$", "%", "count", "hours"
  frequency: "daily" | "weekly" | "monthly"
  direction: "higher_is_better" | "lower_is_better"
  thresholds: { green: number; yellow: number; red: number }
}

interface KPISource {
  type: "manual" | "integration" | "query" | "computed"
  integration?: string               // "stripe" | "ghl" | "github" | ...
  query?: string                     // SQL or API query
  computation?: string               // Formula referencing other KPIs
}

interface Routine {
  id: string
  name: string                        // "Morning Pipeline Review"
  description: string
  schedule: string                    // Cron expression
  task: string                        // What the employee does
  tools: string[]                     // Tools needed for this routine
  outputChannel: ChannelType          // Where to post results
  timeout: number                     // Max seconds
  enabled: boolean
}

interface EscalationPolicy {
  escalateTo: string                  // Employee ID or "user"
  conditions: EscalationCondition[]
}

interface EscalationCondition {
  trigger: "error" | "budget_exceeded" | "confidence_low" | "blocked" | "approval_needed"
  threshold?: number
  action: "notify" | "handoff" | "pause_and_ask"
}

interface HandoffRule {
  condition: string                   // "topic contains 'billing'"
  targetEmployee: string
  priority: "low" | "medium" | "high" | "urgent"
  autoAccept: boolean
}
```

### New DB Migration: `0007_employees_v2.sql`

```sql
-- Expand employees table
ALTER TABLE employees ADD COLUMN department TEXT DEFAULT 'general';
ALTER TABLE employees ADD COLUMN objective TEXT;
ALTER TABLE employees ADD COLUMN manager_id TEXT;
ALTER TABLE employees ADD COLUMN allowed_tools_json TEXT DEFAULT '[]';
ALTER TABLE employees ADD COLUMN blocked_tools_json TEXT DEFAULT '[]';
ALTER TABLE employees ADD COLUMN model_preference TEXT DEFAULT 'standard';
ALTER TABLE employees ADD COLUMN max_budget_per_run REAL DEFAULT 1.0;
ALTER TABLE employees ADD COLUMN max_concurrent_runs INTEGER DEFAULT 1;
ALTER TABLE employees ADD COLUMN escalation_policy_json TEXT;
ALTER TABLE employees ADD COLUMN handoff_rules_json TEXT DEFAULT '[]';
ALTER TABLE employees ADD COLUMN memory_scope TEXT DEFAULT 'own';
ALTER TABLE employees ADD COLUMN output_channels_json TEXT DEFAULT '["web"]';
ALTER TABLE employees ADD COLUMN status TEXT DEFAULT 'active';
ALTER TABLE employees ADD COLUMN hired_at TEXT DEFAULT (datetime('now'));
ALTER TABLE employees ADD COLUMN last_active_at TEXT;
ALTER TABLE employees ADD COLUMN total_runs INTEGER DEFAULT 0;
ALTER TABLE employees ADD COLUMN total_cost_usd REAL DEFAULT 0;
ALTER TABLE employees ADD COLUMN success_rate REAL DEFAULT 0;

-- KPI definitions (per employee)
CREATE TABLE IF NOT EXISTS kpi_definitions (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  source_json TEXT NOT NULL,
  target REAL NOT NULL,
  unit TEXT NOT NULL DEFAULT 'count',
  frequency TEXT NOT NULL DEFAULT 'weekly',
  direction TEXT NOT NULL DEFAULT 'higher_is_better',
  thresholds_json TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (employee_id) REFERENCES employees(slug)
);

-- KPI measurements (time series)
CREATE TABLE IF NOT EXISTS kpi_measurements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kpi_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  value REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'green',  -- green | yellow | red
  measured_at TEXT DEFAULT (datetime('now')),
  source TEXT,  -- what produced this measurement
  FOREIGN KEY (kpi_id) REFERENCES kpi_definitions(id),
  FOREIGN KEY (employee_id) REFERENCES employees(slug)
);

-- Routines (scheduled employee tasks)
CREATE TABLE IF NOT EXISTS routines (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  schedule TEXT NOT NULL,  -- cron expression
  task TEXT NOT NULL,
  tools_json TEXT DEFAULT '[]',
  output_channel TEXT DEFAULT 'web',
  timeout_seconds INTEGER DEFAULT 300,
  enabled INTEGER DEFAULT 1,
  last_run_at TEXT,
  next_run_at TEXT,
  run_count INTEGER DEFAULT 0,
  last_status TEXT,  -- success | failed | timeout
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (employee_id) REFERENCES employees(slug)
);

-- Activity timeline (append-only event store)
CREATE TABLE IF NOT EXISTS activity_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,  -- conversation | tool_call | handoff | approval | error | kpi_change | routine_run | job_status | ...
  actor_type TEXT NOT NULL,  -- user | employee | system
  actor_id TEXT NOT NULL,
  target_type TEXT,          -- conversation | job | employee | kpi | ...
  target_id TEXT,
  summary TEXT NOT NULL,
  detail_json TEXT,
  conversation_id TEXT,
  job_id TEXT,
  cost_usd REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_activity_events_type ON activity_events(event_type);
CREATE INDEX idx_activity_events_actor ON activity_events(actor_id);
CREATE INDEX idx_activity_events_target ON activity_events(target_type, target_id);
CREATE INDEX idx_activity_events_created ON activity_events(created_at);

-- Approval queue
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  requested_by TEXT NOT NULL,  -- employee_id
  action TEXT NOT NULL,        -- what the employee wants to do
  tool_name TEXT,
  tool_input_json TEXT,
  context TEXT,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'pending',  -- pending | approved | rejected | expired
  decided_by TEXT,             -- user or manager employee_id
  decided_at TEXT,
  expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Monitors (external data source watchers)
CREATE TABLE IF NOT EXISTS monitors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  employee_id TEXT,            -- which employee owns this monitor
  source_type TEXT NOT NULL,   -- integration | webhook | cron_check | query
  source_config_json TEXT NOT NULL,
  check_schedule TEXT NOT NULL,  -- cron expression
  thresholds_json TEXT,
  last_checked_at TEXT,
  last_value TEXT,
  last_status TEXT DEFAULT 'unknown',  -- ok | warning | critical | unknown
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Monitor alerts
CREATE TABLE IF NOT EXISTS monitor_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monitor_id TEXT NOT NULL,
  severity TEXT NOT NULL,      -- info | warning | critical
  message TEXT NOT NULL,
  value TEXT,
  acknowledged INTEGER DEFAULT 0,
  acknowledged_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (monitor_id) REFERENCES monitors(id)
);
```

---

## 6. Monitoring Layer

### Architecture

```
packages/control/src/monitors/

  monitor-registry.ts        # Register monitors with sources and thresholds
  checker.ts                 # Execute checks on schedule
  alerter.ts                 # Route alerts to the right channel/employee
  anomaly-detector.ts        # Statistical anomaly detection (z-score, trend breaks)
  briefing-generator.ts      # Daily/weekly executive summaries
```

### Built-in Monitor Templates

| Monitor | Source | Check | Alert Threshold |
|---------|--------|-------|-----------------|
| Revenue Pulse | Stripe API | Daily revenue vs 7-day avg | < 70% of average |
| Pipeline Health | GHL/HubSpot | Open deals value & stage velocity | Stale deals > 14 days |
| Support Backlog | Integration | Unresolved ticket count | > 10 unresolved |
| Deploy Health | GitHub API | Failed CI runs, open incidents | Any failure on main |
| Content Cadence | Internal | Days since last publish | > 7 days gap |
| PR Velocity | GitHub API | Open PR count, avg review time | > 5 open PRs |
| Cost Burn Rate | Internal | Daily spend vs budget | > 80% of budget |
| Memory Growth | Internal | Memory count, avg confidence | Confidence drift < 0.3 |
| Employee Health | Internal | Success rate, error count per employee | Success rate < 70% |

### Anomaly Detection

```typescript
interface AnomalyDetector {
  // Z-score based: flag if current value is >2 std devs from 14-day rolling mean
  detectStatistical(values: TimeSeries, current: number): AnomalyResult

  // Trend break: flag if direction reverses for 3+ consecutive periods
  detectTrendBreak(values: TimeSeries): AnomalyResult

  // Threshold: simple above/below check
  detectThreshold(value: number, thresholds: Thresholds): AnomalyResult
}
```

### Executive Briefing

Generated daily at a configured time (default 8am). Combines:
- KPI status across all employees (red/yellow/green)
- Monitor alerts from last 24h
- Stalled work (jobs/workflows not progressing)
- Cost summary
- Recommended actions (from intelligence module predictions)

Output goes to the "Today" view in Command Center + optional Telegram/Slack.

---

## 7. Multi-Agent Orchestration

### Problem

Today's orchestration (`orchestration/engine.ts`) defines workflows as DAGs of steps, but:
- Steps are employee-scoped but don't respect employee policies
- No visibility into what's running right now
- Handoffs are in-memory (lost on restart)
- No approval gates in workflows

### Solution: Observable, Policy-Aware Orchestration

### `packages/control/src/workflows/`

```typescript
interface WorkflowV2 extends Workflow {
  // Existing fields plus:
  approvalGates: ApprovalGate[]       // Steps that require human approval before proceeding
  escalationPolicy: EscalationPolicy  // What happens when a step fails
  maxCost: number                     // Total budget for entire workflow
  maxDuration: number                 // Seconds
  visibility: "private" | "team"      // Who can see this workflow running
}

interface ApprovalGate {
  afterStep: string                   // Step ID
  approver: string                    // "user" | employee ID
  timeout: number                     // Seconds before auto-escalation
  autoApprove?: boolean               // For low-risk steps
}

interface WorkflowRunV2 extends WorkflowRun {
  // Existing fields plus:
  events: ActivityEvent[]             // Full event timeline for this run
  approvals: ApprovalRecord[]         // Approval decisions
  activeSteps: string[]               // Currently executing step IDs
  blockedSteps: string[]              // Waiting for approval or dependency
  costSoFar: number
  estimatedCostRemaining: number
}
```

### Subagent Manager

New module that sits between the control plane and execution plane:

```typescript
// packages/control/src/workflows/subagent-manager.ts

interface SubagentManager {
  // Spawn a scoped agent for a workflow step
  spawn(options: {
    employeeId: string
    task: string
    tools: string[]              // Restricted to employee's allowedTools
    budget: number
    timeout: number
    parentRunId: string          // Workflow run this belongs to
    context: Record<string, unknown>  // Previous step outputs
  }): Promise<SubagentHandle>

  // Monitor running subagents
  listActive(): SubagentHandle[]
  getStatus(handleId: string): SubagentStatus
  cancel(handleId: string): void

  // Policy enforcement
  checkToolAccess(employeeId: string, toolName: string): boolean
  checkBudget(employeeId: string, cost: number): boolean
}
```

### What the User Sees

The "Runs" view in Command Center shows:
- Active workflow runs with step-by-step progress
- Which employee is executing which step
- Tool calls in real-time
- Approval requests with approve/reject buttons
- Cost accumulation
- Error details with retry option

---

## 8. Command Center UI

### New Route Structure

```
apps/web/src/app/
  (dashboard)/
    layout.tsx                 # Dashboard shell with sidebar nav
    page.tsx                   # Today view (default)
    agents/
      page.tsx                 # Agent roster
      [id]/
        page.tsx               # Individual agent detail
    runs/
      page.tsx                 # Execution timeline
      [id]/
        page.tsx               # Individual run detail
    business/
      page.tsx                 # KPIs and monitors
    memory/
      page.tsx                 # Memory browser
    control/
      page.tsx                 # Settings, policies, integrations
      policies/
        page.tsx               # Approval policies
      integrations/
        page.tsx               # Connected services
      budgets/
        page.tsx               # Cost controls
  chat/
    page.tsx                   # Assistant chat (full screen)
    [conversationId]/
      page.tsx                 # Specific conversation
  login/
    page.tsx                   # Auth (existing)
  onboarding/
    page.tsx                   # Employee onboarding (existing, expanded)
```

### View Specifications

#### Today View (`/`)

```
┌─────────────────────────────────────────────────────────┐
│  Good morning, Emeka.              April 8, 2026        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  🔴 ALERTS (3)                                           │
│  ├─ Revenue down 23% vs 7-day avg (Stripe)              │
│  ├─ 2 PRs waiting review > 48h (GitHub)                 │
│  └─ Support backlog at 12 tickets (GHL)                 │
│                                                          │
│  📋 RECOMMENDED ACTIONS                                  │
│  ├─ ☐ Review SDR's pipeline — 3 deals stalled > 14d    │
│  ├─ ☐ Approve Content Lead's weekly publish plan        │
│  └─ ☐ Check failed deploy on feature/auth-refactor      │
│                                                          │
│  ⏰ SCHEDULED TODAY                                      │
│  ├─ 09:00 — SDR: Morning pipeline review                │
│  ├─ 10:00 — Content Lead: Publish blog post             │
│  ├─ 14:00 — Staff Engineer: PR review sweep             │
│  └─ 17:00 — Finance Analyst: Daily cost report          │
│                                                          │
│  📊 KPI SNAPSHOT                                         │
│  ├─ Revenue:  $42,300 MTD  🟢 (+12% vs target)         │
│  ├─ Pipeline: $180K open   🟡 (velocity slowing)       │
│  ├─ NPS:      72           🟢 (stable)                  │
│  ├─ PR Cycle: 18h avg      🟡 (was 12h last week)      │
│  └─ Costs:    $847 MTD     🟢 (under budget)           │
│                                                          │
│  🏃 ACTIVE RIGHT NOW                                     │
│  ├─ Staff Engineer: coding "Add health check" (67%)     │
│  └─ SDR: qualifying lead "Acme Corp" (tool: ghl)       │
│                                                          │
│  📝 EXECUTIVE BRIEFING                                   │
│  "Revenue is tracking well this month but pipeline       │
│   velocity is slowing. Three deals in Acme, Widget Co,  │
│   and DataFlow haven't moved stages in 14+ days..."     │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

#### Agents View (`/agents`)

| Column | Content |
|--------|---------|
| Avatar + Name | Icon, name, title |
| Status | Active / Idle / Suspended / Error |
| Current Task | What they're doing right now (or "Idle") |
| KPI Health | 🟢🟡🔴 stoplight for primary KPI |
| Runs Today | Count of completed runs |
| Cost Today | USD spent |
| Success Rate | Last 30 days |
| Last Active | Relative timestamp |

Click into agent detail for:
- Full KPI dashboard with trend charts
- Routine schedule and execution history
- Recent runs with tool calls
- Handoff history
- Memory scope browser
- Edit policies / tools / budget

#### Runs View (`/runs`)

Real-time timeline of all execution:

```
Timeline (newest first)
─────────────────────────────────────────
14:23  Staff Engineer  tool_call    exec_command "npm test" ✅  $0.02
14:22  Staff Engineer  tool_call    write_file "src/health.ts" ✅  $0.01
14:21  Staff Engineer  thinking     "Planning health check endpoint..."
14:20  Staff Engineer  job_started  "Add health check endpoint"
14:15  SDR             handoff      → Account Manager (deal qualified)
14:12  SDR             tool_call    ghl_update_contact ✅  $0.03
14:10  SDR             conversation "Qualifying Acme Corp lead"
14:00  System          routine      SDR: Morning Pipeline Review
13:45  Content Lead    approval     ⏳ Waiting: "Publish blog post?"
─────────────────────────────────────────
```

Filters: by agent, by type (conversation/job/routine/handoff), by time range, by status.

#### Business View (`/business`)

- KPI cards with sparkline trends (7d, 30d, 90d)
- Monitor status grid (green/yellow/red)
- Anomaly alerts
- "What changed" summaries (AI-generated explanations of metric movements)
- Forecast projections (linear extrapolation + intelligence module)

#### Memory View (`/memory`)

- Search bar with FTS
- Filter by type (fact/preference/skill/conversation/error_pattern)
- Filter by employee scope
- Memory graph visualization (related memories linked)
- Confidence scores with decay indicators
- Create/edit/delete memories

#### Control View (`/control`)

- **Integrations**: Connected services with status (Stripe, GHL, GitHub, Telegram, etc.)
- **Policies**: Approval rules, tool restrictions, budget limits
- **Schedules**: All cron jobs across all employees
- **Model Routing**: Which models are used for what
- **Secrets**: API key status (configured/missing, never show values)
- **Budgets**: Global and per-agent spending limits and current usage

### New API Routes

```
apps/web/src/app/api/
  # Existing (keep)
  chat/route.ts              → Refactor to use ConversationEngine
  conversations/route.ts     → Keep
  jobs/                      → Keep
  costs/route.ts             → Keep
  settings/route.ts          → Keep
  employees/                 → Expand
  memory/route.ts            → Keep

  # New
  timeline/route.ts          → GET activity events (paginated, filtered)
  agents/
    route.ts                 → GET list, POST create
    [id]/
      route.ts               → GET detail, PUT update, DELETE archive
      kpis/route.ts          → GET KPI data with trends
      routines/route.ts      → GET/POST/PUT routines
      runs/route.ts          → GET execution history
  runs/
    route.ts                 → GET active/recent runs
    [id]/route.ts            → GET run detail with events
  monitors/
    route.ts                 → GET/POST monitors
    [id]/route.ts            → GET detail, PUT update
    [id]/alerts/route.ts     → GET alerts
  approvals/
    route.ts                 → GET pending, POST approve/reject
  briefing/route.ts          → GET today's briefing
  business/
    kpis/route.ts            → GET all KPIs across employees
    anomalies/route.ts       → GET detected anomalies
```

---

## 9. Employee Roster

### Prebuilt Employees (Ship These)

| ID | Name | Department | Objective | Primary KPI | Key Tools |
|----|------|-----------|-----------|-------------|-----------|
| `chief-of-staff` | Chief of Staff | executive | Keep the operator informed and unblocked | Tasks completed on time | all (coordinator) |
| `product-manager` | Product Manager | product | Ship the right features at the right time | Feature delivery rate | memory, web_search, ghl |
| `engineering-manager` | Engineering Manager | engineering | Keep the codebase healthy and the team productive | PR cycle time | github, shell, filesystem |
| `staff-engineer` | Staff Engineer | engineering | Write excellent code, review PRs, unblock the team | Code quality score | all coding tools, docker |
| `sdr` | SDR | sales | Fill the pipeline with qualified leads | SQLs per week | ghl, web_search, memory |
| `account-manager` | Account Manager | sales | Expand revenue from existing accounts | Net revenue retention | ghl, stripe, memory |
| `support-lead` | Support Lead | support | Resolve customer issues fast | Avg resolution time | ghl, memory, web_search |
| `growth-lead` | Growth Lead | marketing | Drive acquisition and activation | MQLs per week | web_search, analytics, ghl |
| `content-lead` | Content Lead | marketing | Publish valuable content consistently | Publishes per week | filesystem, web_search, memory |
| `recruiting-lead` | Recruiting Lead | people | Hire the right people quickly | Time to fill | web_search, memory |
| `finance-analyst` | Finance Analyst | finance | Track and optimize cash flow | Monthly burn rate | stripe, memory, filesystem |
| `ops-manager` | Ops Manager | operations | Keep systems running and processes smooth | System uptime | shell, docker, github |

### Each Ships With

```yaml
# Example: sdr.yaml
id: sdr
name: SDR
title: Sales Development Representative
department: sales
icon: "🎯"

objective: "Fill the pipeline with qualified leads every week"

personality:
  archetype: operator
  tone: direct
  formality: low
  humor: medium

allowedTools:
  - ghl_search_contacts
  - ghl_create_contact
  - ghl_update_contact
  - ghl_add_note
  - web_search
  - save_memory
  - recall_memory
  - send_notification

kpis:
  - id: sqls_per_week
    name: SQLs Per Week
    target: 10
    unit: count
    frequency: weekly
    direction: higher_is_better
    thresholds: { green: 10, yellow: 6, red: 3 }
    source: { type: integration, integration: ghl }

  - id: outreach_volume
    name: Daily Outreach Volume
    target: 20
    unit: count
    frequency: daily
    direction: higher_is_better
    thresholds: { green: 20, yellow: 12, red: 5 }
    source: { type: query }

  - id: response_rate
    name: Response Rate
    target: 15
    unit: "%"
    frequency: weekly
    direction: higher_is_better
    thresholds: { green: 15, yellow: 8, red: 3 }
    source: { type: computed }

routines:
  - id: morning_pipeline
    name: Morning Pipeline Review
    schedule: "0 9 * * 1-5"
    task: |
      Review all open deals in GHL. Identify:
      1. Deals that haven't moved stages in 7+ days
      2. Deals missing next steps
      3. New inbound leads not yet contacted
      Post a summary to the Today view.
    tools: [ghl_search_contacts, recall_memory, send_notification]
    outputChannel: web
    timeout: 300

  - id: lead_qualification
    name: Lead Qualification Sweep
    schedule: "0 14 * * 1-5"
    task: |
      Check for new unqualified leads. For each:
      1. Research the company (web_search)
      2. Score against ICP criteria
      3. If qualified, update status in GHL and notify Account Manager
      4. If not, mark as disqualified with reason
    tools: [ghl_search_contacts, ghl_update_contact, web_search, save_memory]
    outputChannel: web
    timeout: 600

escalationPolicy:
  escalateTo: account-manager
  conditions:
    - trigger: confidence_low
      threshold: 0.4
      action: handoff
    - trigger: blocked
      action: notify

handoffRules:
  - condition: "deal qualified and ready for demo"
    targetEmployee: account-manager
    priority: high
    autoAccept: true
  - condition: "existing customer with support issue"
    targetEmployee: support-lead
    priority: medium
    autoAccept: true

manager: chief-of-staff

memoryScope: own  # Can only access its own memories + shared company memories

outputChannels: [web, telegram]
```

### Migration Path from Current Employees

| Current Employee | Maps To | Action |
|-----------------|---------|--------|
| `cash-machine` | `growth-lead` | Rename, expand tools/KPIs |
| `marketer` | `content-lead` | Rename, add routines |
| `closer` | `sdr` | Rename, add GHL integration |
| `connector` | `account-manager` | Rename, add retention KPIs |
| `support-rep` | `support-lead` | Rename, add escalation |
| `nurture-engine` | Absorbed into `sdr` + `account-manager` | Retire as standalone |
| `operator` | `ops-manager` | Rename, add monitoring |
| `code-agent` | `staff-engineer` | Rename, add PR review routines |
| `wellness-coach` | **Keep as optional add-on** | Not in default roster |
| `wealth-strategist` | `finance-analyst` | Rename, add Stripe KPIs |
| `reflector` | **Keep as optional add-on** | Not in default roster |

---

## 10. Module Map

### ADD (New Files)

| Package | File | Purpose |
|---------|------|---------|
| `packages/conversation/` | `engine.ts` | Unified conversation engine |
| `packages/conversation/` | `context-builder.ts` | System prompt + memory assembly |
| `packages/conversation/` | `policy-resolver.ts` | Tool/model restrictions per conversation |
| `packages/conversation/` | `activity-emitter.ts` | Emit events to timeline |
| `packages/conversation/` | `adapters/web.ts` | SSE adapter |
| `packages/conversation/` | `adapters/telegram.ts` | Telegram adapter |
| `packages/conversation/` | `adapters/cli.ts` | CLI adapter |
| `packages/conversation/` | `adapters/api.ts` | REST adapter |
| `packages/control/` | `agents/registry.ts` | Agent lifecycle management |
| `packages/control/` | `agents/policy.ts` | Per-agent tool/budget policies |
| `packages/control/` | `workflows/execution-manager.ts` | Observable workflow execution |
| `packages/control/` | `workflows/subagent-manager.ts` | Scoped subagent spawning |
| `packages/control/` | `approvals/policy-engine.ts` | Approval rules engine |
| `packages/control/` | `approvals/inbox.ts` | Approval queue |
| `packages/control/` | `monitors/monitor-registry.ts` | Monitor CRUD |
| `packages/control/` | `monitors/checker.ts` | Scheduled checks |
| `packages/control/` | `monitors/alerter.ts` | Alert routing |
| `packages/control/` | `monitors/anomaly-detector.ts` | Statistical detection |
| `packages/control/` | `monitors/briefing-generator.ts` | Executive briefings |
| `packages/control/` | `timeline/event-store.ts` | Activity event persistence |
| `packages/control/` | `timeline/query.ts` | Timeline queries |
| `packages/control/` | `costs/budget-manager.ts` | Per-agent budgets |
| `packages/control/` | `memory/scope.ts` | Memory scoping per agent |
| `packages/core/` | `execution-api.ts` | Clean boundary for control plane |
| `packages/db/` | `migrations/0007_employees_v2.sql` | New tables (see section 11) |
| `apps/web/` | `(dashboard)/page.tsx` | Today view |
| `apps/web/` | `(dashboard)/agents/page.tsx` | Agent roster |
| `apps/web/` | `(dashboard)/runs/page.tsx` | Execution timeline |
| `apps/web/` | `(dashboard)/business/page.tsx` | KPIs and monitors |
| `apps/web/` | `(dashboard)/memory/page.tsx` | Memory browser |
| `apps/web/` | `(dashboard)/control/page.tsx` | Settings & policies |
| `apps/web/` | `api/timeline/route.ts` | Timeline API |
| `apps/web/` | `api/agents/*/route.ts` | Agent CRUD APIs |
| `apps/web/` | `api/runs/*/route.ts` | Run detail APIs |
| `apps/web/` | `api/monitors/*/route.ts` | Monitor APIs |
| `apps/web/` | `api/approvals/route.ts` | Approval APIs |
| `apps/web/` | `api/briefing/route.ts` | Briefing API |

### REFACTOR (Existing Files)

| File | Change |
|------|--------|
| `apps/web/src/app/api/chat/route.ts` | Replace inline logic with `ConversationEngine.reply()` call |
| `packages/core/src/integrations/telegram.ts` | Replace inline logic with Telegram adapter |
| `packages/core/src/chat/reply.ts` | Absorb into ConversationEngine |
| `packages/core/src/employees/registry.ts` | Move to `packages/control/src/agents/registry.ts` |
| `packages/core/src/employees/collaboration.ts` | Move to `packages/control/src/workflows/` |
| `packages/core/src/employees/proactive.ts` | Move to `packages/control/src/schedules/routine-runner.ts` |
| `packages/core/src/employees/scorecard.ts` | Replace with KPI system in control plane |
| `packages/core/src/employees/self-improve.ts` | Move to `packages/control/src/agents/` |
| `packages/core/src/employees/briefing.ts` | Move to `packages/control/src/monitors/briefing-generator.ts` |
| `packages/core/src/orchestration/engine.ts` | Move workflow logic to `packages/control/src/workflows/` |
| `packages/core/src/orchestration/builtin-workflows.ts` | Move to control plane |
| `packages/core/src/cron/scheduler.ts` | Move to `packages/control/src/schedules/cron-manager.ts` |
| `packages/core/src/webhooks/trigger-handler.ts` | Move to `packages/control/src/workflows/` |
| `packages/core/src/intelligence/predictions.ts` | Move to `packages/control/src/monitors/` |
| `packages/core/src/learning/post-conversation.ts` | Move to `packages/control/src/memory/` |
| `packages/core/src/learning/memory-injection.ts` | Move to `packages/conversation/src/context-builder.ts` |
| `packages/core/src/index.ts` | Slim down to execution-only exports |
| `packages/core/src/types.ts` | Split: execution types stay, control types move |

### RETIRE (Remove)

| File | Reason |
|------|--------|
| `packages/core/src/employees/psychology.ts` | Buyer archetype detection is sales-specific; absorb relevant parts into SDR employee prompt |
| `packages/core/src/employees/builtin/*.ts` | Side-effect registration pattern replaced by YAML definitions loaded by control plane |
| `packages/core/src/gamification/*` | XP/achievements absorbed into agent profile metrics in control plane |
| `packages/core/src/evolution/competitive-moat.ts` | Marketing artifact, not runtime functionality |
| `packages/core/src/evolution/prompt-optimizer.ts` | Premature; replace with simpler version tracking in agent lifecycle |
| `packages/core/src/tools/builtin.ts` | Already deleted per git status |

---

## 11. Migration Plan: New Tables

### `0007_employees_v2.sql`

Full SQL in Section 5. Creates:
- `kpi_definitions` — KPI specs per employee
- `kpi_measurements` — Time series KPI data
- `routines` — Scheduled employee tasks
- `activity_events` — Append-only activity timeline
- `approvals` — Approval queue
- `monitors` — External source watchers
- `monitor_alerts` — Alert history

Plus `ALTER TABLE employees` to add 15 new columns.

### `0008_conversation_channels.sql`

```sql
-- Link conversations to multiple channels
CREATE TABLE IF NOT EXISTS conversation_channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL,
  channel_type TEXT NOT NULL,          -- web | telegram | cli | api | slack | email
  channel_id TEXT NOT NULL,            -- e.g., telegram chat_id, web session_id
  linked_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id),
  UNIQUE(conversation_id, channel_type, channel_id)
);

-- Add employee_id to conversations (which employee is responding)
ALTER TABLE conversations ADD COLUMN employee_id TEXT;
ALTER TABLE conversations ADD COLUMN channel_type TEXT DEFAULT 'web';
```

---

## 12. Package Restructure

### Dependency Graph

```
apps/web ──────────┐
apps/cli ──────────┤
                   ▼
          packages/conversation
              │         │
              ▼         ▼
     packages/control  packages/core
              │         │
              ▼         ▼
          packages/db
              │
              ▼
        packages/shared
              │
              ▼
      packages/docker-runner (core only)
```

### New `package.json` entries

```json
// packages/conversation/package.json
{
  "name": "@blade/conversation",
  "dependencies": {
    "@blade/control": "workspace:*",
    "@blade/core": "workspace:*",
    "@blade/db": "workspace:*",
    "@blade/shared": "workspace:*"
  }
}

// packages/control/package.json
{
  "name": "@blade/control",
  "dependencies": {
    "@blade/core": "workspace:*",
    "@blade/db": "workspace:*",
    "@blade/shared": "workspace:*"
  }
}
```

### Turbo Pipeline

```json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"]
    }
  }
}
```

Build order: `shared` -> `db` -> `docker-runner` -> `core` -> `control` -> `conversation` -> `web/cli`

---

## 13. Roadmap

### Days 1-30: Foundation

**Week 1-2: Conversation Service**
- [ ] Create `packages/conversation/` with engine, types, context-builder
- [ ] Build web adapter (extract from `route.ts`)
- [ ] Build Telegram adapter (extract from `telegram.ts`)
- [ ] Build CLI adapter (extract from CLI chat command)
- [ ] Add `conversation_channels` migration
- [ ] Verify: same conversation can be accessed from web and Telegram

**Week 2-3: Activity Timeline**
- [ ] Create `activity_events` table (migration 0007)
- [ ] Build `timeline/event-store.ts` — emit events from conversation engine
- [ ] Build `timeline/query.ts` — paginated, filtered queries
- [ ] Build `/api/timeline/route.ts`
- [ ] Build Runs view in dashboard (real-time with SSE)
- [ ] Wire agent loop callbacks to emit timeline events

**Week 3-4: Employee V2 + Dashboard**
- [ ] Run employee schema migration (add columns to employees table)
- [ ] Create `kpi_definitions`, `routines` tables
- [ ] Convert existing 11 employees to YAML format
- [ ] Build Agents view in dashboard (roster table)
- [ ] Build agent detail page (KPIs, routines, runs)
- [ ] Build Today view (alerts, schedule, KPI snapshot)
- [ ] Lock down auth on all new routes

**Week 4: Persist Orchestration State**
- [ ] Move workflow/handoff/trigger state fully to DB
- [ ] Remove in-memory workflow registry
- [ ] Add approval queue table
- [ ] Test: restart process, verify workflows resume

### Days 31-60: Intelligence

**Week 5-6: Employee Templates + KPIs**
- [ ] Ship 12 employee YAML definitions with full KPIs and routines
- [ ] Build routine scheduler (cron-based, replaces proactive.ts)
- [ ] Build KPI measurement pipeline (manual + integration sources)
- [ ] Build KPI trend charts in Business view
- [ ] Add employee scorecard to agent detail page

**Week 7-8: Policy Engine + Approvals**
- [ ] Build policy engine (tool allowlists, budget caps per employee)
- [ ] Build approval inbox (pending actions with approve/reject)
- [ ] Wire approval gates into workflow execution
- [ ] Build approval UI in dashboard
- [ ] Add escalation routing (employee -> manager -> user)

**Week 8: Monitoring + Briefings**
- [ ] Build monitor registry (register data sources, thresholds)
- [ ] Build checker (scheduled checks with anomaly detection)
- [ ] Build alerter (route alerts to Today view + channels)
- [ ] Build executive briefing generator
- [ ] Ship 5 built-in monitor templates (revenue, pipeline, support, deploy, costs)

**Week 8: Subagent Orchestration**
- [ ] Build subagent manager (scoped spawning with policy enforcement)
- [ ] Add manager-worker relationships to employee model
- [ ] Wire handoffs to use conversation engine (not raw agent loop)
- [ ] Build handoff visualization in Runs view

### Days 61-90: Polish

**Week 9-10: Command Center Completion**
- [ ] Build Memory view (search, filter, graph visualization)
- [ ] Build Control view (integrations, policies, budgets, schedules)
- [ ] Add real-time WebSocket updates to all dashboard views
- [ ] Add agent scorecards (30-day success rate, cost efficiency, task completion)
- [ ] Add performance comparison across employees

**Week 10-11: Cross-Channel + Integrations**
- [ ] Complete conversation sync across web/Telegram/CLI
- [ ] Add Slack adapter
- [ ] Add email adapter (inbound/outbound)
- [ ] Add CRM integration depth (GHL full lifecycle, not just contacts)
- [ ] Add document ingestion improvements (RAG with embeddings)

**Week 11-12: Eval + Safety**
- [ ] Build eval framework (task completion rate, accuracy, safety)
- [ ] Add safety rails (PII detection, cost circuit breakers, rate limits)
- [ ] Add memory graph (relationship mapping between entities)
- [ ] Add company operating manual (SOP storage + retrieval)
- [ ] Performance testing and optimization
- [ ] Documentation

---

## 14. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| SQLite contention under multi-agent load | Medium | High | WAL mode helps; add connection pooling. If needed, migrate to PostgreSQL (schema is compatible). |
| Employee YAML definitions become unwieldy | Medium | Medium | Keep YAML for defaults, DB for runtime state. YAML is seed data, not live config. |
| Activity timeline table grows unbounded | High | Medium | Add TTL (90 days default), partition by month, add archival job. |
| Control plane adds too much latency to conversations | Low | High | Keep execution path thin: policy checks cached in memory, timeline writes async. |
| Breaking change to existing CLI/web users | Medium | Medium | Version the API. Keep `blade chat` and existing routes working. New features are additive. |
| Scope creep on 30-day plan | High | Medium | Week 1-2 is the critical path (conversation service). If that ships, everything else layers on top. |
| Monitor integrations require API keys users don't have | Medium | Low | All monitors optional. Ship with internal-only monitors first (cost burn, PR velocity, memory health). |

---

## Appendix A: File Count Estimates

| Package | Current Files | Target Files | Net Change |
|---------|--------------|-------------|------------|
| `packages/core/` | 79 | ~45 | -34 (moved to control/conversation) |
| `packages/control/` | 0 | ~25 | +25 |
| `packages/conversation/` | 0 | ~10 | +10 |
| `packages/db/` | ~8 | ~10 | +2 (new migrations + repos) |
| `apps/web/` | ~25 | ~45 | +20 (new dashboard views + API routes) |
| **Total** | ~112 | ~135 | +23 net new files |

## Appendix B: Key Decisions

1. **SQLite over PostgreSQL**: Keep SQLite for v2. Single-node deployment is fine for the target user (solo founder / small team). Migrate if/when multi-node becomes necessary.

2. **Monorepo stays**: The workspace structure works. Adding 2 new packages (`control`, `conversation`) is cheaper than restructuring.

3. **YAML employee definitions**: Seed data in YAML, runtime state in DB. This makes employees git-trackable and easy to ship as templates while still being mutable at runtime.

4. **Activity timeline over event sourcing**: Append-only log for observability, not as the source of truth. State stays in domain tables. Timeline is for the dashboard and audit.

5. **Async over real-time for monitors**: Monitors run on cron schedules, not continuous streams. Simpler, cheaper, good enough for the target use case.

6. **No microservices**: Everything runs in one process. The package boundaries are logical, not deployment boundaries. Split later if needed.

---

*This spec is a living document. Update it as decisions are made and priorities shift.*
