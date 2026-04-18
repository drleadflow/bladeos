import type { BladeHookPlugin } from './sdk.js'
import { logger } from '@blade/shared'

const registeredHooks: BladeHookPlugin[] = []

const HOOK_TIMEOUT_MS = 5000

export function registerHookPlugin(plugin: BladeHookPlugin): void {
  registeredHooks.push(plugin)
  logger.info('PluginHooks', `Registered hook plugin: ${plugin.name}`)
}

export function unregisterHookPlugin(pluginName: string): void {
  const idx = registeredHooks.findIndex(p => p.name === pluginName)
  if (idx >= 0) {
    registeredHooks.splice(idx, 1)
  }
}

async function runHookSafe<T>(hookName: string, pluginName: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Hook timeout')), HOOK_TIMEOUT_MS)
      ),
    ])
    return result
  } catch (err) {
    logger.warn('PluginHooks', `Hook ${hookName} from plugin ${pluginName} failed: ${err instanceof Error ? err.message : String(err)}`)
    return undefined
  }
}

export async function fireBeforeToolCall(toolName: string, input: Record<string, unknown>): Promise<void> {
  for (const plugin of registeredHooks) {
    if (plugin.hooks.beforeToolCall) {
      await runHookSafe('beforeToolCall', plugin.name, () => plugin.hooks.beforeToolCall!(toolName, input))
    }
  }
}

export async function fireAfterToolCall(toolName: string, result: unknown, durationMs: number): Promise<void> {
  for (const plugin of registeredHooks) {
    if (plugin.hooks.afterToolCall) {
      await runHookSafe('afterToolCall', plugin.name, () => plugin.hooks.afterToolCall!(toolName, result, durationMs))
    }
  }
}

export async function fireBeforeModelCall(modelId: string, messageCount: number): Promise<void> {
  for (const plugin of registeredHooks) {
    if (plugin.hooks.beforeModelCall) {
      await runHookSafe('beforeModelCall', plugin.name, () => plugin.hooks.beforeModelCall!(modelId, messageCount))
    }
  }
}

export async function fireAfterModelCall(modelId: string, inputTokens: number, outputTokens: number): Promise<void> {
  for (const plugin of registeredHooks) {
    if (plugin.hooks.afterModelCall) {
      await runHookSafe('afterModelCall', plugin.name, () => plugin.hooks.afterModelCall!(modelId, inputTokens, outputTokens))
    }
  }
}

export async function fireOnMemorySave(content: string, type: string): Promise<void> {
  for (const plugin of registeredHooks) {
    if (plugin.hooks.onMemorySave) {
      await runHookSafe('onMemorySave', plugin.name, () => plugin.hooks.onMemorySave!(content, type))
    }
  }
}

export async function fireOnMissionAssigned(missionId: string, employeeSlug: string): Promise<void> {
  for (const plugin of registeredHooks) {
    if (plugin.hooks.onMissionAssigned) {
      await runHookSafe('onMissionAssigned', plugin.name, () => plugin.hooks.onMissionAssigned!(missionId, employeeSlug))
    }
  }
}

export function getRegisteredHookCount(): number {
  return registeredHooks.length
}
