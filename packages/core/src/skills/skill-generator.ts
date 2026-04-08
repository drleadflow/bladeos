import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { callModel, resolveSmartModelConfig } from '../model-provider.js'
import { skills } from '@blade/db'
import type { Skill } from '../types.js'

/**
 * Check if an existing skill already covers this task via fuzzy keyword matching.
 */
function findMatchingSkill(
  jobDescription: string,
  existingSkills: Skill[]
): Skill | null {
  const jobWords = jobDescription
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3)

  let bestMatch: Skill | null = null
  let bestScore = 0

  for (const skill of existingSkills) {
    const skillWords = skill.description.toLowerCase()
    let score = 0
    for (const word of jobWords) {
      if (skillWords.includes(word)) {
        score++
      }
    }
    if (score > bestScore) {
      bestScore = score
      bestMatch = skill
    }
  }

  // Threshold: at least 3 matching words to consider it a match
  return bestScore >= 3 ? bestMatch : null
}

/**
 * Generate a reusable skill definition from a completed job.
 * Returns the new Skill if one was created, or null if an existing skill already covers it.
 * Never throws.
 */
export async function generateSkillFromJob(
  jobTitle: string,
  jobDescription: string,
  toolsUsed: string[],
  wasSuccessful: boolean,
  existingSkills: Skill[]
): Promise<Skill | null> {
  try {
    // Check if an existing skill already covers this task
    const existing = findMatchingSkill(jobDescription, existingSkills)
    if (existing) {
      // Update success rate for the existing skill
      try {
        skills.recordUse(existing.name, wasSuccessful)
      } catch {
        // DB update failed — not critical
      }
      return null
    }

    // Use Haiku to generate a skill definition
    const config = resolveSmartModelConfig('light')

    const prompt = `Based on this completed task, generate a reusable skill definition as YAML.

Task title: ${jobTitle}
Task description: ${jobDescription}
Tools used: ${toolsUsed.join(', ')}
Was successful: ${wasSuccessful}

Generate YAML with these fields:
- name: a short kebab-case identifier (e.g. "add-health-check")
- description: a one-sentence description of what this skill does
- system_prompt: the system prompt an agent should use when executing this type of task (2-4 sentences)
- tools: list of tool names the agent should have access to

Respond with ONLY the YAML block, no markdown fences, no explanation.`

    const response = await callModel(
      config,
      'You are a skill definition generator for an AI agent system. Output only valid YAML.',
      [{ role: 'user', content: prompt }],
      [],
      1024
    )

    // Extract text from response
    const text = response.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()

    // Strip markdown fences if present
    const yamlText = text
      .replace(/^```ya?ml\s*/i, '')
      .replace(/```\s*$/, '')
      .trim()

    // Parse the YAML manually (simple key: value extraction)
    const nameMatch = yamlText.match(/^name:\s*(.+)$/m)
    const descMatch = yamlText.match(/^description:\s*(.+)$/m)
    const promptMatch = yamlText.match(/^system_prompt:\s*["|']?(.+?)["|']?\s*$/m)
    const toolsMatch = yamlText.match(/^tools:\s*\n((?:\s*-\s*.+\n?)*)/m)

    const skillName = nameMatch?.[1]?.trim().replace(/['"]/g, '')
    const skillDescription = descMatch?.[1]?.trim().replace(/['"]/g, '')
    const skillSystemPrompt = promptMatch?.[1]?.trim().replace(/['"]/g, '')

    if (!skillName || !skillDescription || !skillSystemPrompt) {
      return null
    }

    const skillTools: string[] = []
    if (toolsMatch?.[1]) {
      const lines = toolsMatch[1].split('\n')
      for (const line of lines) {
        const toolMatch = line.match(/^\s*-\s*(.+)$/)
        if (toolMatch) {
          skillTools.push(toolMatch[1].trim().replace(/['"]/g, ''))
        }
      }
    }

    // Write the skill YAML to ~/.blade/skills/learned/{name}/skill.yaml
    const skillDir = join(homedir(), '.blade', 'skills', 'learned', skillName)
    mkdirSync(skillDir, { recursive: true })

    const skillYaml = [
      `name: ${skillName}`,
      `description: ${skillDescription}`,
      `version: 1`,
      `system_prompt: "${skillSystemPrompt.replace(/"/g, '\\"')}"`,
      `tools:`,
      ...skillTools.map((t) => `  - ${t}`),
    ].join('\n') + '\n'

    writeFileSync(join(skillDir, 'skill.yaml'), skillYaml)

    // Register in DB
    const dbResult = skills.upsert({
      name: skillName,
      description: skillDescription,
      systemPrompt: skillSystemPrompt,
      tools: skillTools,
      source: 'learned',
    })

    const now = new Date().toISOString()

    return {
      id: dbResult.id,
      name: skillName,
      description: skillDescription,
      version: 1,
      systemPrompt: skillSystemPrompt,
      tools: skillTools,
      examples: [],
      successRate: wasSuccessful ? 1 : 0,
      totalUses: 1,
      source: 'learned',
      createdAt: now,
      updatedAt: now,
    }
  } catch {
    // Never throw — return null on any failure
    return null
  }
}
