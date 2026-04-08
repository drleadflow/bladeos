import type { ToolDefinition, ToolHandler, ToolRegistration, ToolCallResult, ExecutionContext } from './types.js'

// Global singleton registry (survives module reloads)
const REGISTRY_KEY = '__blade_tool_registry__'
const _registry: Map<string, ToolRegistration> =
  (globalThis as Record<string, unknown>)[REGISTRY_KEY] as Map<string, ToolRegistration>
  ?? ((globalThis as Record<string, unknown>)[REGISTRY_KEY] = new Map<string, ToolRegistration>())

export function registerTool(definition: ToolDefinition, handler: ToolHandler): void {
  _registry.set(definition.name, { definition, handler })
}

export function getTool(name: string): ToolRegistration | undefined {
  return _registry.get(name)
}

export function getAllToolDefinitions(): ToolDefinition[] {
  return [..._registry.values()].map(r => r.definition)
}

export function getToolsByCategory(category: ToolDefinition['category']): ToolDefinition[] {
  return [..._registry.values()]
    .filter(r => r.definition.category === category)
    .map(r => r.definition)
}

export function hasDocker(): ToolDefinition[] {
  return [..._registry.values()]
    .filter(r => r.definition.requiresDocker)
    .map(r => r.definition)
}

export async function executeTool(
  name: string,
  toolUseId: string,
  input: Record<string, unknown>,
  context: ExecutionContext
): Promise<ToolCallResult> {
  const registration = _registry.get(name)

  if (!registration) {
    return {
      toolUseId,
      toolName: name,
      input,
      success: false,
      data: null,
      display: `Tool "${name}" not found`,
      durationMs: 0,
      timestamp: new Date().toISOString(),
    }
  }

  const start = performance.now()

  try {
    const result = await registration.handler(input, context)
    return {
      ...result,
      toolUseId,
      durationMs: Math.round(performance.now() - start),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      toolUseId,
      toolName: name,
      input,
      success: false,
      data: null,
      display: `Tool "${name}" error: ${message}`,
      durationMs: Math.round(performance.now() - start),
      timestamp: new Date().toISOString(),
    }
  }
}

export function clearRegistry(): void {
  _registry.clear()
}
