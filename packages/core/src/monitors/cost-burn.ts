import { costEntries } from '@blade/db'
import { loadConfig } from '@blade/shared'
import type { MonitorDefinition, MonitorCheckResult } from './types.js'

const DEFAULT_MONTHLY_BUDGET = 150

function getDailyBudget(): number {
  const config = loadConfig()
  const monthly = config.costBudget > 0 ? config.costBudget : DEFAULT_MONTHLY_BUDGET
  return monthly / 30
}

export const costBurnMonitor: MonitorDefinition = {
  id: 'cost-burn-rate',
  name: 'Cost Burn Rate',
  description: 'Tracks daily AI spending against budget, comparing to 7-day moving average',
  sourceType: 'internal',
  checkSchedule: '0 */6 * * *',
  thresholds: { ok: 0.8, warning: 1.0, critical: 1.2 },

  async check(): Promise<MonitorCheckResult> {
    const dailyBudget = getDailyBudget()
    const todaySummary = costEntries.summary(1)
    const weeklySummary = costEntries.summary(7)

    const todaySpend = todaySummary.totalUsd
    const weeklyAvg = weeklySummary.totalUsd / 7
    const budgetRatio = todaySpend / dailyBudget

    const status: MonitorCheckResult['status'] =
      budgetRatio >= costBurnMonitor.thresholds.critical ? 'critical' :
      budgetRatio >= costBurnMonitor.thresholds.ok ? 'warning' :
      'ok'

    const message =
      status === 'critical'
        ? `Daily spend $${todaySpend.toFixed(2)} exceeds budget $${dailyBudget.toFixed(2)} (${(budgetRatio * 100).toFixed(0)}%)`
        : status === 'warning'
          ? `Daily spend $${todaySpend.toFixed(2)} approaching budget $${dailyBudget.toFixed(2)} (${(budgetRatio * 100).toFixed(0)}%)`
          : `Daily spend $${todaySpend.toFixed(2)} within budget $${dailyBudget.toFixed(2)} (${(budgetRatio * 100).toFixed(0)}%)`

    return {
      value: budgetRatio,
      status,
      message,
      details: {
        todaySpendUsd: todaySpend,
        dailyBudgetUsd: dailyBudget,
        weeklyAvgUsd: weeklyAvg,
        budgetRatio,
        byModel: todaySummary.byModel,
      },
    }
  },
}
