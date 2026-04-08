import { readFileSync } from 'fs'
import { runAgentLoop } from '../agent-loop.js'
import { getEmployee, getActiveArchetype } from '../employees/registry.js'
import { loadPersonality } from '../personality.js'
import { getAllToolDefinitions } from '../tool-registry.js'
import { logger } from '@blade/shared'

export interface WebhookTrigger {
  id: string
  name: string
  path: string
  employeeId: string
  action: string
  enabled: boolean
}

export interface WebhookResult {
  triggerId: string
  employeeId: string
  success: boolean
  response: string
  timestamp: string
}

const triggerRegistry: Map<string, WebhookTrigger> = new Map()

export function loadTriggersFromFile(path: string): WebhookTrigger[] {
  const raw = readFileSync(path, 'utf-8')
  const parsed: unknown = JSON.parse(raw)

  if (!Array.isArray(parsed)) {
    throw new Error(`Expected an array of webhook triggers in ${path}`)
  }

  const triggers = parsed as WebhookTrigger[]

  for (const trigger of triggers) {
    if (!trigger.id || !trigger.path || !trigger.employeeId || !trigger.action) {
      throw new Error(
        `Invalid trigger definition: each trigger must have id, path, employeeId, and action`
      )
    }
    triggerRegistry.set(trigger.path, trigger)
  }

  logger.info('Webhooks', `Loaded ${triggers.length} webhook trigger(s)`)
  return triggers
}

export function getTriggerByPath(path: string): WebhookTrigger | undefined {
  return triggerRegistry.get(path)
}

export function getAllTriggers(): WebhookTrigger[] {
  return [...triggerRegistry.values()]
}

export async function handleWebhookTrigger(
  triggerId: string,
  payload: unknown
): Promise<WebhookResult> {
  const trigger = [...triggerRegistry.values()].find(t => t.id === triggerId)

  if (!trigger) {
    return {
      triggerId,
      employeeId: '',
      success: false,
      response: `Trigger "${triggerId}" not found`,
      timestamp: new Date().toISOString(),
    }
  }

  if (!trigger.enabled) {
    return {
      triggerId,
      employeeId: trigger.employeeId,
      success: false,
      response: `Trigger "${triggerId}" is disabled`,
      timestamp: new Date().toISOString(),
    }
  }

  const employee = getEmployee(trigger.employeeId)
  if (!employee) {
    return {
      triggerId,
      employeeId: trigger.employeeId,
      success: false,
      response: `Employee "${trigger.employeeId}" not found`,
      timestamp: new Date().toISOString(),
    }
  }

  const archetype = getActiveArchetype()
  const systemPrompt = employee.systemPrompt[archetype]
  const payloadStr = JSON.stringify(payload, null, 2)

  const userMessage = [
    `[WEBHOOK TRIGGER: ${trigger.name}]`,
    '',
    trigger.action,
    '',
    '--- Webhook Payload ---',
    payloadStr,
  ].join('\n')

  logger.info('Webhooks', `Handling trigger "${trigger.id}" for employee "${trigger.employeeId}"`)

  try {
    const tools = getAllToolDefinitions().filter(
      t => employee.tools.includes(t.name) || t.category === 'system'
    )

    const result = await runAgentLoop({
      systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      tools,
      context: {
        conversationId: `webhook-${trigger.id}-${Date.now()}`,
        userId: 'webhook',
        modelId: 'claude-sonnet-4-20250514',
        maxIterations: 10,
        costBudget: 0,
      },
    })

    const responseText = result.turns
      .flatMap(t => t.response.content)
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map(b => b.text)
      .join('\n')

    logger.info('Webhooks', `Trigger "${trigger.id}" completed successfully`)

    return {
      triggerId: trigger.id,
      employeeId: trigger.employeeId,
      success: true,
      response: responseText,
      timestamp: new Date().toISOString(),
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('Webhooks', `Trigger "${trigger.id}" failed: ${message}`)

    return {
      triggerId: trigger.id,
      employeeId: trigger.employeeId,
      success: false,
      response: `Webhook handling failed: ${message}`,
      timestamp: new Date().toISOString(),
    }
  }
}
