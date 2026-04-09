/**
 * ExecutionAPI — Clean boundary between the control/conversation planes and
 * the execution plane (agent loop, tools, models, pipeline).
 *
 * Control and conversation packages import only this interface from @blade/core.
 * The execution plane never imports from control or conversation.
 */

import crypto from 'node:crypto'
import type {
  AgentLoopOptions,
  AgentLoopResult,
  AgentTurn,
  ContentBlock,
  ToolCallResult,
  ToolDefinition,
  ExecutionContext,
  ModelConfig,
  ModelResponse,
  CostEntry,
  ToolHandler,
} from './types.js'
import { createEventChannel } from './utils/event-channel.js'
import { runAgentLoop } from './agent-loop.js'
import {
  executeTool as execToolFn,
  getAllToolDefinitions,
  getToolsByCategory as getToolsByCategoryFn,
  createToolScope as createToolScopeFn,
  createFilteredScope as createFilteredScopeFn,
  registerScopedTool as registerScopedToolFn,
  getScopedToolDefinitions as getScopedToolDefsFn,
  destroyToolScope as destroyToolScopeFn,
} from './tool-registry.js'
import {
  callModel as callModelFn,
  streamModel as streamModelFn,
  resolveModelConfig as resolveModelConfigFn,
  resolveSmartModelConfig as resolveSmartModelConfigFn,
} from './model-provider.js'
import { calculateCost as calculateCostFn, isWithinBudget as isWithinBudgetFn } from './cost-tracker.js'

// ============================================================
// STREAM EVENT TYPES
// ============================================================

export type AgentStreamEvent =
  | { readonly type: 'text_delta'; readonly text: string }
  | { readonly type: 'tool_call'; readonly result: ToolCallResult }
  | { readonly type: 'turn'; readonly turn: AgentTurn }
  | { readonly type: 'error'; readonly error: Error; readonly context: string }
  | { readonly type: 'done'; readonly result: AgentLoopResult }

export type ModelStreamEvent =
  | { readonly type: 'text_delta'; readonly text: string }
  | { readonly type: 'content_block_stop'; readonly block: ContentBlock }
  | { readonly type: 'message_done'; readonly response: ModelResponse }

// ============================================================
// CODING PIPELINE TYPES
// ============================================================

export interface CodingPipelineOptions {
  readonly title: string
  readonly description: string
  readonly repoUrl: string
  readonly baseBranch?: string
  readonly agentModel?: string
  readonly onStatus?: (status: string, message: string) => void
}

export interface CodingPipelineResult {
  readonly jobId: string
  readonly status: 'completed' | 'failed'
  readonly prUrl?: string
  readonly prNumber?: number
  readonly totalCost: number
  readonly totalToolCalls: number
  readonly totalIterations: number
  readonly error?: string
}

// ============================================================
// EXECUTION API INTERFACE
// ============================================================

export interface ExecutionAPI {
  // -- Agent Loop ------------------------------------------------

  /** Run an agent loop to completion via callbacks. */
  runLoop(options: AgentLoopOptions): Promise<AgentLoopResult>

  /**
   * Run an agent loop as an async generator of events.
   * Bridges runAgentLoop's callbacks into an AsyncGenerator via EventChannel.
   *
   * Callers pass everything except the callback options (onTurn, onToolCall,
   * onTextDelta, onComplete, onError) — those are wired internally.
   */
  streamLoop(
    options: Omit<AgentLoopOptions, 'onTurn' | 'onToolCall' | 'onTextDelta' | 'onComplete' | 'onError'>
  ): AsyncGenerator<AgentStreamEvent>

  // -- Tool Execution --------------------------------------------

  /** Execute a single tool by name. */
  executeTool(
    name: string,
    toolUseId: string,
    input: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ToolCallResult>

  /** All registered tool definitions (global scope). */
  getToolDefinitions(): ToolDefinition[]

  /** Tool definitions filtered by category. */
  getToolsByCategory(category: ToolDefinition['category']): ToolDefinition[]

  /** Create an empty isolated tool scope, returning its ID. */
  createToolScope(): string

  /**
   * Create a tool scope pre-populated with global tools matching allowedNames.
   * This is the primary way to enforce per-employee tool restrictions.
   */
  createFilteredScope(allowedToolNames: readonly string[]): string

  /** Register a tool into a specific scope. */
  registerScopedTool(
    scopeId: string,
    definition: ToolDefinition,
    handler: ToolHandler
  ): void

  /** Get tool definitions for a scope. */
  getScopedToolDefinitions(scopeId: string): ToolDefinition[]

  /** Destroy a tool scope. */
  destroyToolScope(scopeId: string): void

  // -- Model Calling ---------------------------------------------

  /** Single-shot model call (non-streaming). */
  callModel(
    config: ModelConfig,
    systemPrompt: string,
    messages: readonly import('./types.js').AgentMessage[],
    tools?: readonly ToolDefinition[],
    maxTokens?: number
  ): Promise<ModelResponse>

  /** Streaming model call. */
  streamModel(
    config: ModelConfig,
    systemPrompt: string,
    messages: readonly import('./types.js').AgentMessage[],
    tools?: readonly ToolDefinition[],
    maxTokens?: number
  ): AsyncGenerator<ModelStreamEvent>

  /** Resolve a model ID string to a full ModelConfig. */
  resolveModelConfig(modelId?: string): ModelConfig

  /** Smart routing: pick model based on task complexity. */
  resolveSmartModelConfig(
    complexity?: 'light' | 'standard' | 'heavy',
    options?: { needsToolCalling?: boolean }
  ): ModelConfig

  // -- Cost Tracking ---------------------------------------------

  /** Calculate cost for a model call (pure math, no DB writes). */
  calculateCost(model: string, inputTokens: number, outputTokens: number): CostEntry

  /** Check whether current spend is within budget. */
  isWithinBudget(currentCost: number, budget: number): boolean

  // -- Coding Pipeline -------------------------------------------

  /**
   * Run the full coding pipeline (clone -> branch -> code -> test -> PR).
   * Note: The underlying function has a richer param set (jobId, githubToken, etc.)
   * This facade accepts the simplified options and delegates.
   */
  runCodingPipeline(options: CodingPipelineOptions): Promise<CodingPipelineResult>
}

// ============================================================
// FACTORY
// ============================================================

/**
 * Create an ExecutionAPI instance.
 *
 * All internal modules are imported eagerly at construction time.
 * This is safe because execution-api.ts is only imported by external
 * packages (control, conversation) that load after core is fully built.
 */
export function createExecutionAPI(): ExecutionAPI {
  // Only pipeline is lazy-loaded (heavy Docker deps)
  let _pipeline: null | Awaited<typeof import('./pipeline/index.js')> = null

  const api: ExecutionAPI = {
    runLoop: (options) => runAgentLoop(options),

    async *streamLoop(options) {
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
      }).catch((err: unknown) => {
        const error = err instanceof Error ? err : new Error(String(err))
        channel.push({ type: 'error', error, context: 'loop_crash' })
        channel.close()
      })

      yield* channel

      await loopPromise
    },

    executeTool: (name, toolUseId, input, context) => execToolFn(name, toolUseId, input, context),
    getToolDefinitions: () => getAllToolDefinitions(),
    getToolsByCategory: (category) => getToolsByCategoryFn(category),
    createToolScope: () => createToolScopeFn(),
    createFilteredScope: (allowedToolNames) => createFilteredScopeFn(allowedToolNames),
    registerScopedTool: (scopeId, definition, handler) => registerScopedToolFn(scopeId, definition, handler),
    getScopedToolDefinitions: (scopeId) => getScopedToolDefsFn(scopeId),
    destroyToolScope: (scopeId) => destroyToolScopeFn(scopeId),

    callModel: (config, systemPrompt, messages, tools, maxTokens) =>
      callModelFn(config, systemPrompt, [...messages], tools ? [...tools] : [], maxTokens),

    async *streamModel(config, systemPrompt, messages, tools, maxTokens) {
      yield* streamModelFn(config, systemPrompt, [...messages], tools ? [...tools] : [], maxTokens)
    },

    resolveModelConfig: (modelId) => resolveModelConfigFn(modelId),
    resolveSmartModelConfig: (complexity, options) => resolveSmartModelConfigFn(complexity, options),
    calculateCost: (model, inputTokens, outputTokens) => calculateCostFn(model, inputTokens, outputTokens),
    isWithinBudget: (currentCost, budget) => isWithinBudgetFn(currentCost, budget),

    async runCodingPipeline(options) {
      if (!_pipeline) _pipeline = await import('./pipeline/index.js')
      const result = await _pipeline.runCodingPipeline({
        jobId: crypto.randomUUID(),
        title: options.title,
        description: options.description,
        repoUrl: options.repoUrl,
        baseBranch: options.baseBranch ?? 'main',
        agentModel: options.agentModel ?? 'claude-sonnet-4-20250514',
        githubToken: process.env.GITHUB_TOKEN ?? '',
        onStatus: options.onStatus,
      })
      return {
        jobId: '',
        status: 'completed' as const,
        prUrl: result.prUrl,
        prNumber: result.prNumber,
        totalCost: result.totalCost,
        totalToolCalls: 0,
        totalIterations: 0,
      }
    },
  }

  return api
}
