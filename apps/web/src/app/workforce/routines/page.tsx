'use client'

import { useState } from 'react'
import { PageShell, Panel, PanelHeader, MetricCard } from '@/components/dashboard/cockpit-ui'

// TODO: Replace with real API when /api/routines is implemented
interface Routine {
  id: string
  name: string
  employee: string
  schedule: string
  scheduleLabel: string
  lastRun: string
  nextRun: string
  status: 'active' | 'paused' | 'error'
  category: string
}

const MOCK_ROUTINES: Routine[] = [
  {
    id: 'r1',
    name: 'Morning Standup Brief',
    employee: 'Operator',
    schedule: '0 8 * * 1-5',
    scheduleLabel: 'Weekdays at 8:00 AM',
    lastRun: '2026-04-09 08:00',
    nextRun: '2026-04-10 08:00',
    status: 'active',
    category: 'Operations',
  },
  {
    id: 'r2',
    name: 'Cost Audit',
    employee: 'Wealth Strategist',
    schedule: '0 9 * * 1',
    scheduleLabel: 'Mondays at 9:00 AM',
    lastRun: '2026-04-07 09:00',
    nextRun: '2026-04-14 09:00',
    status: 'active',
    category: 'Finance',
  },
  {
    id: 'r3',
    name: 'Lead Follow-up Check',
    employee: 'Nurture Engine',
    schedule: '0 10,15 * * *',
    scheduleLabel: 'Daily at 10:00 AM & 3:00 PM',
    lastRun: '2026-04-09 15:00',
    nextRun: '2026-04-10 10:00',
    status: 'active',
    category: 'Sales',
  },
  {
    id: 'r4',
    name: 'Weekly Revenue Report',
    employee: 'Cash Machine',
    schedule: '0 7 * * 5',
    scheduleLabel: 'Fridays at 7:00 AM',
    lastRun: '2026-04-05 07:00',
    nextRun: '2026-04-12 07:00',
    status: 'active',
    category: 'Revenue',
  },
  {
    id: 'r5',
    name: 'Support Ticket Triage',
    employee: 'Support Rep',
    schedule: '*/30 * * * *',
    scheduleLabel: 'Every 30 minutes',
    lastRun: '2026-04-09 15:30',
    nextRun: '2026-04-09 16:00',
    status: 'active',
    category: 'Support',
  },
  {
    id: 'r6',
    name: 'Content Calendar Refresh',
    employee: 'Marketer',
    schedule: '0 9 * * 1',
    scheduleLabel: 'Mondays at 9:00 AM',
    lastRun: '2026-04-07 09:00',
    nextRun: '2026-04-14 09:00',
    status: 'paused',
    category: 'Marketing',
  },
  {
    id: 'r7',
    name: 'Pipeline Health Check',
    employee: 'Closer',
    schedule: '0 8 * * *',
    scheduleLabel: 'Daily at 8:00 AM',
    lastRun: '2026-04-09 08:00',
    nextRun: '2026-04-10 08:00',
    status: 'active',
    category: 'Sales',
  },
  {
    id: 'r8',
    name: 'Weekly Reflection Summary',
    employee: 'Reflector',
    schedule: '0 17 * * 5',
    scheduleLabel: 'Fridays at 5:00 PM',
    lastRun: '2026-04-05 17:00',
    nextRun: '2026-04-12 17:00',
    status: 'active',
    category: 'Strategy',
  },
  {
    id: 'r9',
    name: 'Partner Outreach Batch',
    employee: 'Connector',
    schedule: '0 11 * * 2,4',
    scheduleLabel: 'Tues & Thurs at 11:00 AM',
    lastRun: '2026-04-08 11:00',
    nextRun: '2026-04-10 11:00',
    status: 'error',
    category: 'Partnerships',
  },
  {
    id: 'r10',
    name: 'Daily Code Scan',
    employee: 'Code Agent',
    schedule: '0 2 * * *',
    scheduleLabel: 'Daily at 2:00 AM',
    lastRun: '2026-04-09 02:00',
    nextRun: '2026-04-10 02:00',
    status: 'active',
    category: 'Engineering',
  },
]

type StatusFilter = 'all' | 'active' | 'paused' | 'error'

function StatusPill({ status }: { status: Routine['status'] }) {
  const map: Record<Routine['status'], { bg: string; color: string; border: string; label: string }> = {
    active: { bg: 'rgba(74,222,128,0.12)', color: '#4ade80', border: 'rgba(74,222,128,0.25)', label: 'Active' },
    paused: { bg: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: 'rgba(251,191,36,0.25)', label: 'Paused' },
    error: { bg: 'rgba(248,113,113,0.12)', color: '#f87171', border: 'rgba(248,113,113,0.25)', label: 'Error' },
  }
  const s = map[status]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} />
      {s.label}
    </span>
  )
}

function CategoryChip({ label }: { label: string }) {
  const colors: Record<string, string> = {
    Operations: '#22d3ee',
    Finance: '#4ade80',
    Sales: '#a78bfa',
    Revenue: '#34d399',
    Support: '#fb923c',
    Marketing: '#f472b6',
    Strategy: '#818cf8',
    Partnerships: '#fbbf24',
    Engineering: '#60a5fa',
  }
  const color = colors[label] ?? '#71717a'
  return (
    <span
      className="mt-1 inline-block rounded-md px-2 py-0.5 text-[11px] font-medium"
      style={{
        backgroundColor: `${color}18`,
        color,
        border: `1px solid ${color}28`,
      }}
    >
      {label}
    </span>
  )
}

export default function RoutinesPage() {
  const [filter, setFilter] = useState<StatusFilter>('all')

  const filtered = filter === 'all' ? MOCK_ROUTINES : MOCK_ROUTINES.filter((r) => r.status === filter)
  const activeCount = MOCK_ROUTINES.filter((r) => r.status === 'active').length
  const errorCount = MOCK_ROUTINES.filter((r) => r.status === 'error').length

  const filterButtons: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'paused', label: 'Paused' },
    { key: 'error', label: 'Error' },
  ]

  return (
    <PageShell
      eyebrow="Workforce"
      title="Scheduled Routines"
      description="Every recurring workflow across your AI employees — cron schedules, last run, and next execution."
    >
      {/* TODO: Replace mock data with real /api/routines endpoint */}
      <div className="mb-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2 text-xs text-amber-400">
        Showing mock routine data. Wire to{' '}
        <code className="font-mono">/api/routines</code> when endpoint is available.
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Total routines"
          value={MOCK_ROUTINES.length}
          hint="All scheduled routines across all employees."
          accent="cyan"
        />
        <MetricCard
          label="Running"
          value={activeCount}
          hint="Routines currently active and scheduled."
          accent="emerald"
        />
        <MetricCard
          label="Errors"
          value={errorCount}
          hint="Routines that failed on last execution."
          accent={errorCount > 0 ? 'rose' : 'emerald'}
        />
      </div>

      <div className="mt-4">
        <Panel glow="cyan">
          <PanelHeader
            eyebrow="Schedules"
            title="All routines"
            description="Cron-based recurring agent tasks."
            aside={
              <div className="flex gap-2">
                {filterButtons.map((btn) => (
                  <button
                    key={btn.key}
                    onClick={() => setFilter(btn.key)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: filter === btn.key ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.05)',
                      color: filter === btn.key ? '#a78bfa' : '#71717a',
                      border: `1px solid ${filter === btn.key ? 'rgba(167,139,250,0.3)' : 'rgba(255,255,255,0.08)'}`,
                    }}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            }
          />

          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-b border-white/10">
                  {['Routine', 'Employee', 'Schedule', 'Last Run', 'Next Run', 'Status'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-zinc-500"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((routine) => (
                  <tr
                    key={routine.id}
                    className="border-b border-white/5 transition-colors hover:bg-white/[0.03]"
                  >
                    <td className="px-4 py-3.5">
                      <p className="text-sm font-medium text-zinc-100">{routine.name}</p>
                      <CategoryChip label={routine.category} />
                    </td>
                    <td className="px-4 py-3.5 text-sm text-zinc-400">{routine.employee}</td>
                    <td className="px-4 py-3.5">
                      <p className="text-xs text-zinc-300">{routine.scheduleLabel}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-zinc-600">{routine.schedule}</p>
                    </td>
                    <td className="px-4 py-3.5 tabular-nums text-xs text-zinc-500">{routine.lastRun}</td>
                    <td className="px-4 py-3.5 tabular-nums text-xs text-zinc-400">{routine.nextRun}</td>
                    <td className="px-4 py-3.5">
                      <StatusPill status={routine.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 && (
            <div className="py-12 text-center text-sm text-zinc-600">
              No routines match the selected filter.
            </div>
          )}
        </Panel>
      </div>
    </PageShell>
  )
}
