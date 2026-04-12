# Blade Super Agent - System Overview

> A comprehensive guide to what Blade does, how it works, and how all the pieces fit together.

---

## What Is Blade?

Blade is an **AI workforce platform** that replaces human employees with specialized AI agents. Each agent has a defined role, personality, KPIs, scheduled routines, and tool access - operating autonomously around the clock.

It's not a chatbot. It's not a coding assistant. It's a **full operating system for running a business with AI employees**.

---

## The 9 AI Employees

| Employee | Role | Department | Key Responsibility |
|----------|------|------------|-------------------|
| Chief of Staff | Executive Coordinator | Executive | Morning/evening briefings, cross-team coordination, bottleneck detection |
| CSM Agent | Customer Success Manager | Client Success | Daily client health monitoring, decline detection, proactive Slack alerts |
| Engineering Manager | Engineering Lead | Engineering | PR review sweeps, deploy health checks, codebase metrics |
| Finance Analyst | Financial Controller | Finance | Daily cost reports, burn rate tracking, runway projections |
| Growth Lead | Marketing Strategist | Marketing | Weekly funnel reviews, MQL tracking, conversion optimization |
| Ops Manager | Operations Lead | Operations | System health checks (every 6h), incident detection, SOP creation |
| Product Manager | Product Lead | Engineering | Sprint reviews, feature delivery tracking, velocity monitoring |
| SDR | Sales Development Rep | Sales | Lead qualification, outreach volume, pipeline filling |
| Support Lead | Support Manager | Support | Ticket backlog management, escalation detection, SLA monitoring |

### How Employees Work

Each employee is defined in a YAML file (`packages/core/src/employees/definitions/`) containing:

- **Personality** - Archetype (Operator or Coach), tone (direct/warm/analytical), model preference
- **Frameworks** - Named decision-making playbooks (e.g., "Bottleneck First", "Speed-to-Lead", "BAMFAM")
- **KPIs** - Measurable targets with green/yellow/red thresholds
- **Routines** - Cron-scheduled tasks that run through the agent loop automatically
- **Allowed Tools** - Scoped tool access (hard sandbox - no fallthrough to global tools)
- **Escalation Policy** - When to pause, notify, or hand off to another employee
- **Handoff Rules** - Conditions for passing work to other employees

### Employee Routines (Automated)

Routines run on cron schedules via the Routine Scheduler:

| Employee | Routine | Schedule | What It Does |
|----------|---------|----------|-------------|
| Chief of Staff | Morning Briefing | 6 AM weekdays | Compile priorities, flag red KPIs, surface escalations |
| Chief of Staff | End of Day Summary | 6 PM weekdays | Review accomplishments, list blockers, tomorrow outlook |
| CSM Agent | Morning Health Check | 7 AM weekdays | Score all clients 0-100, alert on critical accounts |
| CSM Agent | Decline Watch | 12 PM weekdays | Compare today vs 7-day average, alert on >20% drops |
| CSM Agent | Weekly Client Report | Friday 2 PM | Per-client summaries posted to Slack |
| Engineering Manager | PR Review Sweep | 2 PM weekdays | Flag stale PRs, check CI failures |
| Engineering Manager | Deploy Health Check | 10 AM weekdays | Verify deploy success, check error spikes |
| Finance Analyst | Daily Cost Report | 5 PM weekdays | API + infra costs vs budget |
| Finance Analyst | Weekly Financial Summary | Friday 4 PM | Burn rate, runway projection, budget comparison |
| Growth Lead | Weekly Funnel Review | Monday 10 AM | Traffic, leads, conversion, bottleneck identification |
| Ops Manager | System Health Check | Every 6 hours | Services, disk, memory, error logs |
| Ops Manager | Daily Cost Review | 5 PM weekdays | API usage costs, infrastructure spend |
| Product Manager | Sprint Review | Monday 9 AM | Completion, velocity, blockers |
| SDR | Morning Pipeline Review | 9 AM weekdays | New leads, replies, prioritize outreach |
| SDR | Lead Qualification Sweep | 2 PM weekdays | Score by ICP fit, move qualified to SQL |
| Support Lead | Morning Backlog Review | 8 AM weekdays | Count open tickets, flag >24h unresolved |
| Support Lead | Escalation Check | 3 PM weekdays | SLA violations, recurring issues |

---

## Architecture

```
                        USER INTERFACES
           CLI  |  Web Dashboard  |  Telegram  |  Slack
                        |
              CONVERSATION ENGINE
         (unified reply logic, channel adapters)
                        |
                  EXECUTION API
           (clean boundary between layers)
                        |
    +-------------------+-------------------+
    |                   |                   |
AGENT LOOP        TOOL REGISTRY       MODEL PROVIDER
 - 25 max iter     - 50+ tools         - Anthropic
 - cost gating     - scoped per         - OpenAI
 - stuck-loop        employee           - OpenRouter
   detection       - parallel exec      - smart routing
    |                   |                   |
    +-------------------+-------------------+
                        |
    +-------------------+-------------------+
    |                   |                   |
 EMPLOYEES        ROUTINE SCHEDULER    MONITORS
  - 9 agents       - cron-based         - KPI tracking
  - YAML defs      - tool-scoped        - health checks
  - personality    - activity logging    - cost burn
  - handoffs                            - client health
    |                   |                   |
    +-------------------+-------------------+
                        |
                    DATABASE
           SQLite (local) or PostgreSQL
              50+ tables, 16 migrations
```

### Package Structure

```
apps/
  cli/              blade command - chat, code, setup, team, briefing, costs
  web/              Next.js 14 dashboard - 50+ pages, 30+ API routes, SSE streaming
  landing/          Static marketing page

packages/
  core/             Agent loop, tool registry, model provider, employees, routines,
                    monitors, coding pipeline, skills, evolution, voice, RAG
  conversation/     Conversation engine, channel adapters (CLI, Web, Telegram, Slack, API)
  db/               SQLite/PostgreSQL, 16 migrations, 13 repository modules
  shared/           Logger, config loader, environment utilities
  docker-runner/    Docker container management for isolated code execution
```

---

## The Agent Loop

The core execution engine at `packages/core/src/agent-loop.ts`:

1. **Receive task** - System prompt + user message + available tools
2. **Call model** - Send to Claude/GPT with tool definitions
3. **Execute tools** - Run any tool calls the model makes (parallel by default)
4. **Feed results back** - Return tool results to model for next iteration
5. **Repeat** until the model says it's done, budget exceeded, or max iterations hit

**Safety mechanisms:**
- **Cost gating** - Stops if per-task budget exceeded
- **Stuck-loop detection** - Breaks if same tool+input called 3+ times
- **Wall-clock timeout** - 10 minute default
- **Tool timeout** - 2 minutes per individual tool call
- **Max iterations** - 25 default
- **Error retry** - 2 retries with backoff for transient failures

---

## Tool System

50+ tools organized by category, registered in the global Tool Registry:

| Category | Tools | Examples |
|----------|-------|---------|
| Filesystem | 6 | read_file, write_file, list_files, create_directory |
| Shell | 1 | run_shell (with safety limits) |
| Memory | 3 | recall_memory, save_memory, search_memories |
| Web | 2 | web_search, scrape_page |
| CRM (GHL) | 4 | ghl_search_contacts, ghl_create_contact, ghl_update_contact |
| Meta Ads | 3 | meta_ads_get_performance, meta_ads_update_budget |
| Client Health | 4 | check_client_health, get_client_health_history, list_clients |
| Messaging | 2 | slack_send_message, send_notification |
| Browser | 5 | open_browser, click, type, screenshot |
| Voice | 2 | transcribe_audio, generate_speech |
| RAG | 2 | retrieve_documents, index_documents |
| Collaboration | 4 | create_document, update_document, share_document |
| Git/Docker | 6 | clone_repo, create_branch, create_pr, exec_in_container |

**Tool scoping**: Each employee only has access to tools listed in their `allowed_tools`. The SDR can search GHL contacts but can't run shell commands. The Ops Manager can run shell commands but can't create GHL contacts. This is a hard sandbox - no fallthrough.

---

## Web Dashboard

### 8 Navigation Sections

**1. Command Center** - The cockpit
- **Cockpit** (`/`) - Active employees, pending approvals, activity feed, quick actions
- **Today** (`/today`) - Daily snapshot: alerts, approvals, agents, events, system health
- **Scorecard** (`/scorecard`) - KPI metrics with red/yellow/green status
- **Clarity Compass** (`/compass`) - Strategic focus tool
- **Focus Timer** (`/focus`) - Pomodoro-style focus sessions
- **Delegation** (`/delegation`) - Task delegation tools
- **Chat** (`/chat`) - Direct conversation with Blade (SSE streaming)

**2. Studio** - Content management
- **Content Studio** (`/studio`) - Video/content projects, R2 uploads, transcription

**3. Revenue** - Sales and marketing operations
- **Dashboard** (`/revenue`) - MRR, ARR, active clients, pipeline value
- **Pipeline** (`/revenue/pipeline`) - Kanban deal tracking
- **Leads** (`/revenue/leads`) - Lead table with search/filter
- **Clients** (`/revenue/clients`) - Client health scores
- **Closer** (`/revenue/closer`) - AI closer performance (calls, deals, close rate)
- **Outreach** (`/revenue/outreach`) - Cold email campaign metrics
- **Campaigns** (`/revenue/campaigns`) - Ad spend and ROI

**4. Workforce** - Employee management
- **All Employees** (`/workforce`) - Grid of all AI agents with status
- **Performance** (`/workforce/performance`) - Analytics per employee
- **Routines** (`/workforce/routines`) - Scheduled routine status
- **Approvals** (`/workforce/approvals`) - Approval queue
- **Playbooks** (`/workforce/playbooks`) - Operating frameworks per employee

**5. Operations** - System operations
- **Dashboard** (`/operations`) - Workflow runs, monitors, automations
- **Workflows** (`/operations/workflows`) - Execution history
- **Monitors** (`/operations/monitors`) - Health monitors and alerts
- **Automations** (`/operations/automations`) - Rule-based automation
- **Cron Jobs** (`/operations/cron`) - Scheduled jobs

**6. Engineering** - Development tools
- **Dashboard** (`/engineering`) - Runs, workers, jobs, costs overview
- **Runs** (`/engineering/runs`) - Build/execution timeline
- **Workers** (`/engineering/workers`) - Worker sessions
- **Jobs** (`/engineering/jobs`) - Coding job tracking
- **Costs** (`/engineering/costs`) - Token/model spend

**7. Memory** - Knowledge base
- **Business Memory** (`/memory`) - Facts, preferences, SOPs
- **Customer Memory** (`/memory/customers`) - Per-customer knowledge
- **Decision Log** (`/memory/decisions`) - Decisions and rationale
- **SOPs & Wiki** (`/memory/sops`) - Standard operating procedures

**8. Control** - Settings
- **Settings** (`/control/settings`) - Model routing, API keys, personality
- **Integrations** (`/control/integrations`) - Connected platforms
- **Permissions** (`/control/permissions`) - Access control
- **Billing** (`/control/billing`) - Subscription and usage

### Key API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/health` | GET | Health check + DB init (dynamic, triggers ensureServerInit) |
| `/api/today` | GET | Full daily snapshot (alerts, approvals, agents, costs, health) |
| `/api/auth/register` | POST | User registration (first user auto-promoted to admin) |
| `/api/auth/login` | POST | Email/password login with Lucia sessions |
| `/api/chat` | POST | Send message, receive SSE stream |
| `/api/employees` | GET | List all employees |
| `/api/agents/[slug]` | GET | Agent detail (KPIs, routines, playbooks, activity) |
| `/api/timeline` | GET | Activity event feed (filterable) |
| `/api/timeline/stream` | GET | Real-time SSE activity stream |
| `/api/approvals` | GET/POST | View/action approval queue |
| `/api/jobs` | GET/POST | Coding job management |
| `/api/workers/[id]/stream` | GET | Real-time worker status SSE |
| `/api/costs` | GET | Cost breakdown by model and day |
| `/api/revenue` | GET | MRR, ARR, pipeline, client summary |
| `/api/memory` | GET/POST | Business memory CRUD |
| `/api/leads/sync` | POST | Sync leads from external CRM |

---

## CLI Commands

```bash
blade setup              # Interactive config wizard (API keys, model, budget)
blade chat               # Chat with Blade (interactive REPL)
blade code "task" --repo=url  # Autonomous coding (clone -> code -> test -> PR)
blade team               # List active AI employees with status
blade briefing           # Generate morning briefing
blade scorecard          # Display KPI stoplight table
blade jobs               # List coding jobs
blade costs              # Show spending by model
blade memory [query]     # Search agent memories
blade doctor             # System health check
blade start              # Launch web dashboard (localhost:3000)
blade telegram           # Start Telegram bot
blade slack              # Start Slack bot
blade evolve             # Run self-evolution cycle
blade report             # Generate value report
```

---

## Conversation System

All channels (CLI, Web, Telegram, Slack, API) share a single `ConversationEngine`:

```
User message
    |
    v
Channel Adapter (parse incoming, format outgoing)
    |
    v
ConversationEngine
  1. Resolve/create conversation
  2. Load message history (20 for Telegram, 50 for Web)
  3. Build system prompt (personality + employee + memory + channel)
  4. Retrieve relevant memories
  5. Resolve model + tool set (scoped per employee)
  6. Stream through agent loop
  7. Persist messages (deferred until model succeeds)
  8. Record cost
    |
    v
Channel Adapter (deliver response)
```

**Channel-specific behavior:**
- **Web** - SSE streaming, full event metadata
- **CLI** - stdout streaming, minimal formatting
- **Telegram** - Plain text only (no markdown), 4096 char chunks, per-chat concurrency lock
- **Slack** - Socket Mode, auto-memory injection, Slack formatting
- **API** - JSON response, buffered (no streaming)

---

## Database

SQLite by default (with PostgreSQL option for cloud). 50+ tables across 16 migrations:

### Core Data
- `conversations`, `messages`, `tool_calls` - Chat history and tool execution
- `jobs`, `job_logs`, `job_evals` - Coding job lifecycle
- `memories` (with FTS5 search) - Agent knowledge store

### Employee System
- `employees`, `active_employees` - Workforce roster
- `routines`, `daily_priorities` - Scheduled work
- `kpi_definitions`, `kpi_measurements`, `scorecard_entries` - KPI tracking
- `handoffs` - Cross-employee collaboration
- `approvals` - Decision queue
- `evolution_events`, `improvement_queue` - Self-improvement

### Business Operations
- `client_accounts`, `client_health_snapshots`, `csm_evals` - Client success
- `lead_events`, `lead_engagement` - Sales pipeline
- `cost_entries` - Per-call cost tracking
- `monitors`, `monitor_alerts` - System health
- `activity_events` - Full audit trail

### Platform
- `auth_user`, `auth_session`, `auth_password` - Lucia authentication
- `workspaces`, `user_workspace` - Multi-tenancy
- `channel_links` - Cross-channel conversation linking
- `content_projects`, `content_items`, `content_captions` - Content studio
- `notifications` - User notifications

---

## Coding Pipeline

When `blade code "task" --repo=url` runs:

1. **Clone** - Git clone the repository (shallow)
2. **Branch** - Create feature branch (`blade/task-description`)
3. **Container** - Spin up Docker sandbox (2GB RAM, 2 CPU, no capabilities, readonly root)
4. **Code** - Agent loop writes code using filesystem + shell tools
5. **Test** - Run test suite inside container
6. **PR** - Create pull request via GitHub API
7. **Track** - Record job, cost, and evaluation

The Docker sandbox enforces:
- 2GB memory limit, 2 CPU cores
- CapDrop ALL (no Linux capabilities)
- PID limit of 256 (fork bomb prevention)
- 120 second timeout per command
- Optional readonly root filesystem

---

## Monitoring & KPIs

### Built-in Monitors (run every 6 hours)
- **Cost Burn** - Daily/weekly spend vs budget thresholds
- **Employee Health** - Per-employee KPI status rollup
- **Client Health** - Account performance snapshots
- **Memory Health** - Memory usage patterns

### KPI Measurement
Built-in measurement functions:
- `cost.daily_spend` - API spend in past 24h
- `cost.weekly_spend` - Past 7 days
- `activity.events_today` - Activity count
- `jobs.success_rate_30d` - Job success rate
- `jobs.avg_cost` - Average cost per job

Each KPI has thresholds that produce **green** (on target), **yellow** (warning), or **red** (action needed) status.

---

## Model Routing

| Level | Model | Use Case | Cost |
|-------|-------|----------|------|
| Light | Haiku | Quick lookups, simple tasks | Cheapest |
| Standard | Sonnet | Most work - coding, reviews, routines | Balanced |
| Heavy | Opus | Architecture, complex reasoning | Most capable |

The system supports **Anthropic Claude**, **OpenAI GPT**, and **OpenRouter** (multi-provider). Smart routing selects the cheapest model that meets quality requirements for each task.

Every API call is tracked in `cost_entries` with model, input/output tokens, and USD cost.

---

## Security Model

- **Tool scoping** - Employees only access their allowed tools (hard sandbox)
- **Cost budgets** - Per-task and per-employee spending limits
- **Docker isolation** - Coding runs in sandboxed containers with dropped capabilities
- **Auth** - Lucia session-based authentication with Argon2 password hashing
- **Rate limiting** - 60 req/min authenticated, 30 req/min unauthenticated
- **Approval workflows** - Sensitive actions require human approval
- **Activity audit trail** - Every action logged to `activity_events`

---

## Deployment

### Current: Railway

- **URL**: https://blade-web-production.up.railway.app
- **Build**: Nixpacks (`npm install && npx turbo build`)
- **Start**: `cd apps/web && npm run start -- -p ${PORT}`
- **Volume**: Persistent volume at `/data` for SQLite persistence
- **Env var**: `BLADE_DATA_DIR=/data` routes DB + data to the volume
- **Health check**: `/api/health` (force-dynamic, triggers DB init + employee seeding)

### Future: Cloud-Native Stack
- **Compute**: Fly.io (web + workers)
- **Database**: Turso (SQLite-compatible cloud)
- **Queue**: BullMQ + Upstash Redis
- **Storage**: Cloudflare R2
- **Integrations**: Composio (multi-tenant OAuth, 250+ platforms)

---

## How It All Fits Together

**Morning example** - what happens at 6 AM on a Monday:

1. Routine Scheduler fires Chief of Staff's "Morning Briefing" cron job
2. Creates a tool scope with only: `recall_memory`, `save_memory`, `web_search`, `send_notification`
3. Loads the Operator personality with direct tone
4. Enters the agent loop with the briefing task prompt
5. Agent calls `recall_memory` to pull all employee KPI statuses
6. Agent calls `recall_memory` to get yesterday's activity summary
7. Agent synthesizes findings into a briefing
8. Agent calls `save_memory` to store the briefing
9. Agent calls `send_notification` to push it to the dashboard
10. Loop completes - cost recorded, routine status updated, activity event logged

Meanwhile, at 7 AM:
- CSM Agent's "Morning Health Check" fires
- Calls `list_clients`, `meta_ads_get_performance`, `check_client_health`
- Scores each client 0-100
- Posts alerts to Slack for any client scoring below 50
- Saves summary to memory

At 9 AM:
- SDR's "Morning Pipeline Review" fires
- Product Manager's "Sprint Review" fires
- Both run independently with their own tool scopes

All of this happens autonomously. The user sees results on the dashboard, gets Slack/Telegram notifications for critical items, and can intervene via the approval queue when employees need human decisions.

---

## Key Design Principles

1. **Employee-first, not prompt-first** - Agents aren't loose prompts. They have structure: KPIs, escalation policies, handoff rules, tool boundaries, personality archetypes.

2. **Everything is measurable** - Every API call has a cost entry. Every employee has KPIs. Every routine has success/failure status. The system is transparent by design.

3. **Bottleneck-first** - All 9 employees share this framework: find the ONE constraint before optimizing anything else.

4. **Hard tool sandboxing** - No soft guidelines. If a tool isn't in `allowed_tools`, the employee physically cannot call it.

5. **Unified conversation engine** - One engine, many channels. Prevents logic drift between CLI, web, Telegram, and Slack.

6. **Deferred persistence** - Messages saved after model success, not before. Prevents context-overflow death spirals on retry.

7. **Cost governance** - Per-task budgets, per-employee budgets, model routing by complexity. The Finance Analyst monitors the overall burn rate autonomously.
