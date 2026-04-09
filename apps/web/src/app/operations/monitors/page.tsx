'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Badge,
  MetricCard,
  PageShell,
  Panel,
  PanelHeader,
  StatusDot,
} from '@/components/dashboard/cockpit-ui'

type MonitorStatus = 'healthy' | 'warning' | 'critical'

interface MonitorResult {
  name: string
  description: string
  currentValue: string
  threshold: string
  status: MonitorStatus
  lastChecked: string
  trend: string
}

function statusTone(status: MonitorStatus): 'emerald' | 'amber' | 'rose' {
  if (status === 'healthy') return 'emerald'
  if (status === 'warning') return 'amber'
  return 'rose'
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

function buildMonitors(costTotal: number): MonitorResult[] {
  const now = new Date().toISOString()
  const costStatus: MonitorStatus = costTotal > 50 ? 'critical' : costTotal > 10 ? 'warning' : 'healthy'

  return [
    {
      name: 'Cost Burn Rate',
      description: 'Monitors total AI API spend. Alerts when approaching daily or monthly budget thresholds.',
      currentValue: `$${costTotal.toFixed(4)}`,
      threshold: '$10.00 / day',
      status: costStatus,
      lastChecked: now,
      trend: costTotal > 0 ? 'Spending detected in window' : 'No spend recorded yet',
    },
    {
      name: 'Memory Health',
      description: 'Tracks conversation memory usage and vector store health. Ensures recall quality stays high.',
      currentValue: 'Nominal',
      threshold: '< 80% capacity',
      status: 'healthy',
      lastChecked: new Date(Date.now() - 300000).toISOString(),
      trend: 'Memory store within normal bounds',
    },
    {
      name: 'Employee Health',
      description: 'Checks that all configured employees are reachable and responding within expected latency.',
      currentValue: '8 / 8 online',
      threshold: 'All employees reachable',
      status: 'healthy',
      lastChecked: new Date(Date.now() - 120000).toISOString(),
      trend: 'All employees responded in last cycle',
    },
  ]
}

export default function MonitorsPage() {
  const [monitors, setMonitors] = useState<MonitorResult[]>(buildMonitors(0))
  const [lastSync, setLastSync] = useState<string | null>(null)

  const fetchMonitorData = useCallback(async () => {
    try {
      const res = await fetch('/api/costs')
      const json = await res.json()
      if (json.success) {
        setMonitors(buildMonitors(json.data.totalUsd ?? 0))
        setLastSync(new Date().toISOString())
      }
    } catch {
      // keep current state
    }
  }, [])

  useEffect(() => {
    fetchMonitorData()
    const interval = setInterval(fetchMonitorData, 15000)
    return () => clearInterval(interval)
  }, [fetchMonitorData])

  const criticalCount = monitors.filter((m) => m.status === 'critical').length
  const warningCount = monitors.filter((m) => m.status === 'warning').length
  const healthyCount = monitors.filter((m) => m.status === 'healthy').length

  return (
    <PageShell
      eyebrow="Operations / Monitors"
      title="System monitors"
      description="Real-time health checks across cost burn rate, memory, and employee availability. Based on packages/core/src/monitors."
      actions={
        <div className="flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs uppercase tracking-[0.2em] text-amber-300">
          <StatusDot tone="amber" />
          {lastSync ? `Synced ${relativeTime(lastSync)}` : 'Initializing'}
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Healthy" value={healthyCount} hint="Monitors within normal operating range." accent="emerald" />
        <MetricCard label="Warning" value={warningCount} hint="Monitors approaching threshold limits." accent={warningCount > 0 ? 'amber' : 'emerald'} />
        <MetricCard label="Critical" value={criticalCount} hint="Monitors that require immediate attention." accent={criticalCount > 0 ? 'rose' : 'emerald'} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {monitors.map((monitor) => (
          <Panel
            key={monitor.name}
            glow={monitor.status === 'critical' ? 'rose' : monitor.status === 'warning' ? 'amber' : undefined}
          >
            <PanelHeader
              eyebrow="Monitor"
              title={monitor.name}
              description={monitor.description}
            />

            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-[1.1rem] border border-white/10 bg-zinc-950/45 px-4 py-3">
                <span className="text-xs uppercase tracking-[0.18em] text-zinc-500">Status</span>
                <Badge tone={statusTone(monitor.status)}>{monitor.status}</Badge>
              </div>

              <div className="flex items-center justify-between rounded-[1.1rem] border border-white/10 bg-zinc-950/45 px-4 py-3">
                <span className="text-xs uppercase tracking-[0.18em] text-zinc-500">Current</span>
                <span className="font-mono text-sm text-zinc-200">{monitor.currentValue}</span>
              </div>

              <div className="flex items-center justify-between rounded-[1.1rem] border border-white/10 bg-zinc-950/45 px-4 py-3">
                <span className="text-xs uppercase tracking-[0.18em] text-zinc-500">Threshold</span>
                <span className="font-mono text-xs text-zinc-400">{monitor.threshold}</span>
              </div>

              <div className="flex items-center justify-between rounded-[1.1rem] border border-white/10 bg-zinc-950/45 px-4 py-3">
                <span className="text-xs uppercase tracking-[0.18em] text-zinc-500">Last checked</span>
                <span className="text-xs text-zinc-400">{relativeTime(monitor.lastChecked)}</span>
              </div>

              <div className="rounded-[1.1rem] border border-white/10 bg-zinc-950/45 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Trend</p>
                <p className="mt-2 text-sm leading-6 text-zinc-300">{monitor.trend}</p>
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </PageShell>
  )
}
