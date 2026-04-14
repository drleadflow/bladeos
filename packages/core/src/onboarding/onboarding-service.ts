import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { getEmployeeDefinition } from '../employees/yaml-loader.js'
import { installSkillPack, listAvailablePacks } from '../skills/skill-pack-loader.js'
import { memories, employees as employeesRepo } from '@blade/db'
import type { EmployeeDefinition } from '../employees/types.js'

export type OnboardingState = 'q1_business' | 'q2_challenge' | 'q3_numbers' | 'installing' | 'complete'

export interface OnboardingSession {
  id: string
  channel: string
  channelId: string
  state: OnboardingState
  vertical?: string
  answers: {
    business?: string
    challenge?: string
    numbers?: string
  }
}

const CORE_EMPLOYEES = [
  'chief-of-staff',
  'growth-lead',
  'closer',
  'finance-analyst',
  'ops-manager',
  'support-lead',
]

export function getCoreEmployeeIds(): string[] {
  return [...CORE_EMPLOYEES]
}

export function createSession(channel: string, channelId: string): OnboardingSession {
  return {
    id: crypto.randomUUID(),
    channel,
    channelId,
    state: 'q1_business',
    answers: {},
  }
}

export function getAvailableVerticals(packsDirs: string[]): Array<{ name: string; displayName: string; description: string }> {
  const verticals: Array<{ name: string; displayName: string; description: string }> = []
  const seen = new Set<string>()
  for (const dir of packsDirs) {
    const packs = listAvailablePacks(dir)
    for (const pack of packs) {
      if (seen.has(pack.name)) continue
      seen.add(pack.name)
      verticals.push({ name: pack.name, displayName: pack.display_name, description: pack.description })
    }
  }
  return verticals
}

/** Detect the vertical from user's business description */
export function detectVertical(businessDescription: string, packsDirs: string[]): string | undefined {
  const lower = businessDescription.toLowerCase()
  const verticals = getAvailableVerticals(packsDirs)

  // Keyword matching for each vertical
  const VERTICAL_KEYWORDS: Record<string, string[]> = {
    staffing: ['staffing', 'recruiting', 'recruitment', 'placement', 'temp', 'hiring agency', 'headhunter', 'talent acquisition'],
    coaching: ['coaching', 'coach', 'mentoring', 'consulting', 'training program', 'course creator'],
    agency: ['agency', 'marketing agency', 'digital agency', 'creative agency', 'ad agency', 'media agency'],
  }

  for (const v of verticals) {
    const keywords = VERTICAL_KEYWORDS[v.name] ?? [v.name]
    if (keywords.some(kw => lower.includes(kw))) {
      return v.name
    }
  }
  return undefined
}

export function isSkipSignal(message: string): boolean {
  const m = message.trim().toLowerCase()
  return /^(skip|done|let'?s go|finish|stop|enough|no more|move on|just set ?up|hurry up)$/i.test(m)
    || /\bskip\b/i.test(m)
    || /\btoo many\b/i.test(m)
    || /\bnot listening\b/i.test(m)
    || /let's just/i.test(m)
}

/** Get the next question prompt based on current state */
export function getQuestionPrompt(state: OnboardingState): string | null {
  switch (state) {
    case 'q1_business':
      return "Tell me about your business — what do you do and who do you help?"
    case 'q2_challenge':
      return "What's your biggest challenge right now — the thing that if solved would change everything?"
    case 'q3_numbers':
      return "Last one — what are your rough numbers? Revenue, deal size, team size, and what tools do you use?"
    default:
      return null
  }
}

/** Advance to the next state after recording an answer */
export function advanceState(session: OnboardingSession, answer: string): OnboardingSession {
  switch (session.state) {
    case 'q1_business':
      return { ...session, state: 'q2_challenge', answers: { ...session.answers, business: answer } }
    case 'q2_challenge':
      return { ...session, state: 'q3_numbers', answers: { ...session.answers, challenge: answer } }
    case 'q3_numbers':
      return { ...session, state: 'installing', answers: { ...session.answers, numbers: answer } }
    default:
      return session
  }
}

/** Execute the installation: activate core employees, seed memories from interview, install skill pack */
export function executeInstall(session: OnboardingSession, packsDir: string): {
  employeesActivated: number
  memoriesSeeded: number
  skillsInstalled: number
} {
  let employeesActivated = 0
  let memoriesSeeded = 0
  let skillsInstalled = 0

  // 1. Activate core employees
  for (const employeeId of CORE_EMPLOYEES) {
    const def = getEmployeeDefinition(employeeId)
    if (!def) continue

    employeesRepo.upsert({
      slug: def.id,
      name: def.name,
      title: def.title,
      pillar: def.pillar,
      description: def.description,
      icon: def.icon,
      active: true,
      department: def.department,
      objective: def.objective,
      managerId: def.manager ?? undefined,
      allowedToolsJson: def.tools,
      modelPreference: def.modelPreference,
      maxBudgetPerRun: def.maxBudgetPerRun,
      escalationPolicyJson: def.escalationPolicy,
      handoffRulesJson: def.handoffRules,
      memoryScope: def.memoryScope,
    })
    employeesActivated++
  }

  // 2. Seed memories from the 3 interview answers
  const MAX_ANSWER_LENGTH = 2000

  if (session.answers.business) {
    memories.create({
      type: 'fact',
      content: `Business overview: ${session.answers.business.slice(0, MAX_ANSWER_LENGTH)}`,
      tags: ['onboarding', 'business', 'overview', 'icp'],
      source: 'onboarding',
      confidence: 0.95,
    })
    memoriesSeeded++
  }

  if (session.answers.challenge) {
    memories.create({
      type: 'fact',
      content: `Biggest current challenge: ${session.answers.challenge.slice(0, MAX_ANSWER_LENGTH)}`,
      tags: ['onboarding', 'challenge', 'priority', 'bottleneck'],
      source: 'onboarding',
      confidence: 0.95,
    })
    memoriesSeeded++
  }

  if (session.answers.numbers) {
    memories.create({
      type: 'fact',
      content: `Business numbers and tools: ${session.answers.numbers.slice(0, MAX_ANSWER_LENGTH)}`,
      tags: ['onboarding', 'revenue', 'metrics', 'tools', 'team'],
      source: 'onboarding',
      confidence: 0.9,
    })
    memoriesSeeded++
  }

  // 3. Auto-detect vertical from business description and install matching pack
  const vertical = session.vertical ?? detectVertical(session.answers.business ?? '', [packsDir])

  // Validate vertical name — prevent path traversal
  const ALLOWED_VERTICAL_PATTERN = /^[a-z0-9-]+$/
  if (vertical && !ALLOWED_VERTICAL_PATTERN.test(vertical)) {
    return { employeesActivated, memoriesSeeded, skillsInstalled }
  }

  if (vertical) {
    const packDir = join(packsDir, vertical)
    const manifestPath = join(packDir, 'pack.yaml')
    if (existsSync(manifestPath)) {
      const result = installSkillPack(packDir)
      skillsInstalled = result.skillsInstalled
      memoriesSeeded += result.memoriesSeeded
    }
  }

  return { employeesActivated, memoriesSeeded, skillsInstalled }
}

/**
 * Instant zero-question setup. Activates core employees and installs
 * the default skill pack. No questions asked — the user gets value immediately.
 * Personalization happens organically through conversation.
 */
export function executeInstantSetup(packsDir: string): {
  employeesActivated: number
  memoriesSeeded: number
  skillsInstalled: number
} {
  let employeesActivated = 0
  let memoriesSeeded = 0
  let skillsInstalled = 0

  // 1. Activate core employees
  for (const employeeId of CORE_EMPLOYEES) {
    const def = getEmployeeDefinition(employeeId)
    if (!def) continue

    employeesRepo.upsert({
      slug: def.id,
      name: def.name,
      title: def.title,
      pillar: def.pillar,
      description: def.description,
      icon: def.icon,
      active: true,
      department: def.department,
      objective: def.objective,
      managerId: def.manager ?? undefined,
      allowedToolsJson: def.tools,
      modelPreference: def.modelPreference,
      maxBudgetPerRun: def.maxBudgetPerRun,
      escalationPolicyJson: def.escalationPolicy,
      handoffRulesJson: def.handoffRules,
      memoryScope: def.memoryScope,
    })
    employeesActivated++
  }

  // 2. Try to install the first available skill pack (staffing by default)
  if (existsSync(packsDir)) {
    const dirs = readdirSync(packsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())

    for (const dir of dirs) {
      const manifestPath = join(packsDir, dir.name, 'pack.yaml')
      if (existsSync(manifestPath)) {
        try {
          const result = installSkillPack(join(packsDir, dir.name))
          skillsInstalled = result.skillsInstalled
          memoriesSeeded += result.memoriesSeeded
        } catch {
          // Skill pack install is best-effort
        }
        break // Install first available pack only
      }
    }
  }

  return { employeesActivated, memoriesSeeded, skillsInstalled }
}

/** Get suggested first prompts after onboarding completes */
export function getSuggestedPrompts(session: OnboardingSession): string[] {
  const prompts: string[] = []

  for (const empId of CORE_EMPLOYEES.slice(0, 3)) {
    const def = getEmployeeDefinition(empId)
    if (def && def.suggestedActions.length > 0) {
      prompts.push(def.suggestedActions[0])
    }
  }

  if (prompts.length === 0) {
    prompts.push(
      'Give me a morning briefing',
      'What should I focus on today?',
      'Audit my current situation',
    )
  }

  return prompts.slice(0, 3)
}
