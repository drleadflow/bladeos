/**
 * Skill Resolver — Bridges the skill system into the conversation engine.
 *
 * Given a user message and optional employee ID, selects the best matching
 * skill and returns its system prompt for injection into the conversation.
 *
 * Priority order:
 * 1. Employee-assigned skills (from skill packs via employee_skills table)
 * 2. Global skills (from /skills/ directory)
 */

import {
  selectSkill,
  getSkillPrompt,
  getSkillByName,
  loadSkillsFromDir,
  getEmployeeSkillPrompts,
} from '@blade/core'
import type { Skill } from '@blade/core'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { logger } from '@blade/shared'

let cachedGlobalSkills: Skill[] = []
let globalSkillsLoaded = false
let globalSkillsDir: string | undefined

function resolveSkillsDir(): string | undefined {
  if (globalSkillsDir) return globalSkillsDir

  const __dirname = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(__dirname, '..', '..', '..', 'skills'),           // from packages/conversation/dist/
    join(__dirname, '..', '..', '..', '..', 'skills'),     // from packages/conversation/src/
    join(process.cwd(), 'skills'),                          // from project root CWD
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      globalSkillsDir = candidate
      return candidate
    }
  }

  return undefined
}

function getGlobalSkills(): Skill[] {
  if (globalSkillsLoaded) return cachedGlobalSkills

  const dir = resolveSkillsDir()
  if (!dir) {
    globalSkillsLoaded = true
    return []
  }

  try {
    cachedGlobalSkills = loadSkillsFromDir(dir)
  } catch {
    logger.warn('SkillResolver', 'Failed to load global skills')
  }
  globalSkillsLoaded = true
  return cachedGlobalSkills
}

/**
 * Create a resolveSkillPrompt callback for the conversation engine.
 *
 * Usage:
 * ```ts
 * const engine = createConversationEngine(executionApi, {
 *   resolveSkillPrompt: createSkillResolver(),
 * })
 * ```
 */
export function createSkillResolver(): (message: string, employeeId?: string) => string | undefined {
  return (message: string, employeeId?: string): string | undefined => {
    const allSkills = getGlobalSkills()
    const skillsDir = resolveSkillsDir()

    // 1. Check employee-assigned skills first
    if (employeeId) {
      try {
        const assignedSkillNames = getEmployeeSkillPrompts(employeeId)
        if (assignedSkillNames.length > 0) {
          // Build skill objects for the selector from global + pack skills
          const assignedSkills = assignedSkillNames
            .map((name) => getSkillByName(name, allSkills))
            .filter((s): s is Skill => s !== undefined)

          if (assignedSkills.length > 0) {
            const match = selectSkill(message, assignedSkills)
            if (match && skillsDir) {
              const prompt = getSkillPrompt(match.name, skillsDir)
              if (prompt) return prompt
            }
          }
        }
      } catch {
        // DB might not have the employee_skills table yet — fall through to global
      }
    }

    // 2. Fall back to global skill matching
    if (allSkills.length > 0 && skillsDir) {
      const match = selectSkill(message, allSkills)
      if (match) {
        const prompt = getSkillPrompt(match.name, skillsDir)
        if (prompt) return prompt
      }
    }

    return undefined
  }
}
