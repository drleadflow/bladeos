'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  EmptyState,
  MetricCard,
  PageShell,
  Panel,
  PanelHeader,
} from '@/components/dashboard/cockpit-ui'

interface CostData {
  totalUsd: number
  byModel: Record<string, number>
  byDay: Record<string, number>
  tokenCount: { input: number; output: number }
}

const PLAN_FEATURES = [
  'Unlimited AI employee tasks',
  'All 8 built-in employees',
  'GHL, Airtable, Telegram integrations',
  'Full Memory & SOPs access',
  'Priority support',
]

function formatUsd(value: number): string {
  return `$${value.toFixed(4)}`
}

function formatUsdShort(value: number): string {
  return `$${value.toFixed(2)}`
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(value)
}

export default function BillingPage() {
  const [data, setData] = useState<CostData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchCosts() {
      try {
        const res = await fetch('/api/costs')
        const json = await res.json()
        if (json.success) {
          setData(json.data)
        } else {
          setError(json.error ?? 'Failed to load costs')
        }
      } catch {
        setError('Network error')
      } finally {
        setLoading(false)
      }
    }
    fetchCosts()
  }, [])

  const modelEntries = useMemo(
    () => (data ? Object.entries(data.byModel).sort(([, a], [, b]) => b - a) : []),
    [data]
  )

  const dayEntries = useMemo(
    () => (data ? Object.entries(data.byDay).sort(([a], [b]) => b.localeCompare(a)).slice(0, 14) : []),
    [data]
  )

  const maxModelCost = modelEntries.length > 0 ? Math.max(...modelEntries.map(([, v]) => v)) : 1
  const maxDayCost = dayEntries.length > 0 ? Math.max(...dayEntries.map(([, v]) => v)) : 1

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div
          className="h-10 w-10 animate-spin rounded-full border-2"
          style={{ borderColor: '#94a3b8', borderTopColor: 'transparent' }}
        />
      </div>
    )
  }

  return (
    <PageShell
      eyebrow="Control / Billing"
      title="Billing & usage"
      description="Subscription plan, AI model spend, and token consumption across your entire Blade OS instance."
    >
      {/* Plan card */}
      <div className="mb-4 rounded-[1.75rem] border border-slate-400/20 bg-slate-400/5 p-5 backdrop-blur-xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-400">Current Plan</p>
            <h2 className="mt-1 text-2xl font-semibold text-zinc-50">Blade OS Beta</h2>
            <p className="mt-1 text-sm text-zinc-400">$497 / month · Renews May 1, 2025</p>
          </div>
          <div className="flex gap-3">
            <button className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-zinc-300 hover:bg-white/[0.08] transition-colors">
              View Invoice
            </button>
            <button
              className="rounded-2xl px-4 py-2.5 text-sm font-semibold text-zinc-950 transition-transform duration-200 hover:scale-[1.01]"
              style={{ background: 'linear-gradient(to right, #94a3b8, #64748b)' }}
            >
              Manage Plan
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          {PLAN_FEATURES.map((f) => (
            <span key={f} className="flex items-center gap-1.5 text-xs text-zinc-400">
              <span style={{ color: '#94a3b8' }}>✓</span>
              {f}
            </span>
          ))}
        </div>
      </div>

      {/* Metrics */}
      {data ? (
        <>
          <div className="grid gap-4 md:grid-cols-3 mb-4">
            <MetricCard
              label="30-day AI spend"
              value={formatUsdShort(data.totalUsd)}
              hint="Total model cost across the current billing window."
              accent="amber"
            />
            <MetricCard
              label="Input tokens"
              value={formatTokens(data.tokenCount.input)}
              hint="Prompt-side tokens consumed across all models."
              accent="cyan"
            />
            <MetricCard
              label="Output tokens"
              value={formatTokens(data.tokenCount.output)}
              hint="Completion-side tokens generated across all models."
              accent="blue"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            {/* Model breakdown */}
            <Panel>
              <PanelHeader
                eyebrow="Model Mix"
                title="Spend by model"
                description="Where your AI budget is concentrated this month."
              />
              {modelEntries.length === 0 ? (
                <EmptyState
                  title="No model spend yet"
                  description="As Blade uses models, the distribution will appear here."
                />
              ) : (
                <div className="space-y-4">
                  {modelEntries.map(([model, cost]) => (
                    <div key={model}>
                      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                        <span className="truncate text-zinc-200">{model}</span>
                        <span className="font-mono text-zinc-400">{formatUsd(cost)}</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-zinc-950/70">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(cost / maxModelCost) * 100}%`,
                            background: 'linear-gradient(to right, #94a3b8, #475569)',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            {/* Daily bar chart */}
            <Panel>
              <PanelHeader
                eyebrow="Daily Pulse"
                title="Last 14 days"
                description="Daily cost movement as a bar chart."
              />
              {dayEntries.length === 0 ? (
                <EmptyState
                  title="No daily records"
                  description="Daily spend rows will populate as costs are recorded."
                />
              ) : (
                <div className="flex h-48 items-end gap-1">
                  {dayEntries
                    .slice()
                    .reverse()
                    .map(([day, cost]) => {
                      const heightPct = maxDayCost > 0 ? (cost / maxDayCost) * 100 : 0
                      return (
                        <div key={day} className="group relative flex-1 flex flex-col items-center justify-end">
                          <div
                            className="w-full rounded-t-lg transition-all duration-200 group-hover:opacity-80"
                            style={{
                              height: `${Math.max(heightPct, 4)}%`,
                              background: 'linear-gradient(to top, #475569, #94a3b8)',
                            }}
                          />
                          {/* Tooltip */}
                          <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block whitespace-nowrap rounded-lg border border-white/10 bg-zinc-900 px-2 py-1 text-[10px] text-zinc-300 z-10">
                            {formatUsd(cost)}
                          </div>
                        </div>
                      )
                    })}
                </div>
              )}
              {dayEntries.length > 0 && (
                <div className="mt-2 flex justify-between text-[10px] text-zinc-600">
                  <span>{dayEntries[dayEntries.length - 1]?.[0]}</span>
                  <span>{dayEntries[0]?.[0]}</span>
                </div>
              )}
            </Panel>
          </div>
        </>
      ) : (
        <EmptyState
          title="Cost data unavailable"
          description={error ?? 'No cost data returned. Run some tasks to start tracking spend.'}
        />
      )}
    </PageShell>
  )
}
