'use client'

import { useState } from 'react'
import {
  Badge,
  MetricCard,
  PageShell,
  Panel,
  PanelHeader,
} from '@/components/dashboard/cockpit-ui'

interface AutomationRule {
  id: string
  name: string
  trigger: string
  action: string
  enabled: boolean
  lastTriggered: string | null
  runCount: number
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

const INITIAL_AUTOMATIONS: AutomationRule[] = [
  {
    id: 'auto-001',
    name: 'New Lead Welcome',
    trigger: 'Lead created in GHL',
    action: 'Send welcome sequence via ManyChat',
    enabled: true,
    lastTriggered: new Date(Date.now() - 1800000).toISOString(),
    runCount: 142,
  },
  {
    id: 'auto-002',
    name: 'Daily Cost Report',
    trigger: 'Every day at 08:00 UTC',
    action: 'Generate and post cost summary to Telegram',
    enabled: true,
    lastTriggered: new Date(Date.now() - 86400000).toISOString(),
    runCount: 31,
  },
  {
    id: 'auto-003',
    name: 'Failed Worker Alert',
    trigger: 'Worker status changes to failed',
    action: 'Notify Telegram + log to activity feed',
    enabled: true,
    lastTriggered: new Date(Date.now() - 259200000).toISOString(),
    runCount: 7,
  },
  {
    id: 'auto-004',
    name: 'Lead Score Threshold',
    trigger: 'Lead score exceeds 80',
    action: 'Assign to closer and create task',
    enabled: false,
    lastTriggered: null,
    runCount: 0,
  },
  {
    id: 'auto-005',
    name: 'Weekly Digest',
    trigger: 'Every Monday at 09:00 UTC',
    action: 'Compile weekly KPIs and send to team',
    enabled: true,
    lastTriggered: new Date(Date.now() - 604800000).toISOString(),
    runCount: 12,
  },
  {
    id: 'auto-006',
    name: 'Memory Pruning',
    trigger: 'Memory store exceeds 75% capacity',
    action: 'Run conversation summarisation and archive old threads',
    enabled: false,
    lastTriggered: null,
    runCount: 3,
  },
]

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<AutomationRule[]>(INITIAL_AUTOMATIONS)

  function toggleAutomation(id: string) {
    setAutomations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a))
    )
  }

  const enabledCount = automations.filter((a) => a.enabled).length
  const disabledCount = automations.filter((a) => !a.enabled).length
  const totalRuns = automations.reduce((sum, a) => sum + a.runCount, 0)

  return (
    <PageShell
      eyebrow="Operations / Automations"
      title="Automation rules"
      description="Trigger-action logic that keeps Blade running on autopilot. Toggle rules on or off without touching code."
    >
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Active Rules" value={enabledCount} hint="Automation rules currently enabled." accent="amber" />
        <MetricCard label="Disabled Rules" value={disabledCount} hint="Rules that are toggled off." accent="blue" />
        <MetricCard label="Total Runs" value={totalRuns} hint="Cumulative executions across all rules." accent="cyan" />
      </div>

      <div className="mt-4">
        <Panel glow="amber">
          <PanelHeader
            eyebrow="Rules"
            title="All automation rules"
            description="Each rule maps a trigger condition to an action. Toggle to enable or disable without deleting."
          />

          <div className="space-y-3">
            {automations.map((automation) => (
              <div
                key={automation.id}
                className={`rounded-[1.35rem] border px-5 py-4 transition-colors ${
                  automation.enabled
                    ? 'border-amber-400/15 bg-amber-400/[0.04]'
                    : 'border-white/10 bg-zinc-950/45'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge tone={automation.enabled ? 'amber' : 'neutral'}>
                        {automation.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                      <span className="font-mono text-xs text-zinc-600">{automation.id}</span>
                    </div>
                    <h3 className="text-base font-semibold text-zinc-100">{automation.name}</h3>
                    <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
                      <div className="rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-2">
                        <p className="uppercase tracking-[0.15em] text-zinc-600">Trigger</p>
                        <p className="mt-1 text-zinc-300">{automation.trigger}</p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-2">
                        <p className="uppercase tracking-[0.15em] text-zinc-600">Action</p>
                        <p className="mt-1 text-zinc-300">{automation.action}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-500">
                      <span>Last triggered: {relativeTime(automation.lastTriggered)}</span>
                      <span>Runs: {automation.runCount}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleAutomation(automation.id)}
                    aria-label={automation.enabled ? 'Disable automation' : 'Enable automation'}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                      automation.enabled ? 'bg-amber-400' : 'bg-zinc-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${
                        automation.enabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </PageShell>
  )
}
