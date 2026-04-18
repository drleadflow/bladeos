// Types
export type {
  Archetype,
  Pillar,
  OnboardingQuestion,
  ScorecardMetric,
  ProactiveBehavior,
  ToolIntegration,
  Framework,
  KpiDefinition,
  RoutineDefinition,
  EscalationPolicy,
  HandoffRule,
  EmployeeDefinition,
  ActiveEmployee,
  ScorecardEntry,
  Notification,
} from './types.js'

// Registry
export {
  registerEmployee,
  getEmployee,
  getAllEmployees,
  getEmployeesByPillar,
  activateEmployee,
  deactivateEmployee,
  getActiveEmployees,
  getActiveArchetype,
  setArchetype,
} from './registry.js'

// Briefing
export { generateMorningBriefing } from './briefing.js'

// Scorecard
export {
  recordMetric,
  getScorecard,
  getScorecardStatus,
  formatScorecard,
} from './scorecard.js'

// Self-Improvement
export {
  addToImprovementQueue,
  processImprovementQueue,
  detectToolMention,
} from './self-improve.js'

// Psychology
export {
  detectBuyerArchetype,
  detectMotivation,
  detectEmotionalState,
  getClarityCompass,
  getValueEquation,
} from './psychology.js'

// Collaboration
export {
  requestHandoff,
  getHandoffsForEmployee,
  acceptHandoff,
  completeHandoff,
  buildCollaborationContext,
  clearHandoffs,
} from './collaboration.js'
export type { HandoffRequest } from './collaboration.js'

// Proactive Behaviors
export {
  runProactiveBehavior,
  scheduleEmployeeBehaviors,
  stopEmployeeBehaviors,
} from './proactive.js'

// Activity Logger (Hive Mind)
export { logEmployeeActivity, getTeamActivity } from './activity-logger.js'
export type { LogActivityParams } from './activity-logger.js'
