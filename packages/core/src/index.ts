// Load built-in tools and workflows on import
import './tools/index.js'
import './orchestration/builtin-workflows.js'

// Core exports
export { runAgentLoop } from './agent-loop.js'
export { registerTool, getTool, getAllToolDefinitions, getToolsByCategory, executeTool, clearRegistry, createToolScope, registerScopedTool, getScopedToolDefinitions, destroyToolScope } from './tool-registry.js'
export { callModel, streamModel, resolveModelConfig, resolveSmartModelConfig } from './model-provider.js'
export type { TaskComplexity } from './model-provider.js'
export { calculateCost, formatCost, isWithinBudget } from './cost-tracker.js'

// Pipeline
export { runCodingPipeline } from './pipeline/index.js'

// Learning & Memory
export { extractLearnings, extractJobLearnings, buildMemoryAugmentedPrompt } from './learning/index.js'
export { retrieveRelevant } from './memory/retriever.js'
export type { RankedMemory } from './memory/retriever.js'

// Integrations
export { startTelegramBot } from './integrations/index.js'

// Skills
export { generateSkillFromJob } from './skills/skill-generator.js'
export { selectSkill } from './skills/skill-selector.js'
export { loadSkillsFromDir, loadFullSkill, getSkillPrompt, getSkillByName } from './skills/skill-loader.js'

// Cron
export { startScheduler, stopScheduler, loadCronsFromFile } from './cron/index.js'
export type { CronJob } from './cron/index.js'

// Personality
export { loadPersonality } from './personality.js'

// Employees
export {
  registerEmployee, getEmployee, getAllEmployees, getEmployeesByPillar,
  activateEmployee, deactivateEmployee, getActiveEmployees, getActiveArchetype, setArchetype,
  generateMorningBriefing,
  recordMetric, getScorecard, getScorecardStatus, formatScorecard,
  addToImprovementQueue, processImprovementQueue, detectToolMention,
  detectBuyerArchetype, detectMotivation, detectEmotionalState, getClarityCompass, getValueEquation,
  requestHandoff, getHandoffsForEmployee, acceptHandoff, completeHandoff, buildCollaborationContext, clearHandoffs,
} from './employees/index.js'
export type {
  Archetype, Pillar, OnboardingQuestion, ScorecardMetric, ProactiveBehavior,
  EmployeeDefinition, ActiveEmployee, ScorecardEntry, Notification, HandoffRequest,
} from './employees/index.js'

// Webhooks
export {
  loadTriggersFromFile, getTriggerByPath, getAllTriggers, handleWebhookTrigger,
} from './webhooks/index.js'
export type { WebhookTrigger, WebhookResult } from './webhooks/index.js'

// Security
export { getSanitizedEnv } from './security/index.js'

// Voice
export { createVoiceRoom, generateParticipantToken } from './voice/index.js'
export type { VoiceConfig, VoiceRoomResult } from './voice/index.js'

// RAG
export { ingestDocument, searchDocuments, listDocuments, deleteDocument } from './rag/index.js'
export type { Document, DocumentChunk } from './rag/index.js'

// Gamification
export {
  awardXP, getUserLevel, getStreaks, checkInStreak, createStreak, getRecentXP, XP_AWARDS,
  getAchievements, unlockAchievement, checkAchievements, ACHIEVEMENTS,
} from './gamification/index.js'
export type {
  XPEvent, UserLevel, Streak, Achievement,
  AchievementDefinition, UnlockedAchievement,
} from './gamification/index.js'

// Orchestration
export { defineWorkflow, runWorkflow, listWorkflows, getWorkflowRun } from './orchestration/index.js'
export type { Workflow, WorkflowStep, WorkflowRun, StepResult } from './orchestration/index.js'

// Evolution
export { runEvolutionCycle, optimizeEmployeePrompt, generateUsageReport } from './evolution/index.js'
export type { EvolutionEvent, UsageReport } from './evolution/index.js'

// Intelligence
export {
  generatePredictions, getAllPredictions, dismissPrediction, formatPredictions,
  detectEmotionalContext,
} from './intelligence/index.js'
export type { Prediction, EmotionalContext } from './intelligence/index.js'

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
