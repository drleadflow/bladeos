import { runSdkAgent } from './claude-sdk.js'
import type { SdkRunResult } from './claude-sdk.js'
import { getSession, setSession, buildSessionKey } from './session-manager.js'
import { getEmployee } from '../employees/registry.js'
import { logEmployeeActivity } from '../employees/activity-logger.js'
import { calculateCost } from '../cost-tracker.js'
import { costEntries } from '@blade/db'
import { logger } from '@blade/shared'

export interface EmployeeSdkOptions {
  employeeSlug: string
  message: string
  conversationId?: string
  cwd?: string
  maxTurns?: number
  onProgress?: (event: { type: string; description: string }) => void
  onStreamText?: (text: string) => void
}

export interface EmployeeSdkResult {
  text: string | null
  sessionId: string | undefined
  inputTokens: number
  outputTokens: number
  costUsd: number
  model: string
}

function buildEmployeeContext(
  name: string,
  title: string,
  systemPrompt: string | undefined,
  message: string
): string {
  if (systemPrompt) {
    return `[You are ${name}, ${title}. ${systemPrompt}]\n\n${message}`
  }
  return message
}

function recordCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  conversationId?: string
): void {
  const cost = calculateCost(model, inputTokens, outputTokens)
  costEntries.record({
    model: cost.model,
    inputTokens: cost.inputTokens,
    outputTokens: cost.outputTokens,
    inputCostUsd: cost.inputCostUsd,
    outputCostUsd: cost.outputCostUsd,
    totalCostUsd: cost.totalCostUsd,
    conversationId,
  })
}

/**
 * Run an employee's task through the Claude Agent SDK.
 *
 * This gives the employee full Claude Code capabilities:
 * - All MCP servers from settings
 * - Session resumption (persistent context)
 * - File system access, bash, git
 * - Skills and CLAUDE.md context
 *
 * Use this instead of runAgentLoop() when you want the employee
 * to have full local machine access.
 */
export async function runEmployeeWithSdk(options: EmployeeSdkOptions): Promise<EmployeeSdkResult> {
  const { employeeSlug, message, conversationId, cwd, maxTurns, onProgress, onStreamText } = options

  const employee = getEmployee(employeeSlug)
  if (!employee) {
    throw new Error(`Employee "${employeeSlug}" not found`)
  }

  const sessionKey = buildSessionKey({ conversationId, employeeSlug })
  const existingSession = getSession(sessionKey)

  // systemPrompt is an object with 'coach' and 'operator' keys — use coach variant
  const systemPromptText = typeof employee.systemPrompt === 'string'
    ? employee.systemPrompt as string
    : (employee.systemPrompt as { coach: string; operator: string }).coach

  const employeeContext = buildEmployeeContext(
    employee.name,
    employee.title,
    systemPromptText,
    message
  )

  logger.info('SdkExecution', `Running ${employeeSlug} via SDK (session=${existingSession ? 'resume' : 'new'})`)

  logEmployeeActivity({
    employeeSlug,
    eventType: 'sdk_task_started',
    summary: `Started task: ${message.slice(0, 100)}`,
    conversationId,
  })

  const sdkModel = employee.modelPreference === 'light' ? 'claude-haiku-4-5' : undefined

  const result: SdkRunResult = await runSdkAgent({
    message: employeeContext,
    sessionId: existingSession,
    cwd,
    model: sdkModel,
    maxTurns: maxTurns ?? 30,
    onProgress,
    onStreamText,
  })

  if (result.sessionId) {
    setSession(sessionKey, result.sessionId)
  }

  if (result.inputTokens > 0 || result.outputTokens > 0) {
    recordCost(result.model, result.inputTokens, result.outputTokens, conversationId)
  }

  logEmployeeActivity({
    employeeSlug,
    eventType: 'sdk_task_completed',
    summary: `Completed task ($${result.costUsd.toFixed(4)})`,
    conversationId,
    costUsd: result.costUsd,
  })

  return {
    text: result.text,
    sessionId: result.sessionId,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
    model: result.model,
  }
}
