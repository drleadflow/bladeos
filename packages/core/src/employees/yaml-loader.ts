import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'
import { employees, kpiDefinitions, routines } from '@blade/db'

export interface YamlKpi {
  readonly id: string
  readonly name: string
  readonly target: number
  readonly unit: string
  readonly frequency: string
  readonly direction: string
  readonly thresholds: { readonly green: number; readonly yellow: number; readonly red: number }
}

export interface YamlRoutine {
  readonly id: string
  readonly name: string
  readonly schedule: string
  readonly task: string
  readonly tools: readonly string[]
  readonly timeout: number
}

export interface YamlHandoffRule {
  readonly condition: string
  readonly target: string
  readonly priority: string
}

export interface YamlEscalationCondition {
  readonly trigger: string
  readonly action: string
}

export interface YamlEscalationPolicy {
  readonly escalate_to: string
  readonly conditions: readonly YamlEscalationCondition[]
}

export interface YamlEmployeeDefinition {
  readonly id: string
  readonly name: string
  readonly title: string
  readonly department: string
  readonly icon: string
  readonly objective: string
  readonly personality: {
    readonly archetype: string
    readonly tone: string
  }
  readonly model_preference: string
  readonly max_budget_per_run: number
  readonly allowed_tools: readonly string[]
  readonly escalation_policy: YamlEscalationPolicy
  readonly handoff_rules: readonly YamlHandoffRule[]
  readonly manager: string | null
  readonly memory_scope: string
  readonly kpis: readonly YamlKpi[]
  readonly routines: readonly YamlRoutine[]
}

const definitionCache = new Map<string, YamlEmployeeDefinition>()

function parseYamlFile(filePath: string): YamlEmployeeDefinition {
  const content = readFileSync(filePath, 'utf-8')
  return yaml.load(content) as YamlEmployeeDefinition
}

export function loadEmployeeDefinitions(dirPath: string): void {
  const files = readdirSync(dirPath).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))

  for (const file of files) {
    const filePath = join(dirPath, file)
    const def = parseYamlFile(filePath)
    definitionCache.set(def.id, def)

    // Upsert the employee into the database
    // Map department to pillar (legacy CHECK constraint requires business|health|wealth|relationships|spirituality)
    const result = employees.upsert({
      slug: def.id,
      name: def.name,
      title: def.title,
      pillar: 'business',
      description: def.objective,
      icon: def.icon,
      active: false,
      archetype: def.personality.archetype,
      department: def.department,
      objective: def.objective,
      managerId: def.manager ?? undefined,
      allowedToolsJson: [...def.allowed_tools],
      modelPreference: def.model_preference,
      maxBudgetPerRun: def.max_budget_per_run,
      escalationPolicyJson: def.escalation_policy,
      handoffRulesJson: [...def.handoff_rules],
      memoryScope: def.memory_scope,
    })

    // Use slug as employeeId for consistency — all queries use slug
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
        tools: [...routine.tools],
        timeoutSeconds: routine.timeout,
      })
    }
  }
}

export function getEmployeeDefinition(slug: string): YamlEmployeeDefinition | undefined {
  if (definitionCache.has(slug)) {
    return definitionCache.get(slug)
  }

  // Not in cache — caller may not have loaded definitions yet
  return undefined
}

export function getAllEmployeeDefinitions(): ReadonlyMap<string, YamlEmployeeDefinition> {
  return definitionCache
}

export function clearDefinitionCache(): void {
  definitionCache.clear()
}
