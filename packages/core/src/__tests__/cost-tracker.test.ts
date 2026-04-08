import { describe, it, expect } from 'vitest'
import { calculateCost, formatCost, isWithinBudget } from '../cost-tracker.js'

describe('cost-tracker: calculateCost', () => {
  it('returns correct cost for claude-sonnet-4', () => {
    const cost = calculateCost('claude-sonnet-4', 1_000_000, 1_000_000)
    expect(cost.inputCostUsd).toBe(3.0)
    expect(cost.outputCostUsd).toBe(15.0)
    expect(cost.totalCostUsd).toBe(18.0)
  })

  it('returns correct cost for gpt-4o', () => {
    const cost = calculateCost('gpt-4o', 1_000_000, 1_000_000)
    expect(cost.inputCostUsd).toBe(2.5)
    expect(cost.outputCostUsd).toBe(10.0)
    expect(cost.totalCostUsd).toBe(12.5)
  })

  it('returns correct cost for gpt-4o-mini', () => {
    const cost = calculateCost('gpt-4o-mini', 500_000, 200_000)
    expect(cost.inputCostUsd).toBeCloseTo(0.075, 6)
    expect(cost.outputCostUsd).toBeCloseTo(0.12, 6)
  })

  it('uses default pricing for unknown model', () => {
    const cost = calculateCost('unknown-model-xyz', 1_000_000, 1_000_000)
    // Default: input=3.0, output=15.0 per 1M tokens
    expect(cost.inputCostUsd).toBe(3.0)
    expect(cost.outputCostUsd).toBe(15.0)
    expect(cost.totalCostUsd).toBe(18.0)
  })

  it('returns zero cost for zero tokens', () => {
    const cost = calculateCost('claude-sonnet-4', 0, 0)
    expect(cost.totalCostUsd).toBe(0)
  })

  it('includes model and token counts in the entry', () => {
    const cost = calculateCost('claude-haiku-4', 100, 200)
    expect(cost.model).toBe('claude-haiku-4')
    expect(cost.inputTokens).toBe(100)
    expect(cost.outputTokens).toBe(200)
    expect(cost.timestamp).toBeTruthy()
  })
})

describe('cost-tracker: formatCost', () => {
  it('formats cost above 1 cent as dollars', () => {
    expect(formatCost(1.5)).toBe('$1.5000')
    expect(formatCost(0.01)).toBe('$0.0100')
  })

  it('formats cost below 1 cent as cents', () => {
    expect(formatCost(0.005)).toBe('$0.50c')
    expect(formatCost(0.001)).toBe('$0.10c')
  })

  it('formats zero', () => {
    expect(formatCost(0)).toBe('$0.00c')
  })
})

describe('cost-tracker: isWithinBudget', () => {
  it('returns true when spent is under budget', () => {
    expect(isWithinBudget(1.0, 5.0)).toBe(true)
  })

  it('returns false when spent equals budget', () => {
    expect(isWithinBudget(5.0, 5.0)).toBe(false)
  })

  it('returns false when spent exceeds budget', () => {
    expect(isWithinBudget(6.0, 5.0)).toBe(false)
  })

  it('returns true for zero budget (unlimited)', () => {
    expect(isWithinBudget(999.0, 0)).toBe(true)
  })

  it('returns true for negative budget (unlimited)', () => {
    expect(isWithinBudget(999.0, -1)).toBe(true)
  })
})
