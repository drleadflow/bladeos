import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { getEmployeeDefinition, loadEmployeeDefinitions } from '@blade/core'

export interface EmployeeFramework {
  name: string
  purpose: string
  moves: string[]
}

let definitionsLoaded = false

function resolveDefinitionsDir(): string {
  const candidates = [
    resolve(process.cwd(), 'packages/core/src/employees/definitions'),
    resolve(process.cwd(), '../../packages/core/src/employees/definitions'),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error('Employee definitions directory not found')
}

export function ensureEmployeeDefinitionsLoaded(): void {
  if (definitionsLoaded) return

  loadEmployeeDefinitions(resolveDefinitionsDir())
  definitionsLoaded = true
}

export function getEmployeeFrameworks(slug: string): EmployeeFramework[] {
  ensureEmployeeDefinitionsLoaded()
  const definition = getEmployeeDefinition(slug) as { frameworks?: EmployeeFramework[] } | undefined
  return definition?.frameworks ?? []
}

export function formatEmployeePlaybookSummary(slug: string): string {
  ensureEmployeeDefinitionsLoaded()
  const frameworks = getEmployeeFrameworks(slug)
  if (frameworks.length === 0) return ''

  return frameworks
    .slice(0, 3)
    .map((framework) => {
      const moveList = framework.moves.slice(0, 2).join(', ')
      return `${framework.name}: ${framework.purpose}${moveList ? ` (${moveList})` : ''}`
    })
    .join(' | ')
}
