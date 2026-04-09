/**
 * Policy Resolver — Determines which tools and model an employee
 * is allowed to use in a conversation.
 */

import type { ExecutionAPI } from '@blade/core'
import type { ToolDefinition } from '@blade/core'

export interface PolicyResult {
  tools: ToolDefinition[]
  toolScopeId?: string
}

/**
 * Resolve the tool set for a conversation.
 * If employeeId is provided and has allowedTools, create a filtered scope.
 * Otherwise, return the full global tool set.
 */
export function resolvePolicy(
  executionApi: ExecutionAPI,
  employeeId?: string,
  allowedTools?: readonly string[]
): PolicyResult {
  if (employeeId && allowedTools && allowedTools.length > 0) {
    const scopeId = executionApi.createFilteredScope(allowedTools)
    const tools = executionApi.getScopedToolDefinitions(scopeId)
    return { tools, toolScopeId: scopeId }
  }

  return { tools: executionApi.getToolDefinitions() }
}

/**
 * Clean up a tool scope after a conversation turn completes.
 */
export function cleanupScope(executionApi: ExecutionAPI, scopeId?: string): void {
  if (scopeId) {
    executionApi.destroyToolScope(scopeId)
  }
}
