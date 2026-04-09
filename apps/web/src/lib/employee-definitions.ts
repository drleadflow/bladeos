import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadEmployeeDefinitions } from '@blade/core'

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
