import type { ModelConfig } from '../types.js'
import { resolveSmartModelConfig } from '../model-provider.js'
import { analyzeComplexity } from './complexity-analyzer.js'
import type { ExtendedComplexity } from './complexity-analyzer.js'
import { logger } from '@blade/shared'

export interface CostRouterResult {
  config: ModelConfig
  detectedComplexity: ExtendedComplexity
  reason: string
}

/**
 * Auto-detect message complexity and resolve the cheapest capable model.
 * Acknowledgments → Haiku, simple → Haiku, standard → Sonnet, heavy → Sonnet/Opus
 */
export function autoRouteModel(
  message: string,
  options?: { needsToolCalling?: boolean; forceComplexity?: ExtendedComplexity }
): CostRouterResult {
  const complexity = options?.forceComplexity ?? analyzeComplexity(message)

  // Map extended complexity to TaskComplexity
  const mappedComplexity = complexity === 'acknowledgment' ? 'light' : complexity

  const config = resolveSmartModelConfig(mappedComplexity, {
    needsToolCalling: options?.needsToolCalling,
  })

  const reason = complexity === 'acknowledgment'
    ? 'Simple acknowledgment → routed to cheapest model'
    : `Detected complexity: ${complexity}`

  logger.debug('CostRouter', `${reason} → ${config.provider}/${config.modelId}`)

  return { config, detectedComplexity: complexity, reason }
}

/**
 * Track consecutive failures for auto-upgrade.
 * If cheap model fails 2+ times in a row, upgrade to next tier.
 */
const failureCounts = new Map<string, number>()

export function recordModelFailure(configKey: string): ExtendedComplexity | null {
  const count = (failureCounts.get(configKey) ?? 0) + 1
  failureCounts.set(configKey, count)

  if (count >= 2) {
    failureCounts.delete(configKey)
    return 'standard' // Upgrade from light/acknowledgment to standard
  }

  return null // No upgrade needed yet
}

export function recordModelSuccess(configKey: string): void {
  failureCounts.delete(configKey)
}

export function getConfigKey(config: ModelConfig): string {
  return `${config.provider}:${config.modelId}`
}
