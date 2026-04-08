// ============================================================
// CORE IDENTITY
// ============================================================

export type AgentId = string
export type JobId = string
export type SkillId = string
export type MemoryId = string
export type ConversationId = string

// ============================================================
// TOOL SYSTEM
// ============================================================

export interface ToolInputSchema {
  type: 'object'
  properties: Record<string, {
    type: string
    description: string
    enum?: string[]
    default?: unknown
  }>
  required: string[]
}

export interface ToolDefinition {
  name: string
  description: string
  input_schema: ToolInputSchema
  category: 'coding' | 'memory' | 'web' | 'system' | 'custom'
  requiresDocker?: boolean
}

export interface ToolCallResult {
  toolUseId: string
  toolName: string
  input: Record<string, unknown>
  success: boolean
  data: unknown
  display: string
  durationMs: number
  cost?: CostEntry
  timestamp: string
}

export type ToolHandler = (
  input: Record<string, unknown>,
  context: ExecutionContext
) => Promise<ToolCallResult>

export interface ToolRegistration {
  definition: ToolDefinition
  handler: ToolHandler
}

// ============================================================
// EXECUTION CONTEXT
// ============================================================

export interface ExecutionContext {
  jobId?: JobId
  conversationId: ConversationId
  workingDir?: string
  containerName?: string
  repoUrl?: string
  branch?: string
  userId: string
  modelId: string
  maxIterations: number
  costBudget: number
}

// ============================================================
// AGENT LOOP
// ============================================================

export type StopReason =
  | 'end_turn'
  | 'tool_use'
  | 'max_iterations'
  | 'cost_limit'
  | 'error'

export interface ContentBlockText {
  type: 'text'
  text: string
}

export interface ContentBlockToolUse {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ContentBlockToolResult {
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error?: boolean
}

export type ContentBlock =
  | ContentBlockText
  | ContentBlockToolUse
  | ContentBlockToolResult

export interface AgentMessage {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

export interface AgentTurn {
  iteration: number
  response: {
    content: ContentBlock[]
    model: string
    inputTokens: number
    outputTokens: number
    stopReason: string
  }
  toolCalls: ToolCallResult[]
  costSoFar: number
}

export interface AgentLoopOptions {
  systemPrompt: string
  messages: AgentMessage[]
  tools: ToolDefinition[]
  context: ExecutionContext
  maxIterations?: number
  costBudget?: number
  onTurn?: (turn: AgentTurn) => void
  onToolCall?: (result: ToolCallResult) => void
  onTextDelta?: (text: string) => void
}

export interface AgentLoopResult {
  finalResponse: string
  turns: AgentTurn[]
  totalCost: number
  totalToolCalls: number
  stopReason: StopReason
}

// ============================================================
// MODEL PROVIDER
// ============================================================

export type ModelProvider = 'anthropic' | 'openai' | 'openrouter'

export interface ModelConfig {
  provider: ModelProvider
  modelId: string
  apiKey: string
  baseUrl?: string
  maxTokens?: number
}

export interface ModelResponse {
  content: ContentBlock[]
  model: string
  inputTokens: number
  outputTokens: number
  stopReason: string
}

// ============================================================
// JOBS (CODING PIPELINE)
// ============================================================

export type JobStatus =
  | 'queued'
  | 'cloning'
  | 'branching'
  | 'container_starting'
  | 'coding'
  | 'testing'
  | 'pr_creating'
  | 'completed'
  | 'failed'

export interface Job {
  id: JobId
  title: string
  description: string
  status: JobStatus
  repoUrl: string
  branch: string
  baseBranch: string
  containerName?: string
  prUrl?: string
  prNumber?: number
  agentModel: string
  totalCost: number
  totalToolCalls: number
  totalIterations: number
  error?: string
  createdAt: string
  updatedAt: string
  completedAt?: string
}

export interface JobLogEntry {
  id?: number
  jobId: JobId
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  data?: unknown
  createdAt: string
}

// ============================================================
// MEMORY
// ============================================================

export type MemoryType =
  | 'fact'
  | 'preference'
  | 'skill_result'
  | 'conversation'
  | 'error_pattern'

export interface Memory {
  id: MemoryId
  type: MemoryType
  content: string
  tags: string[]
  source: string
  confidence: number
  accessCount: number
  lastAccessedAt?: string
  createdAt: string
  updatedAt: string
}

// ============================================================
// SKILLS
// ============================================================

export type SkillSource = 'builtin' | 'learned' | 'community'

export interface SkillExample {
  input: string
  expectedOutput: string
  wasSuccessful: boolean
}

export interface Skill {
  id: SkillId
  name: string
  description: string
  version: number
  systemPrompt: string
  tools: string[]
  examples: SkillExample[]
  successRate: number
  totalUses: number
  source: SkillSource
  createdAt: string
  updatedAt: string
}

// ============================================================
// COST TRACKING
// ============================================================

export interface CostEntry {
  model: string
  inputTokens: number
  outputTokens: number
  inputCostUsd: number
  outputCostUsd: number
  totalCostUsd: number
  timestamp: string
  jobId?: JobId
  conversationId?: ConversationId
}

export interface CostSummary {
  totalUsd: number
  byModel: Record<string, number>
  byDay: Record<string, number>
  tokenCount: { input: number; output: number }
}

// ============================================================
// CONVERSATION
// ============================================================

export interface Conversation {
  id: ConversationId
  title?: string
  createdAt: string
  updatedAt: string
}

export interface StoredMessage {
  id: string
  conversationId: ConversationId
  role: 'user' | 'assistant' | 'system'
  content: string
  model?: string
  inputTokens?: number
  outputTokens?: number
  createdAt: string
}
