import { NextRequest } from 'next/server'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'
import { homedir } from 'os'
import { loadConfig } from '@blade/shared'
import { loadSkillsFromDir } from '@blade/core'

export const runtime = 'nodejs'

const BLADE_DIR = join(homedir(), '.blade')
const CONFIG_PATH = join(BLADE_DIR, 'config.json')
const SOUL_PATH = join(BLADE_DIR, 'SOUL.md')
const ENV_PATH = join(BLADE_DIR, '.env')
const DISABLED_SKILLS_PATH = join(BLADE_DIR, 'disabled-skills.json')

function ensureBladeDir(): void {
  if (!existsSync(BLADE_DIR)) {
    mkdirSync(BLADE_DIR, { recursive: true })
  }
}

function readPersonality(): string {
  try {
    return readFileSync(SOUL_PATH, 'utf-8')
  } catch {
    return ''
  }
}

function readDisabledSkills(): string[] {
  try {
    const raw = readFileSync(DISABLED_SKILLS_PATH, 'utf-8')
    return JSON.parse(raw) as string[]
  } catch {
    return []
  }
}

function writeDisabledSkills(names: string[]): void {
  ensureBladeDir()
  writeFileSync(DISABLED_SKILLS_PATH, JSON.stringify(names, null, 2))
}

function getKeyStatus(): Record<string, boolean> {
  return {
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY),
    github: Boolean(process.env.GITHUB_TOKEN),
    telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    exa: Boolean(process.env.EXA_API_KEY),
    serpapi: Boolean(process.env.SERPAPI_API_KEY),
    tavily: Boolean(process.env.TAVILY_API_KEY),
  }
}

export async function GET(): Promise<Response> {
  try {
    const config = loadConfig()
    const personality = readPersonality()
    const disabledSkills = readDisabledSkills()

    const fileSkills = loadSkillsFromDir(config.skillsDir)
    const skills = fileSkills.map((s) => ({
      name: s.name,
      description: s.description,
      successRate: s.successRate,
      totalUses: s.totalUses,
      source: s.source,
      enabled: !disabledSkills.includes(s.name),
    }))

    return Response.json({
      success: true,
      data: {
        defaultModel: config.defaultModel,
        costBudget: config.costBudget,
        maxIterations: config.maxIterations,
        keyStatus: getKeyStatus(),
        personality,
        skills,
      },
    })
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to load settings'
    return Response.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}

export async function PUT(req: NextRequest): Promise<Response> {
  const auth = requireAuth(req)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    const body = (await req.json()) as Record<string, unknown>
    ensureBladeDir()

    // Load existing config
    let config: Record<string, unknown> = {}
    if (existsSync(CONFIG_PATH)) {
      config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as Record<
        string,
        unknown
      >
    }

    // Update general settings
    if (body.defaultModel !== undefined) {
      config.defaultModel = body.defaultModel
    }
    if (body.costBudget !== undefined) {
      config.costBudget = body.costBudget
    }
    if (body.maxIterations !== undefined) {
      config.maxIterations = body.maxIterations
    }

    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))

    // Update API keys in .env
    if (body.apiKeys && typeof body.apiKeys === 'object') {
      const keys = body.apiKeys as Record<string, string>
      let envContent = ''
      if (existsSync(ENV_PATH)) {
        envContent = readFileSync(ENV_PATH, 'utf-8')
      }

      for (const [envName, value] of Object.entries(keys)) {
        const regex = new RegExp(`^${envName}=.*$`, 'm')
        const line = `${envName}=${value}`
        if (regex.test(envContent)) {
          envContent = envContent.replace(regex, line)
        } else {
          envContent = envContent.trimEnd() + '\n' + line + '\n'
        }
      }

      writeFileSync(ENV_PATH, envContent)
    }

    // Update personality
    if (typeof body.personality === 'string') {
      writeFileSync(SOUL_PATH, body.personality)
    }

    // Toggle skill
    if (body.toggleSkill && typeof body.toggleSkill === 'object') {
      const { name, enabled } = body.toggleSkill as {
        name: string
        enabled: boolean
      }
      const disabled = readDisabledSkills()

      if (enabled) {
        writeDisabledSkills(disabled.filter((n) => n !== name))
      } else {
        if (!disabled.includes(name)) {
          writeDisabledSkills([...disabled, name])
        }
      }
    }

    return Response.json({ success: true })
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to save settings'
    return Response.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
