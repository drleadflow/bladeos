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

function formatUsd(value: number): string {
  return `$${value.toFixed(4)}`
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(value)
}

export default function CostsPage() {
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
    () => (data ? Object.entries(data.byDay).sort(([a], [b]) => b.localeCompare(a)) : []),
    [data]
  )
  const maxModelCost = modelEntries.length > 0 ? Math.max(...modelEntries.map(([, v]) => v)) : 1

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <EmptyState
          title="Cost data unavailable"
          description={error ?? 'No cost data returned from the control plane.'}
        />
      </div>
    )
  }

  return (
    <PageShell
      eyebrow="Costs"
      title="Spend and token telemetry"
      description="Track model consumption, spot expensive workflows, and understand where Blade is burning budget across the system."
    >
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="30-day spend" value={formatUsd(data.totalUsd)} hint="Total spend across the current reporting window." accent="amber" />
        <MetricCard label="Input tokens" value={formatTokens(data.tokenCount.input)} hint="Prompt-side usage across all models." accent="cyan" />
        <MetricCard label="Output tokens" value={formatTokens(data.tokenCount.output)} hint="Completion-side usage across all models." accent="blue" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Panel glow="amber">
          <PanelHeader
            eyebrow="Model Mix"
            title="Spend by model"
            description="Where your budget is concentrated right now."
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
                      className="h-full rounded-full bg-gradient-to-r from-amber-300 via-cyan-300 to-blue-500"
                      style={{ width: `${(cost / maxModelCost) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel>
          <PanelHeader
            eyebrow="Daily Pulse"
            title="Spend by day"
            description="Recent daily cost movement."
          />
          {dayEntries.length === 0 ? (
            <EmptyState
              title="No daily records"
              description="Daily spend rows will populate as costs are recorded."
            />
          ) : (
            <div className="space-y-3">
              {dayEntries.map(([day, cost]) => (
                <div
                  key={day}
                  className="flex items-center justify-between rounded-[1.2rem] border border-white/10 bg-zinc-950/45 px-4 py-3 text-sm"
                >
                  <span className="text-zinc-400">{day}</span>
                  <span className="font-mono text-zinc-200">{formatUsd(cost)}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </PageShell>
  )
}
