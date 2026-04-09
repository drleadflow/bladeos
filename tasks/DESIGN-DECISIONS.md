# Blade v2 Design Decisions (Consensus)

**Date:** 2026-04-09
**Status:** Locked — these decisions are final unless new evidence emerges

## Decisions

### D1: No `packages/types` — types stay in core
Types remain in `packages/core/src/types.ts`. New types (ConversationRequest, ConversationEvent, ChannelType, Employee v2) are added there. Both control and conversation import types from `@blade/core` — these are type-only imports erased at compile time. No circular dependency risk.

### D2: Cost recording lives in callers, not agent loop
Remove `costEntries.record()` from `agent-loop.ts`. The agent loop keeps its in-memory `totalCost` accumulator for budget gating but never writes to DB. ConversationEngine, coding pipeline, and workflow runner are the cost-recording authorities.

### D3: `createEventChannel<T>()` ships as a core utility
Bounded async queue bridging callback-based producers to AsyncGenerator consumers. Lives in `packages/core/src/utils/event-channel.ts`. Buffer size: 256 events (configurable). Unbounded for v2 (backpressure deferred to v3).

### D4: `runLoop` is Promise-based; `streamLoop` is the generator
`ExecutionAPI.runLoop()` returns `Promise<AgentLoopResult>` (matches existing `runAgentLoop`). `ExecutionAPI.streamLoop()` wraps it as `AsyncGenerator<AgentStreamEvent>` using the event channel. Architecture doc section 4 corrected.

### D5: ConversationEngine uses closure, not `this`
Factory function captures the returned object in a `const engine` variable and references methods via `engine.method()`, avoiding `this` binding issues in destructured/callback contexts.

### D6: `createFilteredScope` added to ExecutionAPI
New method: `createFilteredScope(allowedToolNames: string[]): string` — creates a tool scope pre-populated with global tools matching the allowlist. Existing `createToolScope()` stays for raw scope creation.

### D7: Scoped tool execution is strict
When `toolScopeId` is set in `ExecutionContext`, `executeTool` ONLY checks the scope. No fallthrough to global registry. This makes per-employee tool restrictions a hard sandbox.

### D8: Orchestration is rewritten, not relocated
`runWorkflow` accepts `ExecutionAPI` via constructor injection. All `runAgentLoop` calls go through `executionApi.runLoop()`. Employee lookups remain internal to control (no circular dep). This is a code change, not a file move.

### D9: Summarization fallback preserved
ConversationEngine checks if `finalResponse` is empty after streamLoop completes. If empty and tool calls > 0, it calls `executionApi.callModel()` with a summarization prompt to generate a human-readable response. Logic ported from `chat/reply.ts`.

### D10: `channel_links` table ships with conversation engine
Migration `0008_channel_links.sql` is part of Phase 3, not deferred. `findByChannel` uses indexed DB lookup from day one.

### D11: Backward-compat barrel during Phase 4
When moving modules from core to control, `packages/core/src/index.ts` re-exports from `@blade/control` during transition. Consumers can migrate at their own pace. Deprecation comments mark re-exports.

### D12: Migration phasing
1. Phase 1: Add `execution-api.ts` + `event-channel.ts` to core (additive, no breakage)
2. Phase 2: Fix agent-loop cost recording (remove DB writes)
3. Phase 3: Create `packages/conversation/` with engine + adapters + channel_links migration
4. Phase 4: Create `packages/control/` with backward-compat barrel from core
5. Phase 5: Move modules one-by-one from core to control (employees first, orchestration last)
6. Phase 6: Remove backward-compat barrel once all consumers migrated
