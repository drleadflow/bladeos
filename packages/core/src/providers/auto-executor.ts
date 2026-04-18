import { isSdkAvailable } from './sdk-detect.js'
import { runEmployeeWithSdk } from './sdk-execution.js'
import type { EmployeeSdkOptions, EmployeeSdkResult } from './sdk-execution.js'
import { logger } from '@blade/shared'

export interface ExecuteEmployeeTaskResult {
  text: string | null
  inputTokens: number
  outputTokens: number
  costUsd: number
  model: string
  executionMode: 'sdk' | 'api'
  sessionId?: string
}

/**
 * Execute an employee task using the best available method.
 *
 * - Local machine with Claude auth → SDK (full Claude Code capabilities)
 * - Railway / Docker / no auth → API (standard Anthropic API)
 *
 * Override with BLADE_USE_SDK=true|false env var.
 */
export async function executeEmployeeTask(
  options: EmployeeSdkOptions
): Promise<ExecuteEmployeeTaskResult> {
  if (isSdkAvailable()) {
    logger.info('AutoExecutor', `Using SDK for ${options.employeeSlug}`)
    const result = await runEmployeeWithSdk(options)
    return {
      text: result.text,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd,
      model: result.model,
      executionMode: 'sdk',
      sessionId: result.sessionId,
    }
  }

  // API path — use the existing runAgentLoop
  // Import dynamically to avoid circular deps
  logger.info('AutoExecutor', `Using API for ${options.employeeSlug} (SDK not available)`)
  const { runAgentLoop } = await import('../agent-loop.js')
  const { getEmployee } = await import('../employees/registry.js')
  const { resolveSmartModelConfigChain } = await import('../model-provider.js')
  const { getAllToolDefinitions } = await import('../tool-registry.js')

  const employee = getEmployee(options.employeeSlug)
  if (!employee) throw new Error(`Employee "${options.employeeSlug}" not found`)

  const systemPromptText = typeof employee.systemPrompt === 'string'
    ? employee.systemPrompt as string
    : (employee.systemPrompt as { coach: string }).coach ?? employee.description

  const systemPrompt = `You are ${employee.name}, ${employee.title}. ${systemPromptText}`
  const tools = getAllToolDefinitions()
  const modelChain = resolveSmartModelConfigChain('standard', { needsToolCalling: true })

  const result = await runAgentLoop({
    systemPrompt,
    tools,
    messages: [{ role: 'user', content: options.message }],
    context: {
      userId: 'system',
      conversationId: options.conversationId ?? 'auto-exec',
      modelId: modelChain[0]?.modelId ?? 'claude-sonnet-4-20250514',
      modelConfig: modelChain[0],
      maxIterations: options.maxTurns ?? 25,
      costBudget: 0,
    },
    maxIterations: options.maxTurns ?? 25,
    onTextDelta: options.onStreamText,
  })

  return {
    text: result.finalResponse,
    inputTokens: result.totalInputTokens,
    outputTokens: result.totalOutputTokens,
    costUsd: result.totalCost,
    model: modelChain[0]?.modelId ?? 'unknown',
    executionMode: 'api',
  }
}
