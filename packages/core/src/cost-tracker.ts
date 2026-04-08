import type { CostEntry } from './types.js'

// Pricing per 1M tokens (USD) as of 2026-04
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic
  'claude-opus-4-20250514': { input: 15.0, output: 75.0 },
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
  'claude-haiku-4-20250514': { input: 0.80, output: 4.0 },
  // Aliases
  'claude-opus-4': { input: 15.0, output: 75.0 },
  'claude-sonnet-4': { input: 3.0, output: 15.0 },
  'claude-haiku-4': { input: 0.80, output: 4.0 },
  // OpenAI
  'gpt-4o': { input: 2.50, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'o3': { input: 10.0, output: 40.0 },
  'o3-mini': { input: 1.10, output: 4.40 },
  // DeepSeek
  'deepseek-chat': { input: 0.14, output: 0.28 },
  'deepseek-reasoner': { input: 0.55, output: 2.19 },
}

// Default fallback pricing if model not found
const DEFAULT_PRICING = { input: 3.0, output: 15.0 }

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): CostEntry {
  const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING

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
