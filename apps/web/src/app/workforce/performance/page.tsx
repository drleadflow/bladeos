'use client'

import { useState } from 'react'
import { PageShell, Panel, PanelHeader, MetricCard } from '@/components/dashboard/cockpit-ui'

// TODO: Replace with real API call to /api/employees/performance when endpoint exists
interface EmployeePerf {
  slug: string
  name: string
  role: string
  tasksCompleted: number
  successRate: number
  avgResponseTimeSec: number
  lastActive: string
  trend: 'up' | 'down' | 'flat'
}

const MOCK_PERF: EmployeePerf[] = [
  {
    slug: 'cash-machine',
    name: 'Cash Machine',
    role: 'Revenue Operator',
    tasksCompleted: 142,
    successRate: 94,
    avgResponseTimeSec: 3.2,
    lastActive: '2 min ago',
    trend: 'up',
  },
  {
    slug: 'closer',
    name: 'Closer',
    role: 'Sales Agent',
    tasksCompleted: 87,
    successRate: 88,
    avgResponseTimeSec: 4.8,
    lastActive: '15 min ago',
    trend: 'up',
  },
  {
    slug: 'code-agent',
    name: 'Code Agent',
    role: 'Engineering',
    tasksCompleted: 203,
    successRate: 97,
    avgResponseTimeSec: 12.1,
    lastActive: '1 min ago',
    trend: 'flat',
  },
  {
    slug: 'connector',
    name: 'Connector',
    role: 'Partnerships',
    tasksCompleted: 56,
    successRate: 79,
    avgResponseTimeSec: 6.4,
    lastActive: '1 hr ago',
    trend: 'down',
  },
  {
    slug: 'marketer',
    name: 'Marketer',
    role: 'Growth & Content',
    tasksCompleted: 118,
    successRate: 91,
    avgResponseTimeSec: 8.3,
    lastActive: '30 min ago',
    trend: 'up',
  },
  {
    slug: 'nurture-engine',
    name: 'Nurture Engine',
    role: 'Lead Nurturing',
    tasksCompleted: 334,
    successRate: 85,
    avgResponseTimeSec: 2.1,
    lastActive: '5 min ago',
    trend: 'flat',
  },
  {
    slug: 'operator',
    name: 'Operator',
    role: 'Ops Automation',
    tasksCompleted: 77,
    successRate: 93,
    avgResponseTimeSec: 5.6,
    lastActive: '8 min ago',
    trend: 'up',
  },
  {
    slug: 'reflector',
    name: 'Reflector',
    role: 'Strategic Insights',
    tasksCompleted: 29,
    successRate: 100,
    avgResponseTimeSec: 18.7,
    lastActive: '3 hr ago',
    trend: 'flat',
  },
  {
    slug: 'support-rep',
    name: 'Support Rep',
    role: 'Customer Support',
    tasksCompleted: 289,
    successRate: 82,
    avgResponseTimeSec: 3.9,
    lastActive: '2 min ago',
    trend: 'down',
  },
  {
    slug: 'wealth-strategist',
    name: 'Wealth Strategist',
    role: 'Finance',
    tasksCompleted: 41,
    successRate: 96,
    avgResponseTimeSec: 22.4,
    lastActive: '6 hr ago',
    trend: 'up',
  },
  {
    slug: 'wellness-coach',
    name: 'Wellness Coach',
    role: 'Personal Development',
    tasksCompleted: 63,
    successRate: 90,
    avgResponseTimeSec: 7.1,
    lastActive: '45 min ago',
    trend: 'flat',
  },
]

type SortKey = 'tasksCompleted' | 'successRate' | 'avgResponseTimeSec'
type SortDir = 'asc' | 'desc'

function TrendIcon({ trend }: { trend: EmployeePerf['trend'] }) {
  if (trend === 'up') return <span className="text-base text-emerald-400">↑</span>
  if (trend === 'down') return <span className="text-base text-red-400">↓</span>
  return <span className="text-base text-zinc-600">—</span>
}

function RateBar({ value }: { value: number }) {
  const color = value >= 90 ? '#4ade80' : value >= 75 ? '#fbbf24' : '#f87171'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${value}%`, backgroundColor: color }}
        />
      </div>
      <span className="tabular-nums text-xs" style={{ color }}>
        {value}%
      </span>
    </div>
  )
}

export default function WorkforcePerformancePage() {
  const [sortKey, setSortKey] = useState<SortKey>('tasksCompleted')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const sorted = [...MOCK_PERF].sort((a, b) => {
    const mul = sortDir === 'desc' ? -1 : 1
    return mul * (a[sortKey] - b[sortKey])
  })

  const avgSuccess = Math.round(MOCK_PERF.reduce((s, e) => s + e.successRate, 0) / MOCK_PERF.length)
  const totalTasks = MOCK_PERF.reduce((s, e) => s + e.tasksCompleted, 0)
  const topAgent = [...MOCK_PERF].sort((a, b) => b.successRate - a.successRate)[0]

  function SortHeader({ label, colKey }: { label: string; colKey: SortKey }) {
    const active = sortKey === colKey
    return (
      <th
        className="cursor-pointer select-none px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-zinc-500 transition-colors hover:text-zinc-300"
        onClick={() => handleSort(colKey)}
      >
        <span className="flex items-center gap-1">
          {label}
          {active ? (
            <span className="text-violet-400">{sortDir === 'desc' ? '↓' : '↑'}</span>
          ) : (
            <span className="text-zinc-700">↕</span>
          )}
        </span>
      </th>
    )
  }

  return (
    <PageShell
      eyebrow="Workforce"
      title="Performance Dashboard"
      description="Employee KPI leaderboard — task velocity, success rate, and response time across all agents."
    >
      {/* TODO: Replace mock data with real /api/employees/performance endpoint */}
      <div className="mb-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2 text-xs text-amber-400">
        Showing mock performance data. Wire to{' '}
        <code className="font-mono">/api/employees/performance</code> when endpoint is available.
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Total tasks completed"
          value={totalTasks.toLocaleString()}
          hint="All-time tasks across every employee."
          accent="cyan"
        />
        <MetricCard
          label="Avg success rate"
          value={`${avgSuccess}%`}
          hint="Mean success rate across the workforce."
          accent={avgSuccess >= 85 ? 'emerald' : 'amber'}
        />
        <MetricCard
          label="Top performer"
          value={topAgent.name}
          hint={`${topAgent.successRate}% success rate`}
          accent="blue"
        />
      </div>

      <div className="mt-4">
        <Panel glow="cyan">
          <PanelHeader
            eyebrow="Leaderboard"
            title="Employee KPIs"
            description="Click column headers to sort."
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                    Employee
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                    Role
                  </th>
                  <SortHeader label="Tasks" colKey="tasksCompleted" />
                  <SortHeader label="Success Rate" colKey="successRate" />
                  <SortHeader label="Avg Response" colKey="avgResponseTimeSec" />
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                    Last Active
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-zinc-500">
                    Trend
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((emp, idx) => (
                  <tr
                    key={emp.slug}
                    className="border-b border-white/5 transition-colors hover:bg-white/[0.03]"
                  >
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="w-5 tabular-nums text-xs text-zinc-600">{idx + 1}</span>
                        <div className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-violet-500/15 text-[10px] font-bold text-violet-300">
                          {emp.name.slice(0, 2).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-zinc-100">{emp.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-zinc-500">{emp.role}</td>
                    <td className="px-4 py-3.5 text-sm font-semibold tabular-nums text-zinc-100">
                      {emp.tasksCompleted.toLocaleString()}
                    </td>
                    <td className="px-4 py-3.5">
                      <RateBar value={emp.successRate} />
                    </td>
                    <td className="px-4 py-3.5 tabular-nums text-sm text-zinc-400">
                      {emp.avgResponseTimeSec.toFixed(1)}s
                    </td>
                    <td className="px-4 py-3.5 text-xs text-zinc-500">{emp.lastActive}</td>
                    <td className="px-4 py-3.5">
                      <TrendIcon trend={emp.trend} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </PageShell>
  )
}
