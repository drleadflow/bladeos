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

export interface EmployeeDefinition {
  id: string
  name: string
  title: string
  icon: string
  pillar: Pillar
  description: string
  systemPrompt: { coach: string; operator: string }
  tools: string[]
  onboarding: OnboardingQuestion[]
  scorecardMetrics: ScorecardMetric[]
  proactiveBehaviors: ProactiveBehavior[]
  suggestedActions: string[]
  toolIntegrations: { question: string; tool: string; envKey: string }[]
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
