import { missions } from '@blade/db'
import { logger } from '@blade/shared'
import { executeEmployeeTask } from '../providers/auto-executor.js'
import type { MissionResult } from './types.js'

export interface ExecuteMissionOptions {
  missionId: string
  onClarificationNeeded?: (missionId: string, question: string) => Promise<void>
}

export async function executeMission(options: ExecuteMissionOptions): Promise<MissionResult> {
  const { missionId } = options
  const mission = missions.get(missionId)

  if (!mission) {
    throw new Error(`Mission ${missionId} not found`)
  }

  if (!mission.assignedEmployee) {
    throw new Error(`Mission ${missionId} has no assigned employee`)
  }

  logger.info('mission-executor', `Executing mission "${mission.title}" with ${mission.assignedEmployee}`)

  missions.start(missionId)

  const startTime = Date.now()

  try {
    let prompt = `Mission: ${mission.title}`
    if (mission.description) {
      prompt += `\n\nDescription: ${mission.description}`
    }
    if (mission.userResponse) {
      prompt += `\n\nUser provided this clarification: ${mission.userResponse}`
    }
    prompt += `\n\nProvide your findings in a structured format:\n1. A 2-3 sentence summary\n2. Detailed findings\n3. Any relevant URLs, file paths, or artifacts\n4. Your confidence level (0.0-1.0) in the result`

    const result = await executeEmployeeTask({
      employeeSlug: mission.assignedEmployee,
      message: prompt,
      maxTurns: 15,
    })

    const durationMs = Date.now() - startTime
    const text = result.text ?? 'No output produced.'

    const missionResult: MissionResult = {
      summary: extractSummary(text),
      findings: text,
      artifacts: extractArtifacts(text),
      confidence: extractConfidence(text),
      tokensUsed: result.inputTokens + result.outputTokens,
      costUsd: result.costUsd,
      employeeModel: result.model,
      durationMs,
    }

    return missionResult
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    logger.error('mission-executor', `Mission "${mission.title}" failed: ${msg}`)
    throw error
  }
}

function extractSummary(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0)
  return sentences.slice(0, 3).join(' ').slice(0, 500)
}

function extractArtifacts(text: string): string[] {
  const urlPattern = /https?:\/\/[^\s)>"]+/g
  const filePattern = /(?:^|\s)(\/[\w./-]+\.\w+)/gm
  const urls = text.match(urlPattern) ?? []
  const files = [...text.matchAll(filePattern)].map(m => m[1])
  return [...new Set([...urls, ...files])]
}

function extractConfidence(text: string): number {
  const match = text.match(/confidence[:\s]*([01]?\.\d+|[01])/i)
  if (match) {
    const val = parseFloat(match[1])
    if (val >= 0 && val <= 1) return val
  }
  return 0.7
}
