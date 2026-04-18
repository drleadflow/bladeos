import type { ToolHandler } from '../types.js'

/** Context provided to plugins during initialization */
export interface PluginContext {
  logger: {
    info: (msg: string) => void
    warn: (msg: string) => void
    error: (msg: string) => void
    debug: (msg: string) => void
  }
  config: Record<string, unknown>
  pluginId: string
  pluginName: string
}

/** Tool registration from a plugin */
export interface PluginToolRegistration {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  handler: ToolHandler
}

/** Base plugin interface */
export interface BladePlugin {
  name: string
  version: string
  type: 'hook' | 'tool' | 'provider' | 'worker'
  description?: string
  init(context: PluginContext): Promise<void>
  destroy?(): Promise<void>
}

/** Hook plugin — runs code at lifecycle events */
export interface BladeHookPlugin extends BladePlugin {
  type: 'hook'
  hooks: {
    beforeToolCall?: (toolName: string, input: Record<string, unknown>) => Promise<void>
    afterToolCall?: (toolName: string, result: unknown, durationMs: number) => Promise<void>
    beforeModelCall?: (modelId: string, messageCount: number) => Promise<void>
    afterModelCall?: (modelId: string, inputTokens: number, outputTokens: number) => Promise<void>
    onMemorySave?: (content: string, type: string) => Promise<void>
    onMissionAssigned?: (missionId: string, employeeSlug: string) => Promise<void>
  }
}

/** Tool plugin — registers custom tools */
export interface BladeToolPlugin extends BladePlugin {
  type: 'tool'
  tools: PluginToolRegistration[]
}

/** Provider plugin — adds custom model providers */
export interface BladeProviderPlugin extends BladePlugin {
  type: 'provider'
  providerName: string
  call(systemPrompt: string, messages: unknown[], tools: unknown[], maxTokens?: number): Promise<unknown>
}

/** Worker plugin — runs background tasks */
export interface BladeWorkerPlugin extends BladePlugin {
  type: 'worker'
  start(): Promise<void>
  stop?(): Promise<void>
}

/** Union type for all plugin types */
export type AnyPlugin = BladeHookPlugin | BladeToolPlugin | BladeProviderPlugin | BladeWorkerPlugin
