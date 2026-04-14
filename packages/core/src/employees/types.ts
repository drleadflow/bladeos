export type Archetype = 'coach' | 'operator'
export type Pillar = 'business' | 'health' | 'wealth' | 'relationships' | 'spirituality'

export interface OnboardingQuestion {
  id: string
  question: string
  type: 'text' | 'select' | 'multiselect'
  options?: string[]
  memoryType: 'fact' | 'preference'
  memoryTags: string[]
}

export interface ScorecardMetric {
  id: string
  name: string
  target: number
  unit: string
  direction: 'higher' | 'lower'
}

export interface ProactiveBehavior {
  id: string
  description: string
  trigger: 'cron' | 'threshold' | 'event'
  schedule?: string
  condition?: string
  action: string
  cooldownHours: number
}

export interface ToolIntegration {
  question: string
  tool: string
  envKey: string
}

export interface Framework {
  name: string
  purpose: string
  moves: string[]
}

export interface KpiDefinition {
  id: string
  name: string
  target: number
  unit: string
  frequency: string
  direction: string
  thresholds: { green: number; yellow: number; red: number }
}

export interface RoutineDefinition {
  id: string
  name: string
  schedule: string
  task: string
  tools: string[]
  timeout: number
}

export interface EscalationPolicy {
  escalateTo: string
  conditions: { trigger: string; action: string }[]
}

export interface HandoffRule {
  condition: string
  target: string
  priority: string
}

/**
 * Unified employee definition — single source of truth from YAML files.
 * Combines the former TS builtin fields (systemPrompt, onboarding, scorecard)
 * with YAML operational fields (KPIs, routines, frameworks, escalation).
 */
export interface EmployeeDefinition {
  id: string
  name: string
  title: string
  icon: string
  pillar: Pillar
  department: string
  description: string
  objective: string
  systemPrompt: { coach: string; operator: string }
  personality: { archetype: string; tone: string }
  modelPreference: string
  maxBudgetPerRun: number
  tools: string[]
  onboarding: OnboardingQuestion[]
  scorecardMetrics: ScorecardMetric[]
  proactiveBehaviors: ProactiveBehavior[]
  suggestedActions: string[]
  toolIntegrations: ToolIntegration[]
  skillAssignments: string[]
  escalationPolicy: EscalationPolicy
  handoffRules: HandoffRule[]
  manager: string | null
  memoryScope: string
  frameworks: Framework[]
  kpis: KpiDefinition[]
  routines: RoutineDefinition[]
}

export interface ActiveEmployee {
  employeeId: string
  activatedAt: string
  archetype: Archetype
  onboardingComplete: boolean
}

export interface ScorecardEntry {
  id: string
  employeeId: string
  metricId: string
  value: number
  status: 'green' | 'yellow' | 'red'
  recordedAt: string
}

export interface Notification {
  id: string
  employeeId: string
  title: string
  body: string
  read: boolean
  createdAt: string
}
