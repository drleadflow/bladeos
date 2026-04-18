import { plugins as pluginRepo } from '@blade/db'
import type { InstallPluginParams } from '@blade/db'
import { loadPlugin, unloadPlugin } from './loader.js'
import { logger } from '@blade/shared'

export interface PluginInfo {
  name: string
  version: string
  type: string
  description: string | null
  enabled: boolean
  crashCount: number
  installedAt: string
}

export async function installPlugin(params: InstallPluginParams & { autoLoad?: boolean }): Promise<PluginInfo> {
  const record = pluginRepo.install(params)

  if (params.autoLoad !== false) {
    await loadPlugin(record.name)
  }

  logger.info('PluginRegistry', `Installed plugin "${params.name}" v${params.version} (${params.type})`)

  return {
    name: record.name,
    version: record.version,
    type: record.type,
    description: record.description,
    enabled: record.enabled === 1,
    crashCount: record.crashCount,
    installedAt: record.installedAt,
  }
}

export async function uninstallPlugin(name: string): Promise<void> {
  await unloadPlugin(name)
  pluginRepo.uninstall(name)
  logger.info('PluginRegistry', `Uninstalled plugin "${name}"`)
}

export async function enablePlugin(name: string): Promise<boolean> {
  pluginRepo.enable(name)
  return loadPlugin(name)
}

export async function disablePlugin(name: string): Promise<void> {
  await unloadPlugin(name)
  pluginRepo.disable(name)
}

export function listPlugins(filters?: { type?: string; enabled?: boolean }): PluginInfo[] {
  return pluginRepo.list(filters).map(r => ({
    name: r.name,
    version: r.version,
    type: r.type,
    description: r.description,
    enabled: r.enabled === 1,
    crashCount: r.crashCount,
    installedAt: r.installedAt,
  }))
}

export function getPluginInfo(name: string): PluginInfo | undefined {
  const r = pluginRepo.get(name)
  if (!r) return undefined
  return {
    name: r.name,
    version: r.version,
    type: r.type,
    description: r.description,
    enabled: r.enabled === 1,
    crashCount: r.crashCount,
    installedAt: r.installedAt,
  }
}
