import crypto from 'node:crypto'
import type { ToolDefinition, ToolHandler, ToolRegistration, ToolCallResult, ExecutionContext } from './types.js'

// Global singleton registry (survives module reloads)
const REGISTRY_KEY = '__blade_tool_registry__'
const _registry: Map<string, ToolRegistration> =
  (globalThis as Record<string, unknown>)[REGISTRY_KEY] as Map<string, ToolRegistration>
  ?? ((globalThis as Record<string, unknown>)[REGISTRY_KEY] = new Map<string, ToolRegistration>())

// Scoped tool maps — isolated per job/session
const _scopes: Map<string, Map<string, ToolRegistration>> = new Map()

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

export function createToolScope(): string {
  const id = crypto.randomUUID()
  _scopes.set(id, new Map())
  return id
}

export function registerScopedTool(scopeId: string, definition: ToolDefinition, handler: ToolHandler): void {
  const scope = _scopes.get(scopeId)
  if (!scope) throw new Error(`Tool scope ${scopeId} not found`)
  scope.set(definition.name, { definition, handler })
}

export function getScopedToolDefinitions(scopeId: string): ToolDefinition[] {
  const scope = _scopes.get(scopeId)
  if (!scope) return []
  return [...scope.values()].map(r => r.definition)
}

export function destroyToolScope(scopeId: string): void {
  _scopes.delete(scopeId)
}

/**
 * Create a tool scope pre-populated with global tools matching allowedNames.
 * This is the primary way to enforce per-employee tool restrictions.
 * Only tools whose names appear in the allowlist are included.
 */
export function createFilteredScope(allowedToolNames: readonly string[]): string {
  const id = crypto.randomUUID()
  const scope = new Map<string, ToolRegistration>()
  const allowSet = new Set(allowedToolNames)

  for (const [name, registration] of _registry) {
    if (allowSet.has(name)) {
      scope.set(name, registration)
    }
  }

  _scopes.set(id, scope)
  return id
}

export async function executeTool(
  name: string,
  toolUseId: string,
  input: Record<string, unknown>,
  context: ExecutionContext
): Promise<ToolCallResult> {
  // When a scope is set, ONLY check the scope — no fallthrough to global.
  // This makes per-employee tool restrictions a hard sandbox.
  if (context.toolScopeId) {
    const scope = _scopes.get(context.toolScopeId)
    const scopedReg = scope?.get(name)

    if (!scopedReg) {
      return {
        toolUseId,
        toolName: name,
        input,
        success: false,
        data: null,
        display: `Tool "${name}" not available in this scope`,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      }
    }

    const start = performance.now()
    try {
      const result = await scopedReg.handler(input, context)
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

  // No scope — use global registry
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
