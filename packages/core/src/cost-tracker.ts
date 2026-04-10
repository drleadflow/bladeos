import type { CostEntry } from './types.js'

// Pricing per 1M tokens (USD) as of 2026-04
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic (direct API)
  'claude-opus-4-20250514': { input: 15.0, output: 75.0 },
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
  'claude-haiku-4-20250514': { input: 0.80, output: 4.0 },
  // Anthropic aliases
  'claude-opus-4': { input: 15.0, output: 75.0 },
  'claude-sonnet-4': { input: 3.0, output: 15.0 },
  'claude-haiku-4': { input: 0.80, output: 4.0 },
  // OpenRouter Anthropic models
  'anthropic/claude-opus-4': { input: 15.0, output: 75.0 },
  'anthropic/claude-sonnet-4': { input: 3.0, output: 15.0 },
  'anthropic/claude-haiku-4.5': { input: 0.80, output: 4.0 },
  // OpenAI
  'gpt-4o': { input: 2.50, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4.1': { input: 2.0, output: 8.0 },
  'gpt-4.1-mini': { input: 0.40, output: 1.60 },
  'gpt-4.1-nano': { input: 0.10, output: 0.40 },
  'o3': { input: 10.0, output: 40.0 },
  'o3-mini': { input: 1.10, output: 4.40 },
  'o4-mini': { input: 1.10, output: 4.40 },
  // DeepSeek
  'deepseek-chat': { input: 0.14, output: 0.28 },
  'deepseek-reasoner': { input: 0.55, output: 2.19 },
  // Google
  'gemini-2.5-pro': { input: 1.25, output: 10.0 },
  'gemini-2.5-flash': { input: 0.15, output: 0.60 },
  // Claude CLI (subscription — estimate based on API equivalent)
  'claude-cli': { input: 3.0, output: 15.0 },
}

// Default fallback pricing if model not found
const DEFAULT_PRICING = { input: 3.0, output: 15.0 }

/**
 * Try to match a model ID to pricing, handling partial matches
 * for OpenRouter style model names like "anthropic/claude-sonnet-4:beta"
 */
function findPricing(model: string): { input: number; output: number } {
  // Exact match
  if (MODEL_PRICING[model]) return MODEL_PRICING[model]

  // Strip version suffixes (e.g., ":beta", ":free")
  const stripped = model.split(':')[0]
  if (MODEL_PRICING[stripped]) return MODEL_PRICING[stripped]

  // Try matching by base model name (e.g., "claude-sonnet-4" from "claude-sonnet-4-20250514")
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (model.includes(key) || key.includes(model)) {
      return pricing
    }
  }

  return DEFAULT_PRICING
}

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): CostEntry {
  const pricing = findPricing(model)

  const inputCostUsd = (inputTokens / 1_000_000) * pricing.input
  const outputCostUsd = (outputTokens / 1_000_000) * pricing.output

  return {
    model,
    inputTokens,
    outputTokens,
    inputCostUsd: Math.round(inputCostUsd * 1_000_000) / 1_000_000,
    outputCostUsd: Math.round(outputCostUsd * 1_000_000) / 1_000_000,
    totalCostUsd: Math.round((inputCostUsd + outputCostUsd) * 1_000_000) / 1_000_000,
    timestamp: new Date().toISOString(),
  }
}

export function formatCost(usd: number): string {
  if (usd < 0.01) return `$${(usd * 100).toFixed(2)}c`
  return `$${usd.toFixed(4)}`
}

export function isWithinBudget(spent: number, budget: number): boolean {
  if (budget <= 0) return true // 0 = unlimited
  return spent < budget
}
