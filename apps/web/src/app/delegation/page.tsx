'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  PageShell,
  Panel,
  PanelHeader,
  Badge,
  StatusDot,
  EmptyState,
} from '@/components/dashboard/cockpit-ui'

interface Employee {
  id: string
  slug: string
  name: string
  title: string
  pillar: string
  description: string
  icon: string
  active: boolean
  archetype: string | null
}

const OWN_ITEMS = [
  'Strategic decisions',
  'Key client relationships',
  'Hiring calls',
  'Product vision',
  'Investor updates',
]

const AUTOMATE_ITEMS = [
  'Lead sync from GHL',
  'Monitor checks (every 6h)',
  'KPI measurement',
  'PR feedback extraction',
  'Routine schedules',
]

const DROP_ITEMS = [
  'Manual data entry',
  'Status update meetings',
  'Formatting reports',
  'Checking dashboards manually',
]

function TaskRow({ label, tone, badge }: { label: string; tone: 'cyan' | 'emerald' | 'amber' | 'rose' | 'neutral'; badge?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
      <StatusDot tone={tone} />
      <span className="flex-1 text-sm text-zinc-200">{label}</span>
      {badge ? <Badge tone={tone === 'cyan' ? 'cyan' : tone === 'amber' ? 'amber' : 'neutral'}>{badge}</Badge> : null}
    </div>
  )
}

function EmployeeRow({ employee }: { employee: Employee }) {
  const tone = employee.active ? 'emerald' : 'neutral'
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="text-lg leading-none">{employee.icon || '🤖'}</span>
        <div>
          <p className="text-sm font-medium text-zinc-200">{employee.name}</p>
          <p className="text-xs text-zinc-500">{employee.title}</p>
        </div>
      </div>
      <StatusDot tone={tone} />
    </div>
  )
}

export default function DelegationPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await fetch('/api/employees')
      const json = (await res.json()) as { success: boolean; data?: Employee[] }
      if (json.success && Array.isArray(json.data)) {
        setEmployees(json.data)
      }
    } catch {
      // silently degrade — delegate quadrant shows empty state
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchEmployees()
  }, [fetchEmployees])

  const activeCount = employees.filter((e) => e.active).length

  return (
    <PageShell
      eyebrow="Task Management"
      title="Delegation Matrix"
      description="Critical task zones — know what to own, delegate, automate, or drop."
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* OWN */}
        <Panel glow="cyan">
          <PanelHeader
            eyebrow="High Impact · You"
            title="👤 Own"
            description="Requires your judgment and presence"
          />
          <div className="space-y-2">
            {OWN_ITEMS.map((item) => (
              <TaskRow key={item} label={item} tone="cyan" />
            ))}
          </div>
        </Panel>

        {/* DELEGATE TO AI */}
        <Panel glow="emerald">
          <PanelHeader
            eyebrow="High Impact · AI Handles"
            title="🤖 Delegate to AI"
            description={loading ? 'Loading AI employees…' : `${employees.length} AI employee${employees.length === 1 ? '' : 's'} configured`}
            aside={
              <Badge tone="emerald">{activeCount} active</Badge>
            }
          />
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
            </div>
          ) : employees.length === 0 ? (
            <EmptyState
              title="No AI employees yet"
              description="Once employees are onboarded they will appear here."
            />
          ) : (
            <div className="space-y-2">
              {employees.map((emp) => (
                <EmployeeRow key={emp.slug ?? emp.id} employee={emp} />
              ))}
            </div>
          )}
        </Panel>

        {/* AUTOMATE */}
        <Panel glow="amber">
          <PanelHeader
            eyebrow="Low Effort · Scheduled"
            title="⚡ Automate"
            description="Repeatable tasks running on autopilot"
          />
          <div className="space-y-2">
            {AUTOMATE_ITEMS.map((item) => (
              <TaskRow key={item} label={item} tone="amber" badge="Auto" />
            ))}
          </div>
        </Panel>

        {/* DROP */}
        <Panel glow="rose">
          <PanelHeader
            eyebrow="Low Impact · Eliminate"
            title="✕ Drop"
            description="Stop spending time on these"
          />
          <div className="space-y-2">
            {DROP_ITEMS.map((item) => (
              <div
                key={item}
                className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 opacity-60"
              >
                <span className="text-sm text-zinc-400 line-through">{item}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </PageShell>
  )
}
