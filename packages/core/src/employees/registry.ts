import { getDb } from '@blade/db'
import type { EmployeeDefinition, Pillar, Archetype, ActiveEmployee } from './types.js'

// Global singleton registry (survives module reloads)
const REGISTRY_KEY = '__blade_employee_registry__'
const _registry: Map<string, EmployeeDefinition> =
  (globalThis as Record<string, unknown>)[REGISTRY_KEY] as Map<string, EmployeeDefinition>
  ?? ((globalThis as Record<string, unknown>)[REGISTRY_KEY] = new Map<string, EmployeeDefinition>())

const ARCHETYPE_KEY = '__blade_active_archetype__'

function db() {
  return getDb()
}

function now(): string {
  return new Date().toISOString()
}

export function registerEmployee(def: EmployeeDefinition): void {
  _registry.set(def.id, def)
}

export function getEmployee(id: string): EmployeeDefinition | undefined {
  return _registry.get(id)
}

export function getAllEmployees(): EmployeeDefinition[] {
  return [..._registry.values()]
}

export function getEmployeesByPillar(pillar: Pillar): EmployeeDefinition[] {
  return [..._registry.values()].filter(e => e.pillar === pillar)
}

export function activateEmployee(id: string, archetype: Archetype): void {
  const def = _registry.get(id)
  if (!def) {
    throw new Error(`Employee "${id}" not found in registry`)
  }

  const existing = db().prepare(
    'SELECT employee_id FROM active_employees WHERE employee_id = ?'
  ).get(id) as { employee_id: string } | undefined

  if (existing) {
    db().prepare(
      'UPDATE active_employees SET archetype = ?, activated_at = ? WHERE employee_id = ?'
    ).run(archetype, now(), id)
  } else {
    db().prepare(
      'INSERT INTO active_employees (employee_id, activated_at, archetype, onboarding_complete) VALUES (?, ?, ?, 0)'
    ).run(id, now(), archetype)
  }
}

export function deactivateEmployee(id: string): void {
  db().prepare('DELETE FROM active_employees WHERE employee_id = ?').run(id)
}

export function getActiveEmployees(): ActiveEmployee[] {
  const rows = db().prepare(
    `SELECT employee_id as employeeId, activated_at as activatedAt, archetype, onboarding_complete as onboardingComplete
     FROM active_employees ORDER BY activated_at ASC`
  ).all() as Array<{ employeeId: string; activatedAt: string; archetype: Archetype; onboardingComplete: number }>

  return rows.map(row => ({
    ...row,
    onboardingComplete: Boolean(row.onboardingComplete),
  }))
}

export function getActiveArchetype(): Archetype {
  return ((globalThis as Record<string, unknown>)[ARCHETYPE_KEY] as Archetype | undefined) ?? 'coach'
}

export function setArchetype(archetype: Archetype): void {
  (globalThis as Record<string, unknown>)[ARCHETYPE_KEY] = archetype
}
