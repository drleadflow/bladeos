'use client'

import { useState } from 'react'
import {
  Badge,
  MetricCard,
  PageShell,
  Panel,
  PanelHeader,
} from '@/components/dashboard/cockpit-ui'

type WorkflowStatus = 'running' | 'completed' | 'failed' | 'queued'

interface WorkflowRun {
  id: string
  type: string
  status: WorkflowStatus
  startedAt: string
  durationMs: number | null
  steps: number
  completedSteps: number
}

function statusTone(status: WorkflowStatus): 'cyan' | 'emerald' | 'rose' | 'amber' {
  if (status === 'running') return 'cyan'
  if (status === 'completed') return 'emerald'
  if (status === 'failed') return 'rose'
  return 'amber'
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

// TODO: Replace with real /api/workflows endpoint when available
const MOCK_WORKFLOWS: WorkflowRun[] = [
  { id: 'wf-001', type: 'lead-nurture', status: 'running', startedAt: new Date(Date.now() - 120000).toISOString(), durationMs: null, steps: 6, completedSteps: 3 },
  { id: 'wf-002', type: 'onboarding-sequence', status: 'completed', startedAt: new Date(Date.now() - 3600000).toISOString(), durationMs: 187400, steps: 8, completedSteps: 8 },
  { id: 'wf-003', type: 'daily-digest', status: 'completed', startedAt: new Date(Date.now() - 86400000).toISOString(), durationMs: 23100, steps: 4, completedSteps: 4 },
  { id: 'wf-004', type: 'employee-sync', status: 'failed', startedAt: new Date(Date.now() - 7200000).toISOString(), durationMs: 4200, steps: 5, completedSteps: 2 },
  { id: 'wf-005', type: 'cost-report', status: 'queued', startedAt: new Date(Date.now() - 300000).toISOString(), durationMs: null, steps: 3, completedSteps: 0 },
  { id: 'wf-006', type: 'lead-nurture', status: 'completed', startedAt: new Date(Date.now() - 172800000).toISOString(), durationMs: 94500, steps: 6, completedSteps: 6 },
  { id: 'wf-007', type: 'monitor-sweep', status: 'completed', startedAt: new Date(Date.now() - 43200000).toISOString(), durationMs: 11800, steps: 3, completedSteps: 3 },
]

type FilterStatus = 'all' | WorkflowStatus

const FILTER_OPTIONS: { label: string; value: FilterStatus }[] = [
  { label: 'All', value: 'all' },
  { label: 'Running', value: 'running' },
  { label: 'Completed', value: 'completed' },
  { label: 'Failed', value: 'failed' },
  { label: 'Queued', value: 'queued' },
]

export default function WorkflowRunsPage() {
  const [filter, setFilter] = useState<FilterStatus>('all')

  const filtered = filter === 'all' ? MOCK_WORKFLOWS : MOCK_WORKFLOWS.filter((w) => w.status === filter)

  const running = MOCK_WORKFLOWS.filter((w) => w.status === 'running').length
  const failed = MOCK_WORKFLOWS.filter((w) => w.status === 'failed').length
  const completed = MOCK_WORKFLOWS.filter((w) => w.status === 'completed').length

  return (
    <PageShell
      eyebrow="Operations / Workflows"
      title="Workflow runs"
      description="Inspect every multi-step workflow execution — status, duration, step progress, and type at a glance."
    >
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Running" value={running} hint="Workflows actively executing right now." accent="cyan" />
        <MetricCard label="Completed" value={completed} hint="Successful runs in this view." accent="emerald" />
        <MetricCard label="Failed" value={failed} hint="Workflows that need attention." accent={failed > 0 ? 'rose' : 'amber'} />
      </div>

      <div className="mt-4">
        <Panel glow="amber">
          <PanelHeader
            eyebrow="Executions"
            title="Workflow run history"
            description="Each row is a single workflow execution. Drill into failed runs to understand which step broke."
          />

          <div className="mb-4 flex flex-wrap gap-2">
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilter(opt.value)}
                className={`rounded-full px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] transition-all ${
                  filter === opt.value
                    ? 'bg-amber-400 text-zinc-950'
                    : 'border border-white/10 bg-white/[0.04] text-zinc-400 hover:border-amber-400/20 hover:bg-white/[0.08] hover:text-zinc-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="pb-3 pr-4 text-left text-xs uppercase tracking-[0.18em] text-zinc-500">Workflow ID</th>
                  <th className="pb-3 pr-4 text-left text-xs uppercase tracking-[0.18em] text-zinc-500">Type</th>
                  <th className="pb-3 pr-4 text-left text-xs uppercase tracking-[0.18em] text-zinc-500">Status</th>
                  <th className="pb-3 pr-4 text-left text-xs uppercase tracking-[0.18em] text-zinc-500">Started</th>
                  <th className="pb-3 pr-4 text-left text-xs uppercase tracking-[0.18em] text-zinc-500">Duration</th>
                  <th className="pb-3 text-left text-xs uppercase tracking-[0.18em] text-zinc-500">Steps</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {filtered.map((wf) => (
                  <tr key={wf.id} className="transition-colors hover:bg-white/[0.03]">
                    <td className="py-3 pr-4 font-mono text-xs text-zinc-400">{wf.id}</td>
                    <td className="py-3 pr-4 text-sm text-zinc-200">{wf.type}</td>
                    <td className="py-3 pr-4">
                      <Badge tone={statusTone(wf.status)}>{wf.status}</Badge>
                    </td>
                    <td className="py-3 pr-4 text-xs text-zinc-500">{relativeTime(wf.startedAt)}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-zinc-400">{formatDuration(wf.durationMs)}</td>
                    <td className="py-3 text-xs">
                      <span className={wf.completedSteps === wf.steps ? 'text-emerald-400' : wf.status === 'failed' ? 'text-rose-400' : 'text-zinc-300'}>
                        {wf.completedSteps}
                      </span>
                      <span className="text-zinc-600"> / {wf.steps}</span>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-sm text-zinc-500">
                      No workflow runs match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-xs text-zinc-600">
            Showing mock data. Connect a real workflow API to populate live runs.
          </p>
        </Panel>
      </div>
    </PageShell>
  )
}
