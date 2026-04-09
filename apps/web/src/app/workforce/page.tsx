'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageShell, Panel, PanelHeader, MetricCard } from '@/components/dashboard/cockpit-ui'

interface Employee {
  id: string
  slug: string
  name: string
  role: string
  mode: string
  active: boolean
  personality?: string
}

function ModeChip({ mode }: { mode: string }) {
  const isOperator = mode === 'operator'
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
      style={{
        backgroundColor: isOperator ? 'rgba(167,139,250,0.15)' : 'rgba(34,211,238,0.12)',
        color: isOperator ? '#a78bfa' : '#22d3ee',
        border: `1px solid ${isOperator ? 'rgba(167,139,250,0.25)' : 'rgba(34,211,238,0.2)'}`,
      }}
    >
      {isOperator ? '⚙' : '🎓'} {mode}
    </span>
  )
}

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{
          backgroundColor: active ? '#4ade80' : '#52525b',
          boxShadow: active ? '0 0 6px rgba(74,222,128,0.6)' : 'none',
        }}
      />
      <span style={{ color: active ? '#86efac' : '#71717a' }}>{active ? 'Active' : 'Inactive'}</span>
    </span>
  )
}

function EmployeeCard({ employee, onClick }: { employee: Employee; onClick: () => void }) {
  const initials = employee.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <button
      onClick={onClick}
      className="group w-full rounded-xl border border-white/10 bg-white/5 p-5 text-left transition-all duration-200 hover:border-violet-400/30 hover:bg-white/[0.08]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl border border-white/10 bg-violet-500/15 text-sm font-bold text-violet-300">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-zinc-100">{employee.name}</p>
            <p className="truncate text-xs text-zinc-500">{employee.role}</p>
          </div>
        </div>
        <ActiveBadge active={employee.active} />
      </div>

      {employee.personality && (
        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-zinc-500">
          {employee.personality}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between">
        <ModeChip mode={employee.mode || 'coach'} />
        <span className="text-[11px] text-zinc-600 transition-colors group-hover:text-zinc-400">
          View details →
        </span>
      </div>
    </button>
  )
}

export default function WorkforcePage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await fetch('/api/employees')
      const json = (await res.json()) as { success: boolean; data?: Employee[]; error?: string }
      if (json.success && json.data) {
        setEmployees(json.data)
      } else {
        setError(json.error ?? 'Failed to load employees')
      }
    } catch {
      setError('Network error — could not reach /api/employees')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchEmployees()
  }, [fetchEmployees])

  const activeCount = employees.filter((e) => e.active).length
  const operatorCount = employees.filter((e) => e.mode === 'operator').length

  return (
    <PageShell
      eyebrow="Workforce"
      title="All Employees"
      description="Every AI employee in your workforce — their role, operating mode, and current status."
    >
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Total employees" value={employees.length} hint="All onboarded AI employees." accent="cyan" />
        <MetricCard label="Active" value={activeCount} hint="Currently enabled and running." accent="emerald" />
        <MetricCard label="Operators" value={operatorCount} hint="Agents running in autonomous operator mode." accent="blue" />
      </div>

      <div className="mt-4">
        <Panel glow="cyan">
          <PanelHeader
            eyebrow="Roster"
            title="Employee grid"
            description="Click any card to view the agent's full detail page."
            aside={
              <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-400">
                {employees.length} total
              </span>
            }
          />

          {loading ? (
            <div className="grid min-h-[320px] place-items-center">
              <div className="h-9 w-9 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-6 text-center">
              <p className="text-sm text-red-400">{error}</p>
              <button
                onClick={fetchEmployees}
                className="mt-3 rounded-lg bg-red-500/20 px-4 py-1.5 text-xs text-red-300 transition-opacity hover:opacity-80"
              >
                Retry
              </button>
            </div>
          ) : employees.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-12 text-center">
              <p className="text-4xl">👥</p>
              <p className="mt-3 text-sm font-medium text-zinc-300">No employees onboarded yet</p>
              <p className="mt-1 text-xs text-zinc-600">Once employees are configured, they&apos;ll appear here.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {employees.map((emp) => (
                <EmployeeCard
                  key={emp.slug ?? emp.id}
                  employee={emp}
                  onClick={() => router.push(`/agents/${emp.slug ?? emp.id}`)}
                />
              ))}
            </div>
          )}
        </Panel>
      </div>
    </PageShell>
  )
}
