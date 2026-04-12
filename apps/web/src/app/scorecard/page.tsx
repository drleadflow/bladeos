'use client'

import { useEffect, useState } from 'react'
import {
  PageShell,
  Panel,
  PanelHeader,
  MetricCard,
  Badge,
  StatusDot,
  EmptyState,
} from '@/components/dashboard/cockpit-ui'

interface KpiItem {
  id: string
  employeeId: string
  name: string
  unit: string
  target: number
  currentValue: number | null
  status: string
  measuredAt: string | null
}

function formatValue(value: number | null, unit: string): string {
  if (value === null) return '—'
  if (unit === 'percent') return `${value}%`
  if (unit === 'usd') return `$${value.toLocaleString()}`
  return String(value)
}

function statusTone(s: string): 'emerald' | 'amber' | 'rose' | 'neutral' {
  if (s === 'green') return 'emerald'
  if (s === 'yellow') return 'amber'
  if (s === 'red') return 'rose'
  return 'neutral'
}

function employeeLabel(employeeId: string): string {
  return employeeId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function groupBadgeTone(items: KpiItem[]): 'emerald' | 'amber' | 'rose' | 'neutral' {
  if (items.some(k => k.status === 'red')) return 'rose'
  if (items.some(k => k.status === 'yellow')) return 'amber'
  if (items.every(k => k.status === 'green')) return 'emerald'
  return 'neutral'
}

export default function ScorecardPage() {
  const [kpis, setKpis] = useState<KpiItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/scorecard')
      .then(r => r.json())
      .then((json: { success: boolean; data?: KpiItem[] }) => {
        if (json.success && json.data) setKpis(json.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const grouped = kpis.reduce<Record<string, KpiItem[]>>((acc, kpi) => {
    if (!acc[kpi.employeeId]) acc[kpi.employeeId] = []
    acc[kpi.employeeId].push(kpi)
    return acc
  }, {})

  const total = kpis.length
  const greenCount = kpis.filter(k => k.status === 'green').length
  const yellowCount = kpis.filter(k => k.status === 'yellow').length
  const redCount = kpis.filter(k => k.status === 'red').length
  const healthPct = total > 0 ? Math.round((greenCount / total) * 100) : 0

  return (
    <PageShell
      eyebrow="Business Health"
      title="Scorecard"
      description="G/Y/R business health metrics — real-time pulse on what matters most"
    >
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard label="Health Score" value={`${healthPct}%`} accent="emerald" />
        <MetricCard label="Green" value={greenCount} accent="emerald" />
        <MetricCard label="Yellow" value={yellowCount} accent="amber" />
        <MetricCard label="Red" value={redCount} accent="rose" />
      </div>

      {loading ? (
        <Panel>
          <p className="py-8 text-center text-zinc-500">Loading scorecard...</p>
        </Panel>
      ) : kpis.length === 0 ? (
        <EmptyState
          title="No KPIs measured yet"
          description="KPIs are measured automatically every 6 hours. Run `blade evolve` to trigger a measurement."
        />
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([employeeId, items]) => (
            <Panel key={employeeId}>
              <PanelHeader
                eyebrow="Employee"
                title={employeeLabel(employeeId)}
                aside={
                  <Badge tone={groupBadgeTone(items)}>
                    {items.filter(k => k.status === 'green').length}/{items.length} healthy
                  </Badge>
                }
              />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map(kpi => (
                  <div
                    key={kpi.id}
                    className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-zinc-300">{kpi.name}</span>
                      <StatusDot tone={statusTone(kpi.status)} />
                    </div>
                    <p className="mt-2 text-2xl font-semibold text-zinc-100">
                      {formatValue(kpi.currentValue, kpi.unit)}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Target: {formatValue(kpi.target, kpi.unit)}
                      {' · '}
                      {kpi.measuredAt
                        ? `Updated ${new Date(kpi.measuredAt).toLocaleTimeString()}`
                        : 'Not measured'}
                    </p>
                  </div>
                ))}
              </div>
            </Panel>
          ))}
        </div>
      )}
    </PageShell>
  )
}
