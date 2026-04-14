import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'
import { employees, kpiDefinitions, routines } from '@blade/db'
import { registerEmployee } from './registry.js'
import type {
  EmployeeDefinition,
  OnboardingQuestion,
  ScorecardMetric,
  ProactiveBehavior,
  ToolIntegration,
  Framework,
  KpiDefinition,
  RoutineDefinition,
  EscalationPolicy,
  HandoffRule,
  Pillar,
} from './types.js'

// ── Raw YAML shape (snake_case) ─────────────────────────────────

interface RawYamlOnboarding {
  readonly id: string
  readonly question: string
  readonly type: 'text' | 'select' | 'multiselect'
  readonly options?: string[]
  readonly memory_type: 'fact' | 'preference'
  readonly memory_tags: string[]
}

interface RawYamlScorecard {
  readonly id: string
  readonly name: string
  readonly target: number
  readonly unit: string
  readonly direction: string
}

interface RawYamlProactive {
  readonly id: string
  readonly description: string
  readonly trigger: 'cron' | 'threshold' | 'event'
  readonly schedule?: string
  readonly condition?: string
  readonly action: string
  readonly cooldown_hours: number
}

interface RawYamlToolIntegration {
  readonly question: string
  readonly tool: string
  readonly env_key: string
}

interface RawYamlKpi {
  readonly id: string
  readonly name: string
  readonly target: number
  readonly unit: string
  readonly frequency: string
  readonly direction: string
  readonly thresholds: { readonly green: number; readonly yellow: number; readonly red: number }
}

interface RawYamlRoutine {
  readonly id: string
  readonly name: string
  readonly schedule: string
  readonly task: string
  readonly tools: readonly string[]
  readonly timeout: number
}

interface RawYamlFramework {
  readonly name: string
  readonly purpose: string
  readonly moves: readonly string[]
}

interface RawYamlHandoffRule {
  readonly condition: string
  readonly target: string
  readonly priority: string
}

interface RawYamlEscalationCondition {
  readonly trigger: string
  readonly action: string
}

interface RawYamlEscalationPolicy {
  readonly escalate_to: string
  readonly conditions: readonly RawYamlEscalationCondition[]
}

interface RawYamlEmployee {
  readonly id: string
  readonly name: string
  readonly title: string
  readonly department: string
  readonly icon: string
  readonly pillar?: string
  readonly objective: string
  readonly system_prompt?: {
    readonly coach?: string
    readonly operator?: string
  }
  readonly personality: {
    readonly archetype: string
    readonly tone: string
  }
  readonly model_preference: string
  readonly max_budget_per_run: number
  readonly allowed_tools: readonly string[]
  readonly onboarding_questions?: readonly RawYamlOnboarding[]
  readonly scorecard_metrics?: readonly RawYamlScorecard[]
  readonly proactive_behaviors?: readonly RawYamlProactive[]
  readonly suggested_actions?: readonly string[]
  readonly tool_integrations?: readonly RawYamlToolIntegration[]
  readonly skill_assignments?: readonly string[]
  readonly escalation_policy: RawYamlEscalationPolicy
  readonly handoff_rules: readonly RawYamlHandoffRule[]
  readonly manager: string | null
  readonly memory_scope: string
  readonly frameworks?: readonly RawYamlFramework[]
  readonly kpis: readonly RawYamlKpi[]
  readonly routines: readonly RawYamlRoutine[]
}

// ── Conversion helpers ──────────────────────────────────────────

function toOnboarding(raw?: readonly RawYamlOnboarding[]): OnboardingQuestion[] {
  if (!raw?.length) return []
  return raw.map((q) => ({
    id: q.id,
    question: q.question,
    type: q.type,
    options: q.options,
    memoryType: q.memory_type,
    memoryTags: [...q.memory_tags],
  }))
}

function toScorecardMetrics(raw?: readonly RawYamlScorecard[]): ScorecardMetric[] {
  if (!raw?.length) return []
  return raw.map((m) => ({
    id: m.id,
    name: m.name,
    target: m.target,
    unit: m.unit,
    direction: m.direction as 'higher' | 'lower',
  }))
}

function toProactiveBehaviors(raw?: readonly RawYamlProactive[]): ProactiveBehavior[] {
  if (!raw?.length) return []
  return raw.map((b) => ({
    id: b.id,
    description: b.description,
    trigger: b.trigger,
    schedule: b.schedule,
    condition: b.condition,
    action: b.action,
    cooldownHours: b.cooldown_hours,
  }))
}

function toToolIntegrations(raw?: readonly RawYamlToolIntegration[]): ToolIntegration[] {
  if (!raw?.length) return []
  return raw.map((t) => ({
    question: t.question,
    tool: t.tool,
    envKey: t.env_key,
  }))
}

function toFrameworks(raw?: readonly RawYamlFramework[]): Framework[] {
  if (!raw?.length) return []
  return raw.map((f) => ({
    name: f.name,
    purpose: f.purpose,
    moves: [...f.moves],
  }))
}

function toKpis(raw?: readonly RawYamlKpi[]): KpiDefinition[] {
  if (!raw?.length) return []
  return raw.map((k) => ({
    id: k.id,
    name: k.name,
    target: k.target,
    unit: k.unit,
    frequency: k.frequency,
    direction: k.direction,
    thresholds: { ...k.thresholds },
  }))
}

function toRoutines(raw?: readonly RawYamlRoutine[]): RoutineDefinition[] {
  if (!raw?.length) return []
  return raw.map((r) => ({
    id: r.id,
    name: r.name,
    schedule: r.schedule,
    task: r.task,
    tools: [...r.tools],
    timeout: r.timeout,
  }))
}

function toEscalationPolicy(raw: RawYamlEscalationPolicy): EscalationPolicy {
  return {
    escalateTo: raw.escalate_to,
    conditions: raw.conditions.map((c) => ({ trigger: c.trigger, action: c.action })),
  }
}

function toHandoffRules(raw: readonly RawYamlHandoffRule[]): HandoffRule[] {
  return raw.map((r) => ({
    condition: r.condition,
    target: r.target,
    priority: r.priority,
  }))
}

// ── Cache ───────────────────────────────────────────────────────

const definitionCache = new Map<string, EmployeeDefinition>()

function parseYamlFile(filePath: string): RawYamlEmployee {
  const content = readFileSync(filePath, 'utf-8')
  const parsed = yaml.load(content)
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Invalid YAML in ${filePath}: expected an object`)
  }
  const raw = parsed as RawYamlEmployee
  if (!raw.id || !raw.name || !raw.title) {
    throw new Error(`Invalid employee definition in ${filePath}: missing id, name, or title`)
  }
  if (!raw.escalation_policy || !raw.personality) {
    throw new Error(`Invalid employee definition in ${filePath}: missing escalation_policy or personality`)
  }
  return raw
}

function rawToDefinition(raw: RawYamlEmployee): EmployeeDefinition {
  return {
    id: raw.id,
    name: raw.name,
    title: raw.title,
    icon: raw.icon,
    pillar: (raw.pillar ?? 'business') as Pillar,
    department: raw.department,
    description: raw.objective,
    objective: raw.objective,
    systemPrompt: {
      coach: raw.system_prompt?.coach ?? '',
      operator: raw.system_prompt?.operator ?? '',
    },
    personality: { archetype: raw.personality.archetype, tone: raw.personality.tone },
    modelPreference: raw.model_preference,
    maxBudgetPerRun: raw.max_budget_per_run,
    tools: [...raw.allowed_tools],
    onboarding: toOnboarding(raw.onboarding_questions),
    scorecardMetrics: toScorecardMetrics(raw.scorecard_metrics),
    proactiveBehaviors: toProactiveBehaviors(raw.proactive_behaviors),
    suggestedActions: [...(raw.suggested_actions ?? [])],
    toolIntegrations: toToolIntegrations(raw.tool_integrations),
    skillAssignments: [...(raw.skill_assignments ?? [])],
    escalationPolicy: toEscalationPolicy(raw.escalation_policy),
    handoffRules: toHandoffRules(raw.handoff_rules),
    manager: raw.manager,
    memoryScope: raw.memory_scope,
    frameworks: toFrameworks(raw.frameworks),
    kpis: toKpis(raw.kpis),
    routines: toRoutines(raw.routines),
  }
}

// ── Public API ──────────────────────────────────────────────────

function formatFrameworkSummary(frameworks: readonly Framework[]): string {
  if (frameworks.length === 0) return ''

  return frameworks
    .slice(0, 3)
    .map((framework) => {
      const moveList = framework.moves.slice(0, 2).join(', ')
      return `${framework.name} (${framework.purpose}${moveList ? `; moves: ${moveList}` : ''})`
    })
    .join(' | ')
}

function buildObjective(def: EmployeeDefinition): string {
  const summary = formatFrameworkSummary(def.frameworks)
  if (!summary) return def.objective

  return `${def.objective} Operating playbooks: ${summary}.`
}

export function loadEmployeeDefinitions(dirPath: string): void {
  const files = readdirSync(dirPath).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))

  for (const file of files) {
    const filePath = join(dirPath, file)
    const raw = parseYamlFile(filePath)
    const def = rawToDefinition(raw)
    definitionCache.set(def.id, def)

    // Register in the in-memory registry so getEmployee/getAllEmployees work
    registerEmployee(def)

    // Upsert the employee into the database
    employees.upsert({
      slug: def.id,
      name: def.name,
      title: def.title,
      pillar: def.pillar,
      description: def.description,
      icon: def.icon,
      active: false,
      archetype: def.personality.archetype,
      department: def.department,
      objective: buildObjective(def),
      managerId: def.manager ?? undefined,
      allowedToolsJson: def.tools,
      modelPreference: def.modelPreference,
      maxBudgetPerRun: def.maxBudgetPerRun,
      escalationPolicyJson: def.escalationPolicy,
      handoffRulesJson: def.handoffRules,
      memoryScope: def.memoryScope,
    })

    // Use slug as employeeId for consistency
    const employeeId = def.id

    // Load existing KPIs for idempotency check
    const existingKpis = kpiDefinitions.listByEmployee(employeeId)
    const existingKpiNames = new Set(existingKpis.map(k => k.name))

    for (const kpi of def.kpis) {
      if (existingKpiNames.has(kpi.name)) {
        continue
      }
      kpiDefinitions.create({
        employeeId,
        name: kpi.name,
        description: `${kpi.name} — target: ${kpi.target}${kpi.unit}`,
        source: { type: 'yaml', definitionId: def.id, kpiId: kpi.id },
        target: kpi.target,
        unit: kpi.unit,
        frequency: kpi.frequency,
        direction: kpi.direction,
        thresholds: kpi.thresholds,
      })
    }

    // Load existing routines for idempotency check
    const existingRoutines = routines.listByEmployee(employeeId)
    const existingRoutineNames = new Set(existingRoutines.map(r => r.name))

    for (const routine of def.routines) {
      if (existingRoutineNames.has(routine.name)) {
        continue
      }
      routines.create({
        employeeId,
        name: routine.name,
        description: `Routine: ${routine.name} for ${def.name}`,
        schedule: routine.schedule,
        task: routine.task,
        tools: routine.tools,
        timeoutSeconds: routine.timeout,
      })
    }
  }
}

export function getEmployeeDefinition(slug: string): EmployeeDefinition | undefined {
  return definitionCache.get(slug)
}

export function getAllEmployeeDefinitions(): ReadonlyMap<string, EmployeeDefinition> {
  return definitionCache
}

export function clearDefinitionCache(): void {
  definitionCache.clear()
}

// Re-export YAML-specific types for backward compatibility
export type { RawYamlKpi as YamlKpi }
export type { RawYamlRoutine as YamlRoutine }
export type { RawYamlFramework as YamlFramework }
export type { RawYamlHandoffRule as YamlHandoffRule }
export type { RawYamlEscalationCondition as YamlEscalationCondition }
export type { RawYamlEscalationPolicy as YamlEscalationPolicy }
export type { RawYamlEmployee as YamlEmployeeDefinition }
