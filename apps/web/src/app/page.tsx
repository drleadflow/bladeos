'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Employee {
  id: string
  name: string
  slug: string
  title: string
  department: string | null
  active: boolean
  successRate: number | null
  totalRuns: number | null
  status: string | null
}

interface Approval {
  id: string
  requestedBy: string
  action: string
  toolName: string | null
  context: string | null
  priority: string
  status: string
  createdAt: string
}

interface ActivityEvent {
  id: number
  eventType: string
  actorType: string
  actorId: string
  summary: string
  createdAt: string
}

interface DashboardData {
  employees: Employee[]
  approvals: Approval[]
  pendingCount: number
  events: ActivityEvent[]
  loading: boolean
  error: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function priorityColor(priority: string): string {
  if (priority === 'urgent') return 'text-red-400 bg-red-400/10 border-red-400/20'
  if (priority === 'high') return 'text-orange-400 bg-orange-400/10 border-orange-400/20'
  return 'text-zinc-400 bg-zinc-400/10 border-zinc-400/20'
}

type StatusDot = 'green' | 'yellow' | 'red'

function dotClass(status: StatusDot): string {
  if (status === 'green') return 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]'
  if (status === 'yellow') return 'bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.8)]'
  return 'bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.8)]'
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SkeletonPulse({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-white/5 ${className}`} />
}

interface ScorecardProps {
  label: string
  value: string | number
  target: string
  status: StatusDot
  trend: 'up' | 'down' | 'flat'
  loading: boolean
}

function ScorecardCard({ label, value, target, status, trend, loading }: ScorecardProps) {
  const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'
  const trendColor =
    trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-red-400' : 'text-zinc-500'

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col gap-3 hover:bg-white/[0.07] transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          {label}
        </span>
        {loading ? (
          <SkeletonPulse className="h-2.5 w-2.5 rounded-full" />
        ) : (
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${dotClass(status)}`} />
        )}
      </div>
      {loading ? (
        <>
          <SkeletonPulse className="h-8 w-20" />
          <SkeletonPulse className="h-4 w-28" />
        </>
      ) : (
        <>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold text-zinc-100 tabular-nums">{value}</span>
            <span className={`mb-1 text-sm font-semibold ${trendColor}`}>{trendIcon}</span>
          </div>
          <p className="text-xs text-zinc-500">
            Target: <span className="text-zinc-400">{target}</span>
          </p>
        </>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CommandCenter() {
  const [data, setData] = useState<DashboardData>({
    employees: [],
    approvals: [],
    pendingCount: 0,
    events: [],
    loading: true,
    error: null,
  })

  const [approvingId, setApprovingId] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setData((prev) => ({ ...prev, loading: true, error: null }))

    const safeJson = async <T,>(res: Response): Promise<T | null> => {
      if (!res.ok) return null
      try {
        return (await res.json()) as T
      } catch {
        return null
      }
    }

    try {
      const [empRes, appRes, timelineRes] = await Promise.all([
        fetch('/api/employees').catch(() => null),
        fetch('/api/approvals').catch(() => null),
        fetch('/api/timeline?limit=5').catch(() => null),
      ])

      const empData = empRes
        ? await safeJson<{ success: boolean; data: Employee[] }>(empRes)
        : null
      const appData = appRes
        ? await safeJson<{ success: boolean; approvals: Approval[]; pendingCount: number }>(appRes)
        : null
      const timelineData = timelineRes
        ? await safeJson<{ success: boolean; data: { events: ActivityEvent[] } }>(timelineRes)
        : null

      setData({
        employees: empData?.success ? empData.data : [],
        approvals: appData?.success ? appData.approvals : [],
        pendingCount: appData?.success ? appData.pendingCount : 0,
        events: timelineData?.success ? timelineData.data.events : [],
        loading: false,
        error: null,
      })
    } catch (err) {
      setData((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load dashboard',
      }))
    }
  }, [])

  useEffect(() => {
    void fetchAll()
  }, [fetchAll])

  const handleDecision = useCallback(
    async (id: string, decision: 'approved' | 'rejected') => {
      setApprovingId(id)
      try {
        const res = await fetch('/api/approvals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, decision }),
        })
        if (res.ok) {
          setData((prev) => ({
            ...prev,
            approvals: prev.approvals.filter((a) => a.id !== id),
            pendingCount: Math.max(0, prev.pendingCount - 1),
          }))
        }
      } catch {
        // Non-critical — leave item in queue if request fails
      } finally {
        setApprovingId(null)
      }
    },
    []
  )

  // ── Derived metrics ──────────────────────────────────────────────────────

  const { employees, approvals, pendingCount, events, loading } = data

  const activeEmployees = employees.filter((e) => e.active).length
  const totalEmployees = employees.length

  const avgSuccessRate =
    employees.length > 0
      ? Math.round(
          employees
            .filter((e) => e.successRate !== null)
            .reduce((sum, e) => sum + (e.successRate ?? 0), 0) /
            Math.max(1, employees.filter((e) => e.successRate !== null).length)
        )
      : null

  const empStatus: StatusDot =
    activeEmployees >= 8 ? 'green' : activeEmployees >= 4 ? 'yellow' : 'red'
  const approvalStatus: StatusDot =
    pendingCount === 0 ? 'green' : pendingCount <= 3 ? 'yellow' : 'red'
  const successStatus: StatusDot =
    avgSuccessRate === null ? 'yellow' : avgSuccessRate >= 80 ? 'green' : avgSuccessRate >= 50 ? 'yellow' : 'red'
  const systemStatus: StatusDot = loading ? 'yellow' : data.error ? 'red' : 'green'

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen px-6 py-8 md:px-10">
      <div className="mx-auto max-w-6xl space-y-10">

        {/* ── 1. Greeting + Morning Briefing ───────────────────────────── */}
        <section>
          <div className="mb-1 flex flex-wrap items-baseline gap-x-3">
            <h1 className="text-2xl font-bold text-zinc-100">
              {getGreeting()}, Dr. Blade
            </h1>
            <span className="text-sm text-zinc-500">{formatDate()}</span>
          </div>
          <p className="mb-6 text-sm text-zinc-400">
            Here&rsquo;s your command center overview.
          </p>

          {/* Stat pills */}
          <div className="flex flex-wrap gap-3">
            {[
              {
                label: 'Active Employees',
                value: loading ? '—' : `${activeEmployees} / ${totalEmployees}`,
                color: 'text-cyan-400',
              },
              {
                label: 'Pending Approvals',
                value: loading ? '—' : String(pendingCount),
                color: pendingCount > 0 ? 'text-orange-400' : 'text-emerald-400',
              },
              {
                label: 'Recent Events',
                value: loading ? '—' : String(events.length),
                color: 'text-violet-400',
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex items-center gap-2.5 rounded-full border border-white/10 bg-white/5 px-4 py-2"
              >
                <span className="text-xs font-medium text-zinc-500">{stat.label}</span>
                <span className={`text-sm font-bold tabular-nums ${stat.color}`}>
                  {stat.value}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ── 2. Scorecard ─────────────────────────────────────────────── */}
        <section>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Scorecard
          </h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <ScorecardCard
              label="Active Employees"
              value={loading ? '—' : activeEmployees}
              target="8"
              status={empStatus}
              trend={activeEmployees >= 8 ? 'up' : activeEmployees > 0 ? 'flat' : 'down'}
              loading={loading}
            />
            <ScorecardCard
              label="Approval Queue"
              value={loading ? '—' : pendingCount}
              target="0 pending"
              status={approvalStatus}
              trend={pendingCount === 0 ? 'up' : 'down'}
              loading={loading}
            />
            <ScorecardCard
              label="Run Success Rate"
              value={loading ? '—' : avgSuccessRate !== null ? `${avgSuccessRate}%` : 'N/A'}
              target="≥ 80%"
              status={successStatus}
              trend={
                avgSuccessRate === null
                  ? 'flat'
                  : avgSuccessRate >= 80
                  ? 'up'
                  : 'down'
              }
              loading={loading}
            />
            <ScorecardCard
              label="System Health"
              value={loading ? '—' : data.error ? 'Degraded' : 'Nominal'}
              target="Nominal"
              status={systemStatus}
              trend={data.error ? 'down' : 'up'}
              loading={loading}
            />
          </div>
        </section>

        {/* ── 3 + 4: Activity Feed & Approval Queue (side-by-side) ─────── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

          {/* ── 3. Employee Activity Feed ───────────────────────────────── */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                Activity Feed
              </h2>
              <Link
                href="/workforce"
                className="text-xs font-medium text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                View all →
              </Link>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 divide-y divide-white/5">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-3 px-4 py-3.5">
                    <SkeletonPulse className="mt-0.5 h-7 w-7 rounded-full shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <SkeletonPulse className="h-3.5 w-40" />
                      <SkeletonPulse className="h-3 w-56" />
                    </div>
                    <SkeletonPulse className="h-3 w-12 shrink-0" />
                  </div>
                ))
              ) : events.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-zinc-500">
                  No recent activity
                </div>
              ) : (
                events.map((event) => (
                  <div key={event.id} className="flex items-start gap-3 px-4 py-3.5 hover:bg-white/[0.03] transition-colors">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-400/10 text-xs font-bold text-cyan-400">
                      {event.actorId.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-200">
                        {event.actorId}
                      </p>
                      <p className="truncate text-xs text-zinc-500">{event.summary}</p>
                    </div>
                    <span className="shrink-0 text-xs text-zinc-600 tabular-nums">
                      {formatRelativeTime(event.createdAt)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* ── 4. Approval Queue Preview ───────────────────────────────── */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                Approval Queue
                {!loading && pendingCount > 0 && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-orange-400/15 px-2 py-0.5 text-[10px] font-bold text-orange-400">
                    {pendingCount}
                  </span>
                )}
              </h2>
              <Link
                href="/workforce/approvals"
                className="text-xs font-medium text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                View all →
              </Link>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 divide-y divide-white/5">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="px-4 py-4 space-y-2">
                    <SkeletonPulse className="h-3.5 w-48" />
                    <SkeletonPulse className="h-3 w-32" />
                    <div className="flex gap-2 pt-1">
                      <SkeletonPulse className="h-7 w-20 rounded-lg" />
                      <SkeletonPulse className="h-7 w-16 rounded-lg" />
                    </div>
                  </div>
                ))
              ) : approvals.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <span className="text-2xl">✓</span>
                  <p className="mt-2 text-sm text-zinc-500">Queue is clear</p>
                </div>
              ) : (
                approvals.slice(0, 3).map((approval) => (
                  <div key={approval.id} className="px-4 py-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-zinc-200 leading-snug">
                        {approval.action}
                      </p>
                      <span
                        className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${priorityColor(approval.priority)}`}
                      >
                        {approval.priority}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500">
                      From{' '}
                      <span className="font-medium text-zinc-400">{approval.requestedBy}</span>
                      {approval.context && (
                        <> &mdash; {approval.context.slice(0, 80)}{approval.context.length > 80 ? '…' : ''}</>
                      )}
                    </p>
                    <div className="flex items-center gap-2 pt-0.5">
                      <button
                        onClick={() => void handleDecision(approval.id, 'approved')}
                        disabled={approvingId === approval.id}
                        className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-40 transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => void handleDecision(approval.id, 'rejected')}
                        disabled={approvingId === approval.id}
                        className="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/20 disabled:opacity-40 transition-colors"
                      >
                        Deny
                      </button>
                      <span className="ml-auto text-[11px] text-zinc-600 tabular-nums">
                        {formatRelativeTime(approval.createdAt)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* ── 5. Quick Actions ─────────────────────────────────────────── */}
        <section>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              {
                label: 'Chat with Blade',
                href: '/chat',
                icon: '💬',
                accent: 'hover:border-cyan-400/40 hover:bg-cyan-400/5',
              },
              {
                label: 'Employees',
                href: '/workforce',
                icon: '👥',
                accent: 'hover:border-violet-400/40 hover:bg-violet-400/5',
              },
              {
                label: 'Revenue',
                href: '/revenue',
                icon: '📈',
                accent: 'hover:border-emerald-400/40 hover:bg-emerald-400/5',
              },
              {
                label: 'Operations',
                href: '/operations',
                icon: '⚙️',
                accent: 'hover:border-orange-400/40 hover:bg-orange-400/5',
              },
              {
                label: 'Memory',
                href: '/memory',
                icon: '🧠',
                accent: 'hover:border-pink-400/40 hover:bg-pink-400/5',
              },
              {
                label: 'Settings',
                href: '/control/settings',
                icon: '🛡️',
                accent: 'hover:border-zinc-400/40 hover:bg-zinc-400/5',
              },
            ].map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className={`group flex flex-col items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-4 py-5 text-center transition-all duration-150 ${action.accent}`}
              >
                <span className="text-2xl leading-none">{action.icon}</span>
                <span className="text-xs font-semibold text-zinc-400 group-hover:text-zinc-200 transition-colors">
                  {action.label}
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Error banner ────────────────────────────────────────────── */}
        {data.error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
            <strong>Dashboard unavailable:</strong> {data.error} —{' '}
            <button
              onClick={() => void fetchAll()}
              className="underline underline-offset-2 hover:text-red-300 transition-colors"
            >
              retry
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
