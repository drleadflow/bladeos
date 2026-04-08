// Load built-in tools on import
import './tools/builtin.js'

// Core exports
export { runAgentLoop } from './agent-loop.js'
export { registerTool, getTool, getAllToolDefinitions, getToolsByCategory, executeTool, clearRegistry } from './tool-registry.js'
export { callModel, streamModel, resolveModelConfig } from './model-provider.js'
export { calculateCost, formatCost, isWithinBudget } from './cost-tracker.js'

// Types
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
} from './types.js'
