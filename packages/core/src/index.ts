// Load built-in tools and workflows on import
import './tools/index.js'
import './orchestration/builtin-workflows.js'

// Core exports
export { runAgentLoop } from './agent-loop.js'
export { manageContext, estimateTokens, estimateMessageTokens, getContextLimit } from './context-manager.js'
export { requiresApproval, requestApproval, waitForApproval } from './approval-checker.js'
export { runConversationReply, extractBestResponseText } from './chat/reply.js'
export { registerTool, getTool, getAllToolDefinitions, getToolsByCategory, executeTool, clearRegistry, createToolScope, createFilteredScope, registerScopedTool, getScopedToolDefinitions, destroyToolScope } from './tool-registry.js'
export { callModel, streamModel, resolveModelConfig, resolveSmartModelConfig } from './model-provider.js'
export type { TaskComplexity } from './model-provider.js'
export { analyzeComplexity } from './routing/complexity-analyzer.js'
export type { ExtendedComplexity } from './routing/complexity-analyzer.js'
export { autoRouteModel, recordModelFailure, recordModelSuccess, getConfigKey } from './routing/cost-router.js'
export type { CostRouterResult } from './routing/cost-router.js'
export { calculateCost, formatCost, isWithinBudget } from './cost-tracker.js'

// Pipeline
export { runCodingPipeline } from './pipeline/index.js'

// Learning & Memory
export { extractLearnings, extractJobLearnings, buildMemoryAugmentedPrompt } from './learning/index.js'
export { processPRFeedback, checkPendingPRFeedback } from './learning/pr-feedback.js'
export { retrieveRelevant, retrieveRelevantAsync } from './memory/retriever.js'
export type { RankedMemory } from './memory/retriever.js'
export { generateEmbedding, cosineSimilarity } from './memory/embedder.js'
export { loadVectorIndex, searchSimilar, addToIndex, removeFromIndex, getIndexSize } from './memory/vector-store.js'
export { retrieveHybrid } from './memory/hybrid-retriever.js'
export { processMemoryFeedback } from './memory/feedback-loop.js'
export { startDecayScheduler, stopDecayScheduler, runDecayCycle } from './memory/decay-scheduler.js'
export type { DecayCycleResult } from './memory/decay-scheduler.js'
export { classifyImportance, classifyAndUpdate } from './memory/importance-classifier.js'
export type { ImportanceLevel } from './memory/importance-classifier.js'
export { startConsolidationScheduler, stopConsolidationScheduler, runConsolidation } from './memory/consolidation-engine.js'
export type { ConsolidationResult } from './memory/consolidation-engine.js'
export { retrieveScoped } from './memory/scoped-retriever.js'
export { autoAssignMission } from './missions/mission-router.js'
export { classifyTask } from './routing/task-classifier.js'
export type { TaskType } from './routing/task-classifier.js'
export { selectEmployee, updateQValue, processOutcome } from './routing/q-router.js'
export { onMissionComplete } from './routing/reward-hook.js'

// Reasoning Bank
export { storePattern, findSimilarPatterns, buildPatternContext, recordPatternOutcome } from './reasoning/index.js'
export type { PatternMatch } from './reasoning/index.js'

// Integrations
export { startTelegramBot } from './integrations/index.js'

// Skills
export { generateSkillFromJob } from './skills/skill-generator.js'
export { selectSkill } from './skills/skill-selector.js'
export { loadSkillsFromDir, loadFullSkill, getSkillPrompt, getSkillByName } from './skills/skill-loader.js'
export { installSkillPack, loadSkillPack, listAvailablePacks, getEmployeeSkillPrompts } from './skills/skill-pack-loader.js'
export { detectFeedback, saveFeedbackAsMemory } from './skills/feedback-detector.js'
export type { FeedbackSignal } from './skills/feedback-detector.js'

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
  runProactiveBehavior, scheduleEmployeeBehaviors, stopEmployeeBehaviors,
  logEmployeeActivity, getTeamActivity,
} from './employees/index.js'
export {
  loadEmployeeDefinitions, getEmployeeDefinition, getAllEmployeeDefinitions, clearDefinitionCache,
} from './employees/yaml-loader.js'
export type {
  Archetype, Pillar, OnboardingQuestion, ScorecardMetric, ProactiveBehavior,
  ToolIntegration, Framework, KpiDefinition, RoutineDefinition, EscalationPolicy, HandoffRule,
  EmployeeDefinition, ActiveEmployee, ScorecardEntry, Notification, HandoffRequest,
  LogActivityParams,
} from './employees/index.js'

// Onboarding
export {
  createSession,
  advanceState,
  getQuestionPrompt,
  executeInstall,
  executeInstantSetup,
  getSuggestedPrompts,
  isSkipSignal,
  getCoreEmployeeIds,
  getAvailableVerticals,
  detectVertical,
} from './onboarding/onboarding-service.js'
export type { OnboardingSession, OnboardingState } from './onboarding/onboarding-service.js'

// Webhooks
export {
  loadTriggersFromFile, getTriggerByPath, getAllTriggers, handleWebhookTrigger,
} from './webhooks/index.js'
export type { WebhookTrigger, WebhookResult } from './webhooks/index.js'

// Security
export { getSanitizedEnv } from './security/index.js'
export { detectInjection, getInjectionPatternCount } from './security/index.js'
export type { InjectionCheckResult } from './security/index.js'
export { scanForSecrets, getSecretPatternCount } from './security/index.js'
export type { ExfiltrationCheckResult } from './security/index.js'

// Voice
export { createVoiceRoom, generateParticipantToken } from './voice/index.js'
export type { VoiceConfig, VoiceRoomResult } from './voice/index.js'
export { textToSpeech } from './voice/index.js'
export type { TextToSpeechOptions } from './voice/index.js'
export { speechToText } from './voice/index.js'
export type { SpeechToTextOptions } from './voice/index.js'
export { elevenLabsTTS } from './voice/index.js'
export { synthesizeSpeech, AGENT_VOICES } from './voice/index.js'
export type { AgentVoiceConfig } from './voice/index.js'
export {
  createWarRoomSession, getWarRoomSession, setActiveAgent,
  getSessionTranscript, processVoiceTurn, destroyWarRoomSession,
} from './voice/index.js'
export type { WarRoomTurn, WarRoomSession } from './voice/index.js'

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

// Monitors
export { setupBuiltinMonitors } from './monitors/index.js'
export { startMonitorScheduler, runMonitorsNow, stopMonitorScheduler } from './monitors/index.js'
export type { MonitorDefinition, MonitorCheckResult } from './monitors/index.js'
export { measureAllKpis, registerMeasurement } from './monitors/index.js'

// Routines
export { RoutineScheduler } from './routines/index.js'

// Execution API (v2 boundary)
export { createExecutionAPI } from './execution-api.js'
export type { ExecutionAPI, AgentStreamEvent, ModelStreamEvent } from './execution-api.js'

// Event Channel utility
export { createEventChannel } from './utils/event-channel.js'
export type { EventChannel } from './utils/event-channel.js'

// Job Queue
export { JobQueue, getJobQueue } from './queue/job-queue.js'
export type { QueuedJob, QueueJobStatus, JobQueueOptions } from './queue/job-queue.js'

// Autopilot
export { startBatch, stopBatch, cancelBatch, getActiveBatchIds, getBatchProgress, isBatchComplete, checkForStalledJobs } from './autopilot/index.js'
export type { BatchRunnerOptions, BatchProgress, StallCheckResult } from './autopilot/index.js'

// Plugins
export {
  installPlugin, uninstallPlugin, enablePlugin, disablePlugin, listPlugins, getPluginInfo,
  loadPlugin, unloadPlugin, loadAllPlugins, getLoadedPlugins, isPluginLoaded,
  fireBeforeToolCall, fireAfterToolCall, fireBeforeModelCall, fireAfterModelCall,
  fireOnMemorySave, fireOnMissionAssigned, getRegisteredHookCount,
} from './plugins/index.js'
export type {
  BladePlugin, BladeHookPlugin, BladeToolPlugin, BladeProviderPlugin, BladeWorkerPlugin,
  AnyPlugin, PluginContext, PluginToolRegistration, PluginInfo,
} from './plugins/index.js'

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
  ChannelType, ConversationRequest, ConversationEvent, ConversationState,
  CodingPipelineOptions, CodingPipelineResult,
} from './types.js'
