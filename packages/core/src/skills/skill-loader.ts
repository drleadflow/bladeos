import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import yaml from 'js-yaml'
import type { Skill } from '../types.js'

interface SkillYaml {
  name: string
  description: string
  version: number
  system_prompt: string
  tools: string[]
}

function parseSkillYaml(filePath: string): Skill | undefined {
  try {
    const raw = readFileSync(filePath, 'utf-8')
    const parsed = yaml.load(raw) as SkillYaml

    if (!parsed.name || !parsed.description || !parsed.system_prompt) {
      return undefined
    }

    const now = new Date().toISOString()

    return {
      id: parsed.name,
      name: parsed.name,
      description: parsed.description,
      version: parsed.version ?? 1,
      systemPrompt: parsed.system_prompt,
      tools: parsed.tools ?? [],
      examples: [],
      successRate: 0,
      totalUses: 0,
      source: 'builtin',
      createdAt: now,
      updatedAt: now,
    }
  } catch {
    return undefined
  }
}

export function loadSkillsFromDir(dir: string): Skill[] {
  const skills: Skill[] = []

  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return skills
  }

  for (const entry of entries) {
    const entryPath = join(dir, entry)

    try {
      const stat = statSync(entryPath)

      if (stat.isDirectory()) {
        // Look for skill.yaml inside the directory
        const yamlPath = join(entryPath, 'skill.yaml')
        try {
          statSync(yamlPath)
          const skill = parseSkillYaml(yamlPath)
          if (skill) {
            skills.push(skill)
          }
        } catch {
          // No skill.yaml in this directory, skip
        }
      } else if (entry.endsWith('.yaml') || entry.endsWith('.yml')) {
        const skill = parseSkillYaml(entryPath)
        if (skill) {
          skills.push(skill)
        }
      }
    } catch {
      // Skip entries we can't stat
    }
  }

  return skills
}

export function getSkillByName(name: string, skills: Skill[]): Skill | undefined {
  return skills.find((s) => s.name === name)
}
