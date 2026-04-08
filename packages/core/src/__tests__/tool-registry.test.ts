import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerTool,
  getTool,
  getAllToolDefinitions,
  executeTool,
  clearRegistry,
  createToolScope,
  registerScopedTool,
  getScopedToolDefinitions,
  destroyToolScope,
} from '../tool-registry.js'
import type { ToolDefinition, ToolHandler, ExecutionContext } from '../types.js'

function makeDef(name: string, category: ToolDefinition['category'] = 'custom'): ToolDefinition {
  return {
    name,
    description: `Test tool ${name}`,
    input_schema: { type: 'object', properties: {}, required: [] },
    category,
  }
}

function makeHandler(returnValue: unknown = 'ok'): ToolHandler {
  return async (input, context) => ({
    toolUseId: '',
    toolName: '',
    input,
    success: true,
    data: returnValue,
    display: String(returnValue),
    durationMs: 0,
    timestamp: new Date().toISOString(),
  })
}

const baseContext: ExecutionContext = {
  conversationId: 'test-conv',
  userId: 'test-user',
  modelId: 'test-model',
  maxIterations: 10,
  costBudget: 1.0,
}

describe('tool-registry: global registry', () => {
  beforeEach(() => {
    clearRegistry()
  })

  it('registerTool and getTool', () => {
    const def = makeDef('my_tool')
    registerTool(def, makeHandler())
    const reg = getTool('my_tool')
    expect(reg).toBeDefined()
    expect(reg!.definition.name).toBe('my_tool')
  })

  it('getTool returns undefined for unknown tool', () => {
    expect(getTool('nonexistent')).toBeUndefined()
  })

  it('getAllToolDefinitions returns all registered tools', () => {
    registerTool(makeDef('a'), makeHandler())
    registerTool(makeDef('b'), makeHandler())
    const defs = getAllToolDefinitions()
    const names = defs.map(d => d.name)
    expect(names).toContain('a')
    expect(names).toContain('b')
  })

  it('executeTool runs the handler and returns result', async () => {
    registerTool(makeDef('echo'), makeHandler('hello'))
    const result = await executeTool('echo', 'use-1', {}, baseContext)
    expect(result.success).toBe(true)
    expect(result.data).toBe('hello')
    expect(result.toolUseId).toBe('use-1')
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('executeTool returns error for unknown tool', async () => {
    const result = await executeTool('missing', 'use-2', {}, baseContext)
    expect(result.success).toBe(false)
    expect(result.display).toContain('not found')
  })

  it('executeTool catches handler errors', async () => {
    const throwingHandler: ToolHandler = async () => {
      throw new Error('boom')
    }
    registerTool(makeDef('bad'), throwingHandler)
    const result = await executeTool('bad', 'use-3', {}, baseContext)
    expect(result.success).toBe(false)
    expect(result.display).toContain('boom')
  })

  it('clearRegistry removes all tools', () => {
    registerTool(makeDef('x'), makeHandler())
    clearRegistry()
    expect(getTool('x')).toBeUndefined()
    expect(getAllToolDefinitions()).toHaveLength(0)
  })
})

describe('tool-registry: scoped tools', () => {
  beforeEach(() => {
    clearRegistry()
  })

  it('createToolScope returns a UUID string', () => {
    const id = createToolScope()
    expect(id).toBeTruthy()
    expect(typeof id).toBe('string')
    // UUID v4 pattern
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('registerScopedTool adds tool to scope', () => {
    const scopeId = createToolScope()
    registerScopedTool(scopeId, makeDef('scoped_tool'), makeHandler('scoped'))
    const defs = getScopedToolDefinitions(scopeId)
    expect(defs).toHaveLength(1)
    expect(defs[0].name).toBe('scoped_tool')
  })

  it('registerScopedTool throws for unknown scope', () => {
    expect(() => {
      registerScopedTool('nonexistent-scope', makeDef('t'), makeHandler())
    }).toThrow('Tool scope nonexistent-scope not found')
  })

  it('scoped tools do not leak to global registry', () => {
    const scopeId = createToolScope()
    registerScopedTool(scopeId, makeDef('secret'), makeHandler())
    expect(getTool('secret')).toBeUndefined()
    expect(getAllToolDefinitions().find(d => d.name === 'secret')).toBeUndefined()
  })

  it('executeTool uses scoped tool when toolScopeId is set', async () => {
    const scopeId = createToolScope()
    registerScopedTool(scopeId, makeDef('scoped_exec'), makeHandler('from-scope'))
    const ctx = { ...baseContext, toolScopeId: scopeId }
    const result = await executeTool('scoped_exec', 'use-s1', {}, ctx)
    expect(result.success).toBe(true)
    expect(result.data).toBe('from-scope')
  })

  it('executeTool falls back to global when tool not in scope', async () => {
    const scopeId = createToolScope()
    registerTool(makeDef('global_tool'), makeHandler('from-global'))
    const ctx = { ...baseContext, toolScopeId: scopeId }
    const result = await executeTool('global_tool', 'use-g1', {}, ctx)
    expect(result.success).toBe(true)
    expect(result.data).toBe('from-global')
  })

  it('scoped tool takes priority over global tool with same name', async () => {
    const scopeId = createToolScope()
    registerTool(makeDef('overlap'), makeHandler('global-version'))
    registerScopedTool(scopeId, makeDef('overlap'), makeHandler('scoped-version'))
    const ctx = { ...baseContext, toolScopeId: scopeId }
    const result = await executeTool('overlap', 'use-o1', {}, ctx)
    expect(result.data).toBe('scoped-version')
  })

  it('destroyToolScope removes the scope', () => {
    const scopeId = createToolScope()
    registerScopedTool(scopeId, makeDef('temp'), makeHandler())
    destroyToolScope(scopeId)
    expect(getScopedToolDefinitions(scopeId)).toHaveLength(0)
  })

  it('executeTool returns not-found after scope is destroyed', async () => {
    const scopeId = createToolScope()
    registerScopedTool(scopeId, makeDef('ephemeral'), makeHandler())
    destroyToolScope(scopeId)
    const ctx = { ...baseContext, toolScopeId: scopeId }
    const result = await executeTool('ephemeral', 'use-e1', {}, ctx)
    expect(result.success).toBe(false)
    expect(result.display).toContain('not found')
  })

  it('multiple scopes are isolated from each other', () => {
    const scope1 = createToolScope()
    const scope2 = createToolScope()
    registerScopedTool(scope1, makeDef('tool_a'), makeHandler())
    registerScopedTool(scope2, makeDef('tool_b'), makeHandler())
    const defs1 = getScopedToolDefinitions(scope1)
    const defs2 = getScopedToolDefinitions(scope2)
    expect(defs1.map(d => d.name)).toEqual(['tool_a'])
    expect(defs2.map(d => d.name)).toEqual(['tool_b'])
  })
})
