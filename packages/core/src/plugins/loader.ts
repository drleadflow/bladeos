import { plugins as pluginRepo } from '@blade/db'
import { logger } from '@blade/shared'
import { resolve } from 'node:path'
import type { AnyPlugin, BladeHookPlugin, BladeToolPlugin, BladeWorkerPlugin, PluginContext } from './sdk.js'
import { registerHookPlugin, unregisterHookPlugin } from './hooks.js'
import { registerTool } from '../tool-registry.js'
import type { ToolInputSchema } from '../types.js'

const MAX_CRASH_COUNT = 3
const loadedPlugins = new Map<string, AnyPlugin>()

function createPluginContext(pluginId: string, pluginName: string, config: Record<string, unknown>): PluginContext {
  return {
    logger: {
      info: (msg: string) => logger.info(`Plugin:${pluginName}`, msg),
      warn: (msg: string) => logger.warn(`Plugin:${pluginName}`, msg),
      error: (msg: string) => logger.error(`Plugin:${pluginName}`, msg),
      debug: (msg: string) => logger.debug(`Plugin:${pluginName}`, msg),
    },
    config,
    pluginId,
    pluginName,
  }
}

export async function loadPlugin(name: string): Promise<boolean> {
  const record = pluginRepo.get(name)
  if (!record) {
    logger.warn('PluginLoader', `Plugin "${name}" not found in registry`)
    return false
  }

  if (!record.enabled) {
    logger.debug('PluginLoader', `Plugin "${name}" is disabled, skipping`)
    return false
  }

  if (record.crashCount >= MAX_CRASH_COUNT) {
    logger.warn('PluginLoader', `Plugin "${name}" disabled after ${MAX_CRASH_COUNT} crashes`)
    pluginRepo.disable(name)
    return false
  }

  try {
    const entryPath = resolve(record.entryPoint)
    const module = await import(entryPath) as Record<string, unknown>
    const plugin = (module.default ?? module['plugin']) as AnyPlugin

    if (!plugin || !plugin.name || !plugin.type) {
      throw new Error('Plugin must export a default object with name and type')
    }

    const config = JSON.parse(record.configJson ?? '{}') as Record<string, unknown>
    const context = createPluginContext(record.id, record.name, config)

    await plugin.init(context)

    if (plugin.type === 'hook') {
      registerHookPlugin(plugin as BladeHookPlugin)
    }

    if (plugin.type === 'tool') {
      const toolPlugin = plugin as BladeToolPlugin
      for (const tool of toolPlugin.tools) {
        registerTool(
          {
            name: `${name}:${tool.name}`,
            description: `[Plugin: ${name}] ${tool.description}`,
            category: 'custom',
            input_schema: tool.inputSchema as unknown as ToolInputSchema,
          },
          tool.handler
        )
      }
    }

    if (plugin.type === 'worker') {
      await (plugin as BladeWorkerPlugin).start()
    }

    loadedPlugins.set(name, plugin)
    pluginRepo.logEvent(record.id, 'loaded', 'success')
    pluginRepo.resetCrashCount(name)
    logger.info('PluginLoader', `Loaded plugin "${name}" (${plugin.type} v${plugin.version})`)
    return true
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    const crashCount = pluginRepo.recordCrash(name)
    pluginRepo.logEvent(record.id, 'load_error', 'error', { error: errorMsg })
    logger.error('PluginLoader', `Failed to load plugin "${name}" (crash ${crashCount}/${MAX_CRASH_COUNT}): ${errorMsg}`)
    return false
  }
}

export async function unloadPlugin(name: string): Promise<void> {
  const plugin = loadedPlugins.get(name)
  if (!plugin) return

  try {
    if (plugin.type === 'hook') {
      unregisterHookPlugin(name)
    }
    if (plugin.type === 'worker' && (plugin as BladeWorkerPlugin).stop) {
      await (plugin as BladeWorkerPlugin).stop!()
    }
    if (plugin.destroy) {
      await plugin.destroy()
    }
  } catch (err) {
    logger.warn('PluginLoader', `Error unloading plugin "${name}": ${err instanceof Error ? err.message : String(err)}`)
  }

  loadedPlugins.delete(name)
  logger.info('PluginLoader', `Unloaded plugin "${name}"`)
}

export async function loadAllPlugins(): Promise<{ loaded: number; failed: number }> {
  const enabledPlugins = pluginRepo.list({ enabled: true })
  let loaded = 0
  let failed = 0

  for (const record of enabledPlugins) {
    const success = await loadPlugin(record.name)
    if (success) loaded++
    else failed++
  }

  logger.info('PluginLoader', `Loaded ${loaded} plugins (${failed} failed)`)
  return { loaded, failed }
}

export function getLoadedPlugins(): string[] {
  return [...loadedPlugins.keys()]
}

export function isPluginLoaded(name: string): boolean {
  return loadedPlugins.has(name)
}
