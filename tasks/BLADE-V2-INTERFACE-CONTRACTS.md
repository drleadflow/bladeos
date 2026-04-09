# Blade v2 Interface Contracts — Package Boundary Design

**Date:** 2026-04-08
**Status:** Draft
**Scope:** ExecutionAPI, ConversationEngine, ChannelAdapter, Shared Types

---

## Table of Contents

1. [Dependency Graph](#1-dependency-graph)
2. [Shared Types Location](#2-shared-types-location)
3. [ExecutionAPI](#3-executionapi)
4. [ConversationEngine](#4-conversationengine)
5. [ChannelAdapter](#5-channeladapter)
6. [Migration Notes](#6-migration-notes)

---

## 1. Dependency Graph

```
                     Direction of imports (arrows = "imports from")

  apps/web ──────┐
  apps/cli ──────┤
  apps/api ──────┤
                 ▼
       packages/conversation
           │          │
           │          ▼
           │    packages/control
           │          │
           ▼          ▼
        packages/core  (execution plane)
           │
           ▼
        packages/db
           │
           ▼
        packages/shared
           │
           ▼
        packages/types   <── imported by ALL packages above
```

### Rules

1. **packages/types** has ZERO internal dependencies. Every other package imports from it.
2. **packages/core** imports from `types`, `shared`, `db`. Never from `control` or `conversation`.
3. **packages/control** imports from `types`, `shared`, `db`, `core` (via ExecutionAPI only).
4. **packages/conversation** imports from `types`, `shared`, `db`, `core` (via ExecutionAPI), and `control` (for policy resolution and employee context).
5. **apps/** import from `conversation`, `control`, `core`, `db`, `shared`, `types`.
6. **No circular dependency** is possible because the graph is a strict DAG.

---

## 2. Shared Types Location

### Decision: New `packages/types/` package

**Why not `packages/shared/src/types.ts`?**
- `shared` already carries runtime code (logger, config, env). Mixing pure type definitions with runtime utilities creates a conceptual muddle.
- `packages/types/` is a pure declaration package (`"types"` field in package.json, no runtime code) that can be imported anywhere without pulling in dependencies.

**Package structure:**

```
packages/types/
  package.json            # { "name": "@blade/types", "types": "./dist/index.d.ts" }
  tsconfig.json
  src/
    index.ts              # Re-exports everything
    identity.ts           # AgentId, JobId, SkillId, MemoryId, ConversationId
    tool.ts               # ToolDefinition, ToolInputSchema, ToolCallResult, ToolHandler, ToolRegistration
    execution.ts          # ExecutionContext, StopReason
    agent-loop.ts         # AgentMessage, AgentTurn, AgentLoopOptions, AgentLoopResult, ContentBlock*
    model.ts              # ModelProvider, ModelConfig, ModelResponse, TaskComplexity
    job.ts                # JobStatus, Job, JobLogEntry
    memory.ts             # MemoryType, Memory
    skill.ts              # SkillSource, SkillExample, Skill
    cost.ts               # CostEntry, CostSummary
    conversation.ts       # Conversation, StoredMessage + NEW ConversationRequest, ConversationEvent, ChannelType
    employee.ts           # NEW — Employee, KPIDefinition, Routine, etc.
    pipeline.ts           # NEW — CodingPipelineOptions, CodingPipelineResult
```

### What moves from `packages/core/src/types.ts`

**Everything.** The entire contents of `packages/core/src/types.ts` move to `packages/types/src/`. The file `packages/core/src/types.ts` becomes a re-export barrel:

```typescript
// packages/core/src/types.ts (after migration)
export type {
  AgentId, JobId, SkillId, MemoryId, ConversationId,
  ToolDefinition, ToolInputSchema, ToolCallResult, ToolHandler, ToolRegistration,
  ExecutionContext, StopReason,
  ContentBlock, ContentBlockText, ContentBlockToolUse, ContentBlockToolResult,
  AgentMessage, AgentTurn, AgentLoopOptions, AgentLoopResult,
  ModelProvider, ModelConfig, ModelResponse,
  JobStatus, Job, JobLogEntry,
  MemoryType, Memory,
  SkillSource, SkillExample, Skill,
  CostEntry, CostSummary,
  Conversation, StoredMessage,
} from '@blade/types'
```

This preserves backward compatibility: existing `import type { ... } from '@blade/core'` statements continue to work while new packages import directly from `@blade/types`.

---

## 3. ExecutionAPI

### Purpose

Clean facade that `packages/control` and `packages/conversation` call to use execution-plane capabilities. Prevents them from reaching into `agent-loop.ts`, `model-provider.ts`, `tool-registry.ts`, or `pipeline/` internals directly.

### TypeScript Interface

```typescript
// packages/core/src/execution-api.ts

import type {
  AgentLoopOptions,
  AgentLoopResult,
  AgentMessage,
  AgentTurn,
  ContentBlock,
  ToolCallResult,
  ToolDefinition,
  ExecutionContext,
  ModelConfig,
  ModelResponse,
  CostEntry,
} from '@blade/types'

// ============================================================
// STREAM EVENT TYPES
// ============================================================

export type AgentStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; result: ToolCallResult }
  | { type: 'turn'; turn: AgentTurn }
  | { type: 'error'; error: Error; context: string }
  | { type: 'done'; result: AgentLoopResult }

export type ModelStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'content_block_stop'; block: ContentBlock }
  | { type: 'message_done'; response: ModelResponse }

// ============================================================
// CODING PIPELINE TYPES
// ============================================================

export interface CodingPipelineOptions {
  title: string
  description: string
  repoUrl: string
  baseBranch?: string
  agentModel?: string
  onStatus?: (status: string, message: string) => void
}

export interface CodingPipelineResult {
  jobId: string
  status: 'completed' | 'failed'
  prUrl?: string
  prNumber?: number
  totalCost: number
  totalToolCalls: number
  totalIterations: number
  error?: string
}

// ============================================================
// EXECUTION API INTERFACE
// ============================================================

export interface ExecutionAPI {
  // ── Agent Loop ──────────────────────────────────────────────

  /** Run an agent loop to completion, receiving results via callbacks. */
  runLoop(options: AgentLoopOptions): Promise<AgentLoopResult>

  /**
   * Run an agent loop as an async generator of events.
   * Wraps runAgentLoop with streaming callbacks piped to a channel.
   */
  streamLoop(options: Omit<AgentLoopOptions, 'onTurn' | 'onToolCall' | 'onTextDelta' | 'onComplete' | 'onError'>): AsyncGenerator<AgentStreamEvent>

  // ── Tool Execution ──────────────────────────────────────────

  /** Execute a single tool by name. */
  executeTool(
    name: string,
    toolUseId: string,
    input: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ToolCallResult>

  /** Get all registered tool definitions (global scope). */
  getToolDefinitions(): ToolDefinition[]

  /** Get tool definitions filtered by category. */
  getToolsByCategory(category: ToolDefinition['category']): ToolDefinition[]

  /** Create an isolated tool scope (for per-employee or per-job sandboxing). */
  createToolScope(): string

  /** Register a tool into a specific scope. */
  registerScopedTool(
    scopeId: string,
    definition: ToolDefinition,
    handler: (input: Record<string, unknown>, context: ExecutionContext) => Promise<ToolCallResult>
  ): void

  /** Get tool definitions for a scope. */
  getScopedToolDefinitions(scopeId: string): ToolDefinition[]

  /** Destroy a tool scope. */
  destroyToolScope(scopeId: string): void

  // ── Model Calling ───────────────────────────────────────────

  /** Single-shot model call (non-streaming). */
  callModel(
    config: ModelConfig,
    systemPrompt: string,
    messages: AgentMessage[],
    tools?: ToolDefinition[],
    maxTokens?: number
  ): Promise<ModelResponse>

  /** Streaming model call. */
  streamModel(
    config: ModelConfig,
    systemPrompt: string,
    messages: AgentMessage[],
    tools?: ToolDefinition[],
    maxTokens?: number
  ): AsyncGenerator<ModelStreamEvent>

  /** Resolve a model ID to a full ModelConfig (provider detection). */
  resolveModelConfig(modelId?: string): ModelConfig

  /** Smart routing: pick model based on task complexity. */
  resolveSmartModelConfig(
    complexity?: 'light' | 'standard' | 'heavy',
    options?: { needsToolCalling?: boolean }
  ): ModelConfig

  // ── Cost Tracking ───────────────────────────────────────────

  /** Calculate cost for a model call (pure math, no DB). */
  calculateCost(model: string, inputTokens: number, outputTokens: number): CostEntry

  /** Check whether current spend is within budget. */
  isWithinBudget(currentCost: number, budget: number): boolean

  // ── Coding Pipeline ─────────────────────────────────────────

  /** Run the full coding pipeline (clone -> branch -> code -> test -> PR). */
  runCodingPipeline(options: CodingPipelineOptions): Promise<CodingPipelineResult>
}
```

### Function Mapping (existing code to interface methods)

| Interface Method | Current Function | Source File |
|---|---|---|
| `runLoop` | `runAgentLoop` | `agent-loop.ts` |
| `streamLoop` | NEW (wraps `runAgentLoop` callbacks into AsyncGenerator) | `execution-api.ts` |
| `executeTool` | `executeTool` | `tool-registry.ts` |
| `getToolDefinitions` | `getAllToolDefinitions` | `tool-registry.ts` |
| `getToolsByCategory` | `getToolsByCategory` | `tool-registry.ts` |
| `createToolScope` | `createToolScope` | `tool-registry.ts` |
| `registerScopedTool` | `registerScopedTool` | `tool-registry.ts` |
| `getScopedToolDefinitions` | `getScopedToolDefinitions` | `tool-registry.ts` |
| `destroyToolScope` | `destroyToolScope` | `tool-registry.ts` |
| `callModel` | `callModel` | `model-provider.ts` |
| `streamModel` | `streamModel` | `model-provider.ts` |
| `resolveModelConfig` | `resolveModelConfig` | `model-provider.ts` |
| `resolveSmartModelConfig` | `resolveSmartModelConfig` | `model-provider.ts` |
| `calculateCost` | `calculateCost` | `cost-tracker.ts` |
| `isWithinBudget` | `isWithinBudget` | `cost-tracker.ts` |
| `runCodingPipeline` | `runCodingPipeline` | `pipeline/coding-pipeline.ts` |

### Implementation: Concrete class

```typescript
// packages/core/src/execution-api.ts (implementation, same file)

import { runAgentLoop } from './agent-loop.js'
import { executeTool as execTool, getAllToolDefinitions, getToolsByCategory as getToolsByCat, createToolScope as createScope, registerScopedTool as regScoped, getScopedToolDefinitions as getScopedDefs, destroyToolScope as destroyScope } from './tool-registry.js'
import { callModel as callM, streamModel as streamM, resolveModelConfig as resolveMC, resolveSmartModelConfig as resolveSmartMC } from './model-provider.js'
import { calculateCost as calcCost, isWithinBudget as isWithin } from './cost-tracker.js'
import { runCodingPipeline as runPipeline } from './pipeline/index.js'

export function createExecutionAPI(): ExecutionAPI {
  return {
    runLoop: runAgentLoop,

    async *streamLoop(options) {
      // Bridge callback-based API to AsyncGenerator using a channel
      const channel = createEventChannel<AgentStreamEvent>()

      const loopPromise = runAgentLoop({
        ...options,
        onTextDelta: (text) => channel.push({ type: 'text_delta', text }),
        onToolCall: (result) => channel.push({ type: 'tool_call', result }),
        onTurn: (turn) => channel.push({ type: 'turn', turn }),
        onError: (error, ctx) => channel.push({ type: 'error', error, context: ctx }),
        onComplete: (result) => {
          channel.push({ type: 'done', result })
          channel.close()
        },
      }).catch((err) => {
        channel.push({ type: 'error', error: err instanceof Error ? err : new Error(String(err)), context: 'loop_crash' })
        channel.close()
      })

      yield* channel

      await loopPromise
    },

    executeTool: execTool,
    getToolDefinitions: getAllToolDefinitions,
    getToolsByCategory: getToolsByCat,
    createToolScope: createScope,
    registerScopedTool: regScoped,
    getScopedToolDefinitions: getScopedDefs,
    destroyToolScope: destroyScope,

    callModel: callM,
    streamModel: streamM,
    resolveModelConfig: resolveMC,
    resolveSmartModelConfig: resolveSmartMC,

    calculateCost: calcCost,
    isWithinBudget: isWithin,

    runCodingPipeline: runPipeline,
  }
}
```

### Dependency Direction

```
packages/control  ──imports──>  ExecutionAPI  (from @blade/core)
packages/conversation  ──imports──>  ExecutionAPI  (from @blade/core)
packages/core  ──exports──>  ExecutionAPI

packages/core NEVER imports from control or conversation.
```

### What's New vs What Stays

| Item | Status |
|------|--------|
| `agent-loop.ts` | STAYS in core, unchanged |
| `model-provider.ts` | STAYS in core, unchanged |
| `tool-registry.ts` | STAYS in core, unchanged |
| `cost-tracker.ts` | STAYS in core, unchanged |
| `pipeline/` | STAYS in core, unchanged |
| `execution-api.ts` | NEW — facade file, ~80 lines |
| `streamLoop` | NEW — bridges callbacks to AsyncGenerator |

---

## 4. ConversationEngine

### Purpose

Unified reply engine that replaces duplicated orchestration logic in:
- `apps/web/src/app/api/chat/route.ts` (lines 56-178: prompt building, history loading, agent loop, message persistence, cost recording, SSE emission)
- `packages/core/src/integrations/telegram.ts` (lines 306-358 voice flow, lines 390-458 text flow: prompt building, history loading, agent loop, message persistence)
- `packages/core/src/chat/reply.ts` (lines 85-119: runConversationReply wrapper)

### Duplicated Logic Identified

Both web and Telegram do the same 7 steps:

1. **Resolve/create conversation** -- `conversations.get()` / `conversations.create()`
2. **Load message history** -- `messages.listByConversation()`
3. **Build system prompt** -- `loadPersonality()` + `buildMemoryAugmentedPrompt()`
4. **Resolve model config** -- `resolveSmartModelConfig()`
5. **Run agent loop** -- `runAgentLoop()` / `runConversationReply()`
6. **Persist messages** -- `messages.create()` for both user and assistant
7. **Record costs** -- `costEntries.record()`

Web additionally does: SSE streaming, conversation title update.
Telegram additionally does: markdown stripping, message splitting, voice transcription/synthesis, XP awards.

### TypeScript Interface

```typescript
// packages/conversation/src/types.ts

import type {
  ConversationId,
  AgentMessage,
  AgentLoopResult,
  ToolCallResult,
  AgentTurn,
} from '@blade/types'

// ── Channel Types ─────────────────────────────────────────────

export type ChannelType = 'web' | 'telegram' | 'cli' | 'api' | 'slack' | 'email'

// ── Conversation Request ──────────────────────────────────────

export interface ConversationRequest {
  /** Existing conversation ID, or undefined to start a new one. */
  conversationId?: ConversationId
  /** The user's message text. */
  message: string
  /** Which channel this request originates from. */
  channel: ChannelType
  /** Channel-specific metadata (e.g., Telegram chatId, web sessionId). */
  channelMetadata?: Record<string, unknown>
  /** Which employee should respond (undefined = default Blade personality). */
  employeeId?: string
  /** User identifier. */
  userId: string
  /** Override system prompt (if not provided, engine builds one). */
  systemPromptOverride?: string
  /** Override max iterations (if not provided, uses config default). */
  maxIterations?: number
  /** Override cost budget (if not provided, uses config default). */
  costBudget?: number
}

// ── Conversation Events (streamed to adapters) ────────────────

export type ConversationEvent =
  | { type: 'conversation_started'; conversationId: ConversationId }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; name: string; input: Record<string, unknown>; result: ToolCallResult }
  | { type: 'turn'; iteration: number; costSoFar: number; stopReason: string }
  | { type: 'thinking'; summary: string }
  | { type: 'done'; conversationId: ConversationId; response: string; cost: number; toolCalls: number; stopReason: string }
  | { type: 'error'; message: string }

// ── Conversation State ────────────────────────────────────────

export interface ConversationState {
  conversationId: ConversationId
  title?: string
  history: AgentMessage[]
  channels: ChannelType[]
  createdAt: string
  updatedAt: string
}
```

```typescript
// packages/conversation/src/engine.ts

import type {
  ConversationId,
  AgentMessage,
} from '@blade/types'
import type {
  ConversationRequest,
  ConversationEvent,
  ConversationState,
  ChannelType,
} from './types.js'

export interface ConversationEngine {
  /**
   * Core method -- all channels call this.
   * Yields ConversationEvents as the agent loop progresses.
   * Handles: prompt building, memory retrieval, model resolution,
   * agent loop execution, message persistence, cost recording.
   */
  reply(request: ConversationRequest): AsyncGenerator<ConversationEvent>

  /**
   * Non-streaming convenience method.
   * Consumes the full reply() generator and returns the final response text.
   * Used by Telegram and CLI where streaming is not needed.
   */
  replySync(request: ConversationRequest): Promise<{
    conversationId: ConversationId
    responseText: string
    cost: number
    toolCalls: number
  }>

  // ── Lifecycle ───────────────────────────────────────────────

  /** Start a new conversation, returning its ID. */
  startConversation(channel: ChannelType, title?: string): ConversationId

  /** Resume an existing conversation, loading its state from DB. */
  resumeConversation(conversationId: ConversationId): ConversationState | undefined

  /** Get message history for a conversation. */
  getHistory(conversationId: ConversationId, limit?: number): AgentMessage[]

  // ── Cross-Channel Sync ──────────────────────────────────────

  /**
   * Link a channel identifier to a conversation so the same conversation
   * can be continued across web, Telegram, CLI, etc.
   */
  linkChannel(conversationId: ConversationId, channelId: string, channel: ChannelType): void

  /**
   * Look up a conversation by channel-specific identifier.
   * e.g., find the conversation for Telegram chat 12345.
   */
  findByChannel(channelId: string, channel: ChannelType): ConversationId | undefined
}
```

### Function Mapping (existing code to engine methods)

| Engine Method | Current Source | Current Function/Logic |
|---|---|---|
| `reply()` | `route.ts` lines 56-178 | Prompt build + `runAgentLoop()` + SSE emission + persistence |
| `reply()` | `telegram.ts` lines 390-458 | Prompt build + `runConversationReply()` + persistence |
| `reply()` | `chat/reply.ts` `runConversationReply()` | Agent loop + fallback summarization |
| `replySync()` | NEW | Wraps `reply()` generator, collects final text |
| `startConversation()` | `route.ts` line 57 / `telegram.ts` `getOrCreateConversation()` | `conversations.create()` |
| `resumeConversation()` | `telegram.ts` `loadHistoryFromDb()` | `conversations.get()` + `messages.listByConversation()` |
| `getHistory()` | `route.ts` line 71 / `telegram.ts` line 48 | `messages.listByConversation()` |
| `linkChannel()` | NEW | Enables cross-channel continuation |
| `findByChannel()` | `telegram.ts` `findConversationForChat()` | Linear scan of conversations by title |

### Internal Composition

```typescript
// packages/conversation/src/engine.ts (implementation sketch)

import type { ExecutionAPI } from '@blade/core'
import { conversations, messages, costEntries } from '@blade/db'
import { loadConfig } from '@blade/shared'

export function createConversationEngine(executionApi: ExecutionAPI): ConversationEngine {
  return {
    async *reply(request) {
      // 1. Resolve or create conversation
      const conversationId = request.conversationId
        ?? this.startConversation(request.channel, request.message.slice(0, 100))
      yield { type: 'conversation_started', conversationId }

      // 2. Load history
      const history = this.getHistory(conversationId)

      // 3. Persist user message
      messages.create({ conversationId, role: 'user', content: request.message })
      history.push({ role: 'user', content: request.message })

      // 4. Build system prompt (personality + memory augmentation)
      const systemPrompt = request.systemPromptOverride
        ?? buildContextualPrompt(request)    // context-builder.ts

      // 5. Resolve model config
      const modelConfig = executionApi.resolveSmartModelConfig('standard', { needsToolCalling: true })

      // 6. Resolve tool set (optionally filtered by employee policy)
      const tools = request.employeeId
        ? resolveEmployeeTools(request.employeeId, executionApi)   // policy-resolver.ts
        : executionApi.getToolDefinitions()

      // 7. Build execution context
      const config = loadConfig()
      const context = {
        conversationId,
        userId: request.userId,
        modelId: modelConfig.modelId,
        modelConfig,
        maxIterations: request.maxIterations ?? config.maxIterations ?? 15,
        costBudget: request.costBudget ?? config.costBudget ?? 0,
      }

      // 8. Stream the agent loop
      for await (const event of executionApi.streamLoop({
        systemPrompt,
        messages: history,
        tools,
        context,
        streaming: true,
      })) {
        // Re-emit as ConversationEvents
        switch (event.type) {
          case 'text_delta':
            yield { type: 'text_delta', text: event.text }
            break
          case 'tool_call':
            yield { type: 'tool_call', name: event.result.toolName, input: event.result.input, result: event.result }
            break
          case 'turn':
            yield { type: 'turn', iteration: event.turn.iteration, costSoFar: event.turn.costSoFar, stopReason: event.turn.response.stopReason }
            break
          case 'done': {
            const r = event.result
            // 9. Persist assistant message
            messages.create({
              conversationId,
              role: 'assistant',
              content: r.finalResponse,
              model: context.modelId,
              inputTokens: r.turns.reduce((s, t) => s + t.response.inputTokens, 0),
              outputTokens: r.turns.reduce((s, t) => s + t.response.outputTokens, 0),
            })
            // 10. Record cost
            if (r.totalCost > 0) {
              const cost = executionApi.calculateCost(
                context.modelId,
                r.turns.reduce((s, t) => s + t.response.inputTokens, 0),
                r.turns.reduce((s, t) => s + t.response.outputTokens, 0),
              )
              costEntries.record({ ...cost, conversationId })
            }
            yield { type: 'done', conversationId, response: r.finalResponse, cost: r.totalCost, toolCalls: r.totalToolCalls, stopReason: r.stopReason }
            break
          }
          case 'error':
            yield { type: 'error', message: event.error.message }
            break
        }
      }
    },

    async replySync(request) {
      let responseText = ''
      let conversationId = request.conversationId ?? ''
      let cost = 0
      let toolCalls = 0

      for await (const event of this.reply(request)) {
        switch (event.type) {
          case 'conversation_started':
            conversationId = event.conversationId
            break
          case 'done':
            responseText = event.response
            cost = event.cost
            toolCalls = event.toolCalls
            break
          case 'error':
            if (!responseText) responseText = 'I encountered an error processing your request.'
            break
        }
      }

      return { conversationId, responseText, cost, toolCalls }
    },

    startConversation(channel, title) {
      const conv = conversations.create(title)
      return conv.id
    },

    resumeConversation(conversationId) {
      const conv = conversations.get(conversationId)
      if (!conv) return undefined
      const msgs = messages.listByConversation(conversationId)
      return {
        conversationId,
        title: conv.title,
        history: msgs.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        channels: [],      // TODO: populate from channel_links table
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
      }
    },

    getHistory(conversationId, limit = 100) {
      return messages.listByConversation(conversationId, limit)
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
    },

    linkChannel(_conversationId, _channelId, _channel) {
      // TODO: persist to channel_links table (new migration)
    },

    findByChannel(channelId, channel) {
      // Current Telegram approach: linear scan by title convention
      // Target: indexed lookup in channel_links table
      const title = `${channel} chat ${channelId}`
      const all = conversations.list(500)
      return all.find(c => c.title === title)?.id
    },
  }
}
```

### Dependency Direction

```
packages/conversation
  ├── imports @blade/types       (pure types)
  ├── imports @blade/shared      (logger, loadConfig)
  ├── imports @blade/db          (conversations, messages, costEntries repos)
  └── imports @blade/core        (ExecutionAPI only — injected via createConversationEngine)

packages/core NEVER imports from packages/conversation.
```

### What Moves, What Stays, What's New

| Item | Action | Details |
|------|--------|--------|
| `packages/core/src/chat/reply.ts` | **MOVE** | `runConversationReply()` logic absorbed into `ConversationEngine.reply()`. `extractBestResponseText()` stays as a utility in `@blade/core` (used by pipeline too). |
| `packages/core/src/chat/` directory | **REMOVE** from core | After moving `reply.ts` logic to conversation engine |
| `packages/core/src/integrations/telegram.ts` | **REFACTOR** into `packages/conversation/src/adapters/telegram.ts` | Becomes thin adapter (~80 lines) calling `engine.replySync()` |
| `apps/web/src/app/api/chat/route.ts` | **REFACTOR** | Becomes thin SSE adapter (~60 lines) calling `engine.reply()` |
| `packages/core/src/learning/memory-injection.ts` | **COPY** into `packages/conversation/src/context-builder.ts` | Prompt assembly + memory retrieval. Original stays in core for pipeline use. |
| `packages/conversation/src/engine.ts` | **NEW** | ConversationEngine implementation |
| `packages/conversation/src/types.ts` | **NEW** | ConversationRequest, ConversationEvent, ChannelType |
| `packages/conversation/src/context-builder.ts` | **NEW** | System prompt + memory + employee context assembly |
| `packages/conversation/src/policy-resolver.ts` | **NEW** | Tool filtering per employee/channel |

---

## 5. ChannelAdapter

### Purpose

Thin, channel-specific glue between an external transport (Telegram HTTP, web SSE, CLI stdin/stdout, REST API) and the `ConversationEngine`. Each adapter handles:
- Parsing incoming messages from the channel's native format into `ConversationRequest`
- Consuming `ConversationEvent` generators and formatting output for the channel
- Channel-specific concerns (auth, rate limiting, message splitting, typing indicators)

### TypeScript Interface

```typescript
// packages/conversation/src/adapters/types.ts

import type { ConversationRequest, ConversationEvent, ChannelType } from '../types.js'

/**
 * Contract for channel adapters.
 *
 * Adapters are NOT called by the engine. They CALL the engine.
 * The engine has no knowledge of any adapter.
 * This interface exists to enforce a consistent shape across adapters
 * and enable testing with mock adapters.
 */
export interface ChannelAdapter<TIncoming = unknown, TOutgoing = unknown> {
  /** Which channel this adapter handles. */
  readonly channel: ChannelType

  /**
   * Parse a raw incoming message from the channel into a ConversationRequest.
   * Channel-specific validation and auth happens here.
   */
  parseIncoming(raw: TIncoming): ConversationRequest | null

  /**
   * Consume a stream of ConversationEvents and deliver them to the channel.
   * For SSE: writes SSE frames to a writable stream.
   * For Telegram: accumulates text, sends messages, shows typing.
   * For CLI: prints to stdout.
   * For API: buffers JSON response.
   */
  deliver(events: AsyncGenerator<ConversationEvent>, context: DeliveryContext): Promise<TOutgoing>

  /**
   * Format a final response for the channel.
   * e.g., strip markdown for Telegram, wrap in SSE envelope for web.
   */
  formatResponse(text: string): string
}

export interface DeliveryContext {
  /** Channel-specific destination (Telegram chatId, HTTP response writer, etc.) */
  destination: unknown
  /** Conversation ID for this exchange. */
  conversationId: string
}
```

### Concrete Adapter Shapes

#### Web SSE Adapter

```typescript
// packages/conversation/src/adapters/web.ts

import type { ChannelAdapter, DeliveryContext } from './types.js'
import type { ConversationRequest, ConversationEvent } from '../types.js'

interface WebIncoming {
  message: string
  conversationId?: string
  userId: string
}

/**
 * Parses Next.js request body into ConversationRequest.
 * Delivers ConversationEvents as SSE frames.
 *
 * Maps to current: apps/web/src/app/api/chat/route.ts (POST handler)
 */
export class WebSSEAdapter implements ChannelAdapter<WebIncoming, ReadableStream> {
  readonly channel = 'web' as const

  parseIncoming(raw: WebIncoming): ConversationRequest {
    return {
      message: raw.message,
      conversationId: raw.conversationId,
      userId: raw.userId,
      channel: 'web',
    }
  }

  async deliver(events: AsyncGenerator<ConversationEvent>, context: DeliveryContext): Promise<ReadableStream> {
    const encoder = new TextEncoder()

    return new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown): void => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        }

        for await (const event of events) {
          switch (event.type) {
            case 'text_delta':
              send('text', { conversationId: context.conversationId, text: event.text })
              break
            case 'tool_call':
              send('tool_call', {
                conversationId: context.conversationId,
                toolName: event.name,
                input: event.input,
                success: event.result.success,
                display: event.result.display,
                durationMs: event.result.durationMs,
              })
              break
            case 'turn':
              send('turn', {
                conversationId: context.conversationId,
                iteration: event.iteration,
                costSoFar: event.costSoFar,
                stopReason: event.stopReason,
              })
              break
            case 'done':
              send('done', {
                conversationId: event.conversationId,
                finalResponse: event.response,
                totalCost: event.cost,
                totalToolCalls: event.toolCalls,
                stopReason: event.stopReason,
              })
              break
            case 'error':
              send('error', { conversationId: context.conversationId, error: event.message })
              break
          }
        }
        controller.close()
      },
    })
  }

  formatResponse(text: string): string {
    return text  // Web UI handles formatting client-side
  }
}
```

#### Telegram Adapter

```typescript
// packages/conversation/src/adapters/telegram.ts

import type { ChannelAdapter, DeliveryContext } from './types.js'
import type { ConversationRequest, ConversationEvent } from '../types.js'

interface TelegramIncoming {
  chatId: string
  text: string
  isVoice: boolean
  voiceTranscript?: string
}

/**
 * Parses Telegram message into ConversationRequest.
 * Delivers by accumulating the done event and sending via TelegramBot API.
 *
 * Maps to current: packages/core/src/integrations/telegram.ts (message handler)
 */
export class TelegramAdapter implements ChannelAdapter<TelegramIncoming, string> {
  readonly channel = 'telegram' as const

  parseIncoming(raw: TelegramIncoming): ConversationRequest {
    return {
      message: raw.isVoice ? (raw.voiceTranscript ?? '') : raw.text,
      userId: `telegram-${raw.chatId}`,
      channel: 'telegram',
      channelMetadata: { chatId: raw.chatId, isVoice: raw.isVoice },
    }
  }

  async deliver(events: AsyncGenerator<ConversationEvent>, _context: DeliveryContext): Promise<string> {
    let responseText = ''
    for await (const event of events) {
      if (event.type === 'done') {
        responseText = event.response
      }
    }
    return this.formatResponse(responseText)
  }

  formatResponse(text: string): string {
    // Strip markdown for Telegram (from current cleanResponse)
    let cleaned = text
    cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, '$1')
    cleaned = cleaned.replace(/\*(.*?)\*/g, '$1')
    cleaned = cleaned.replace(/#{1,6}\s/g, '')
    cleaned = cleaned.replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/g, '').trim())
    cleaned = cleaned.replace(/`([^`]+)`/g, '$1')
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim()
    return cleaned
  }
}
```

#### CLI Adapter

```typescript
// packages/conversation/src/adapters/cli.ts

import type { ChannelAdapter, DeliveryContext } from './types.js'
import type { ConversationRequest, ConversationEvent } from '../types.js'

interface CLIIncoming {
  text: string
  conversationId?: string
}

export class CLIAdapter implements ChannelAdapter<CLIIncoming, string> {
  readonly channel = 'cli' as const

  parseIncoming(raw: CLIIncoming): ConversationRequest {
    return {
      message: raw.text,
      conversationId: raw.conversationId,
      userId: 'cli-user',
      channel: 'cli',
    }
  }

  async deliver(events: AsyncGenerator<ConversationEvent>, _context: DeliveryContext): Promise<string> {
    let responseText = ''
    for await (const event of events) {
      if (event.type === 'text_delta') {
        process.stdout.write(event.text)
      }
      if (event.type === 'done') {
        responseText = event.response
      }
    }
    return responseText
  }

  formatResponse(text: string): string {
    return text
  }
}
```

#### REST API Adapter

```typescript
// packages/conversation/src/adapters/api.ts

import type { ChannelAdapter, DeliveryContext } from './types.js'
import type { ConversationRequest, ConversationEvent } from '../types.js'

interface APIIncoming {
  message: string
  conversationId?: string
  userId: string
  employeeId?: string
}

interface APIResponse {
  conversationId: string
  response: string
  cost: number
  toolCalls: number
}

export class APIAdapter implements ChannelAdapter<APIIncoming, APIResponse> {
  readonly channel = 'api' as const

  parseIncoming(raw: APIIncoming): ConversationRequest {
    return {
      message: raw.message,
      conversationId: raw.conversationId,
      userId: raw.userId,
      employeeId: raw.employeeId,
      channel: 'api',
    }
  }

  async deliver(events: AsyncGenerator<ConversationEvent>, _context: DeliveryContext): Promise<APIResponse> {
    let result: APIResponse = { conversationId: '', response: '', cost: 0, toolCalls: 0 }
    for await (const event of events) {
      if (event.type === 'conversation_started') {
        result.conversationId = event.conversationId
      }
      if (event.type === 'done') {
        result = {
          conversationId: event.conversationId,
          response: event.response,
          cost: event.cost,
          toolCalls: event.toolCalls,
        }
      }
    }
    return result
  }

  formatResponse(text: string): string {
    return text
  }
}
```

### Dependency Direction

```
ChannelAdapters (web, telegram, cli, api)
  ├── import from packages/conversation/src/types.ts   (ConversationRequest, ConversationEvent)
  ├── import from packages/conversation/src/adapters/types.ts (ChannelAdapter interface)
  └── DO NOT import from packages/core or packages/db directly

The adapter calls engine.reply(request), receives events, and delivers them.
The engine calls ExecutionAPI. The adapter never touches execution internals.
```

---

## 6. Migration Notes

### Phase 1: Create packages/types (no breaking changes)

1. Create `packages/types/` with all types extracted from `packages/core/src/types.ts`.
2. Add new types: `CodingPipelineOptions`, `CodingPipelineResult`, `ChannelType`, `ConversationRequest`, `ConversationEvent`.
3. Make `packages/core/src/types.ts` a re-export barrel from `@blade/types`.
4. All existing imports continue to work unchanged.

### Phase 2: Create ExecutionAPI (no breaking changes)

1. Add `packages/core/src/execution-api.ts` -- the interface + `createExecutionAPI()` factory.
2. Add `streamLoop` implementation with an internal event channel utility.
3. Export from `packages/core/src/index.ts`: `export { createExecutionAPI } from './execution-api.js'`.
4. Existing direct imports of `runAgentLoop`, `callModel`, etc. continue to work. The ExecutionAPI is additive.

### Phase 3: Create packages/conversation (parallel to existing code)

1. Create `packages/conversation/` with `engine.ts`, `types.ts`, `context-builder.ts`, `policy-resolver.ts`.
2. Implement `createConversationEngine(executionApi)`.
3. Create adapter implementations in `adapters/`.
4. Wire `apps/web/src/app/api/chat/route.ts` to use `WebSSEAdapter` + `ConversationEngine` behind a feature flag.
5. Wire `packages/core/src/integrations/telegram.ts` to use `TelegramAdapter` + `ConversationEngine` behind a feature flag.
6. Once validated, remove the old duplicated logic.

### Phase 4: Create packages/control (depends on ExecutionAPI)

1. Move `employees/`, `orchestration/`, `cron/`, `webhooks/`, `intelligence/`, `evolution/`, `gamification/`, `learning/`, `skills/` from `packages/core/` to `packages/control/`.
2. All moved modules call `ExecutionAPI` instead of importing core internals directly.
3. Update `packages/core/src/index.ts` to stop re-exporting moved modules.
4. Update all consumers (apps/, conversation/) to import from `@blade/control`.

### New DB Migration Required

```sql
-- 0008_channel_links.sql
CREATE TABLE IF NOT EXISTS channel_links (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  channel TEXT NOT NULL,         -- 'web' | 'telegram' | 'cli' | 'api'
  channel_id TEXT NOT NULL,      -- e.g., Telegram chatId, web sessionId
  created_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id),
  UNIQUE(channel, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_links_lookup
  ON channel_links(channel, channel_id);
```

### Risk Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing imports | Phase 1-2 are additive. Re-export barrels preserve backward compat. |
| Circular dependencies | Strict DAG enforced: types <- shared <- db <- core <- control <- conversation <- apps |
| Runtime regression in conversation flow | Feature flags in Phase 3. Old and new code coexist. |
| Tool scope leaks across employees | ExecutionAPI.createToolScope returns isolated IDs; engine creates per-request scopes. |
| AsyncGenerator backpressure | streamLoop uses a bounded channel with configurable buffer. |

---

## Appendix: Package Dependency Matrix

```
                  types  shared  db    core  control  conversation
types               -      -     -      -      -          -
shared              Y      -     -      -      -          -
db                  Y      Y     -      -      -          -
core                Y      Y     Y      -      -          -
control             Y      Y     Y      Y      -          -
conversation        Y      Y     Y      Y      Y          -
apps/*              Y      Y     Y      Y      Y          Y
```

Y = imports from. Strictly lower-triangular = no cycles possible.
