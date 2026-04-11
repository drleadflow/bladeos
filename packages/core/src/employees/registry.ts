import { activeEmployees } from '@blade/db'
import type { EmployeeDefinition, Pillar, Archetype, ActiveEmployee } from './types.js'

// Global singleton registry (survives module reloads)
const REGISTRY_KEY = '__blade_employee_registry__'
const _registry: Map<string, EmployeeDefinition> =
  (globalThis as Record<string, unknown>)[REGISTRY_KEY] as Map<string, EmployeeDefinition>
  ?? ((globalThis as Record<string, unknown>)[REGISTRY_KEY] = new Map<string, EmployeeDefinition>())

const ARCHETYPE_KEY = '__blade_active_archetype__'

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
  activeEmployees.activate(id, archetype)
}

export function deactivateEmployee(id: string): void {
  activeEmployees.deactivate(id)
}

export function getActiveEmployees(): ActiveEmployee[] {
  return activeEmployees.getActive() as ActiveEmployee[]
}

export function getActiveArchetype(): Archetype {
  return ((globalThis as Record<string, unknown>)[ARCHETYPE_KEY] as Archetype | undefined) ?? 'coach'
}

export function setArchetype(archetype: Archetype): void {
  (globalThis as Record<string, unknown>)[ARCHETYPE_KEY] = archetype
}
