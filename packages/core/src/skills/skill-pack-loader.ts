import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'
import { skillPacks, memories } from '@blade/db'
import { loadSkillsFromDir } from './skill-loader.js'

interface SkillPackManifest {
  name: string
  display_name: string
  version: number
  vertical: string
  description: string
  employee_skill_map: Record<string, string[]>
  seed_memories?: Array<{
    type: string
    content: string
    tags: string[]
    confidence: number
  }>
  sops?: Array<{
    file: string
    assigned_to: string[]
  }>
}

export function loadSkillPack(packDir: string): SkillPackManifest {
  const manifestPath = join(packDir, 'pack.yaml')
  const content = readFileSync(manifestPath, 'utf-8')
  const parsed = yaml.load(content)
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Invalid skill pack manifest in ${manifestPath}: expected an object`)
  }
  const manifest = parsed as SkillPackManifest
  if (!manifest.name || !manifest.version || !manifest.employee_skill_map) {
    throw new Error(`Invalid skill pack in ${manifestPath}: missing name, version, or employee_skill_map`)
  }
  return manifest
}

export function installSkillPack(packDir: string): { skillsInstalled: number; memoriesSeeded: number } {
  const manifest = loadSkillPack(packDir)

  // 1. Register the pack in DB
  skillPacks.installPack({
    name: manifest.name,
    displayName: manifest.display_name,
    version: manifest.version,
    vertical: manifest.vertical,
    description: manifest.description,
  })

  // 2. Load pack-specific skills if they exist
  const skillsDir = join(packDir, 'skills')
  let skillCount = 0
  if (existsSync(skillsDir)) {
    const loaded = loadSkillsFromDir(skillsDir)
    skillCount = loaded.length
  }

  // 3. Assign skills to employees
  for (const [employeeId, skillNames] of Object.entries(manifest.employee_skill_map)) {
    for (const skillName of skillNames) {
      skillPacks.assignSkillToEmployee(employeeId, skillName, 'pack', manifest.name)
    }
  }

  // 4. Seed memories
  let memoryCount = 0
  if (manifest.seed_memories?.length) {
    for (const mem of manifest.seed_memories) {
      memories.create({
        type: mem.type as 'fact' | 'preference',
        content: mem.content,
        tags: mem.tags,
        source: `skill-pack:${manifest.name}`,
        confidence: mem.confidence,
      })
      memoryCount++
    }
  }

  // 5. Load SOPs as memories
  if (manifest.sops?.length) {
    for (const sop of manifest.sops) {
      const sopPath = join(packDir, sop.file)
      if (existsSync(sopPath)) {
        const MAX_SOP_CHARS = 4000
        const sopContent = readFileSync(sopPath, 'utf-8').slice(0, MAX_SOP_CHARS)
        memories.create({
          type: 'fact',
          content: `SOP: ${sop.file}\n\n${sopContent}`,
          tags: ['sop', manifest.name, ...sop.assigned_to],
          source: `skill-pack:${manifest.name}`,
          confidence: 0.95,
        })
        memoryCount++
      }
    }
  }

  return {
    skillsInstalled: skillCount + Object.values(manifest.employee_skill_map).flat().length,
    memoriesSeeded: memoryCount,
  }
}

export function listAvailablePacks(packsDir: string): SkillPackManifest[] {
  if (!existsSync(packsDir)) return []
  const dirs = readdirSync(packsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())

  const packs: SkillPackManifest[] = []
  for (const dir of dirs) {
    const manifestPath = join(packsDir, dir.name, 'pack.yaml')
    if (existsSync(manifestPath)) {
      packs.push(loadSkillPack(join(packsDir, dir.name)))
    }
  }
  return packs
}

export function getEmployeeSkillPrompts(employeeId: string): string[] {
  const assignments = skillPacks.getEmployeeSkills(employeeId)
  return assignments.map(a => a.skillName)
}
