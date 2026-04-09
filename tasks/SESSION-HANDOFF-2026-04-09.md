# Blade Super Agent Checkpoint — 2026-04-09

## Snapshot

This checkpoint captures the current state after the command-center rebuild, conversation unification work, Telegram cleanup, worker control plane foundation, and the first real worker actions.

Current branch: `main`

Latest local commit before this checkpoint:
- `0a1615c` — `fix: smart routing — Claude for chat, OpenRouter for background only`

There is currently **no git remote configured** for this repository, so local commits can be created immediately, but GitHub push requires a remote to be added first.

## What Was Completed

### 1. Command Center / Dashboard UI
- Rebuilt the main dashboard surfaces into a cockpit-style interface instead of a plain admin shell.
- Brought `Today`, `Runs`, `Agents`, `Jobs`, `Costs`, `Settings`, chat, and worker views into a more unified design language.
- Added shared dashboard primitives in `apps/web/src/components/dashboard/`.

### 2. Shared Conversation Layer
- Moved the system toward a shared conversation engine in `packages/conversation/`.
- Web chat and Telegram now rely on the same core conversation execution boundary.
- Fixed a memory regression where `systemPromptOverride` could suppress memory retrieval.

### 3. Telegram Bot Hardening
- Telegram now uses the conversation package runtime.
- Empty/fallback response handling is cleaner.
- Internal Claude status noise is scrubbed before replies.
- Conversation continuity is now tied to channel links instead of only title conventions.

### 4. Activity Trace / Observability
- Added a structured chat trace rail with SSE event handling.
- Surfaced run activity, tool calls, stop reasons, and cost in the UI.
- Timeline hydration now works for resumed conversations.

### 5. Durable Control Plane
- Added control-plane migrations and DB-backed records for:
  - activity events
  - approvals
  - monitors / KPI support
  - worker sessions
  - channel links
- Worker sessions now persist runtime, summary, freshness, and conversation identity.

### 6. Worker Supervision
- Added `/workers` page and worker APIs.
- Worker detail now shows logs, activity, runtime details, and linked job state.
- Worker session lifecycle is synced from job creation through coding pipeline execution.

### 7. Worker Actions
- Added first real worker controls:
  - `stop`
  - `retry`
- `stop` is cooperative and honored at safe checkpoints inside the coding pipeline.
- `retry` relaunches a fresh job-backed run using the shared job launcher.

### 8. Tests / Verification
- Added regression tests for:
  - conversation engine channel-link behavior
  - worker session control metadata
  - channel links
- Verified:
  - `npm run lint`
  - `npm run test`
  - `npm run build`

## Important Files To Start With Next Time

### Product / UI
- `apps/web/src/app/workers/page.tsx`
- `apps/web/src/app/jobs/page.tsx`
- `apps/web/src/components/dashboard/cockpit-ui.tsx`
- `apps/web/src/components/chat/activity-trace.tsx`

### APIs
- `apps/web/src/app/api/workers/[id]/route.ts`
- `apps/web/src/app/api/workers/route.ts`
- `apps/web/src/app/api/jobs/[id]/start/route.ts`
- `apps/web/src/app/api/chat/route.ts`

### Shared Engine / Runtime
- `packages/conversation/src/engine.ts`
- `packages/conversation/src/telegram-bot.ts`
- `packages/core/src/pipeline/coding-pipeline.ts`
- `apps/web/src/lib/job-runner.ts`

### DB / Control Plane
- `packages/db/src/repositories.ts`
- `packages/db/src/sqlite.ts`
- `packages/db/src/migrations/0007_control_plane.sql`
- `packages/db/src/migrations/0008_worker_sessions.sql`
- `packages/db/src/migrations/0009_channel_links.sql`

## What We Learned

### Technical lessons
1. Shared execution boundaries beat channel-specific logic.
   Telegram became more reliable as soon as it stopped carrying its own bespoke reply stack.

2. Durable control-plane state matters more than adding another feature.
   Worker sessions, channel links, and activity events made the system much easier to reason about than more prompt tweaks would have.

3. If observability is weak, the product feels worse than the underlying capability.
   The trace rail and worker details improved perceived quality immediately.

4. Build/test wiring across packages matters.
   `@blade/conversation` depended on fresh `@blade/db` build artifacts for migration-aware tests, so the package test script needed to build DB first.

5. Next/Turbo can produce flaky false negatives around `.next/export`.
   When builds fail with `ENOTEMPTY` on `apps/web/.next/export`, remove that folder and rerun. The code itself may still be fine.

### Product lessons
1. Blade is strongest when it behaves like a command center, not a generic chat app.
2. The worker layer is becoming the right abstraction for mobile supervision.
3. “See what it’s doing” is not optional. It is a core product feature.
4. The best next improvements are around trust, controls, and legibility, not breadth.

## Skills / Capabilities Developed

These are the meaningful capabilities that got stronger during this round:

- Shared conversation orchestration across channels
- Telegram channel adaptation on top of a common engine
- Durable channel-to-conversation linking
- Worker session lifecycle tracking
- Worker stop/retry control semantics
- Live-ish run visibility through trace and timeline views
- Cockpit-style dashboard composition
- Stronger package-level regression testing around control-plane behavior

## Known Limitations

1. Worker `stop` is cooperative, not an instant process kill.
2. There is still no true `attach` / `send input` / interactive terminal streaming path.
3. The non-Docker execution fallback remains more permissive than ideal.
4. There is still no Git remote configured for this repo.
5. Some build runs can still hit the `apps/web/.next/export` cleanup flake.

## Exactly Where To Pick Up Next

### Highest-leverage next build
Implement **real interactive worker control**:
- worker log streaming
- attach / send input
- interrupt / stop with stronger runtime semantics
- better worker detail UX for mobile supervision

### Suggested order
1. Add worker event/log streaming endpoint or websocket path.
2. Add worker control actions:
   - `attach`
   - `send_input`
   - `interrupt`
3. Extend worker detail UI into a true mobile operator console.
4. Harden execution runtime boundaries after controls land.

## GitHub Push Blocker

To push this checkpoint to GitHub, one of these needs to happen next time:
- add a remote URL with `git remote add origin <repo-url>`
- or authenticate/create/select the GitHub repo to push to

Once a remote exists, the next commands are straightforward:
- `git push -u origin main`
