'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Badge,
  EmptyState,
  MetricCard,
  PageShell,
  Panel,
  PanelHeader,
  StatusDot,
} from '@/components/dashboard/cockpit-ui'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentDetail {
  id: string
  slug: string
  name: string
  title: string
  pillar: string
  department: string | null
  description: string
  icon: string
  objective: string | null
  status: string | null
  allowedTools: string[]
  modelPreference: string | null
  totalRuns: number | null
  totalCostUsd: number | null
  successRate: number | null
  active: boolean
  archetype: string | null
  managerId: string | null
  onboardingAnswers: Record<string, string>
  createdAt: string
  updatedAt: string
}

interface KpiDefinition {
  id: string
  employeeId: string
  name: string
  description: string | null
  target: number
  unit: string
  frequency: string
  direction: string
  thresholds: { green: number; yellow: number; red: number }
}

interface KpiMeasurement {
  kpiId: string
  name: string
  value: number
  status: string
  measuredAt: string
}

interface Routine {
  id: string
  name: string
  description: string | null
  schedule: string
  task: string
  enabled: boolean
  lastRunAt: string | null
  nextRunAt: string | null
  runCount: number
  lastStatus: string | null
}

interface ActivityEvent {
  id: number
  eventType: string
  actorType: string
  actorId: string
  targetType: string | null
  targetId: string | null
  summary: string
  detailJson: string | null
  conversationId: string | null
  jobId: string | null
  costUsd: number
  createdAt: string
}

interface Framework {
  name: string
  purpose: string
  moves: string[]
}

interface EmployeeApproval {
  id: string
  requestedBy: string
  action: string
  toolName: string | null
  context: string | null
  priority: string
  status: string
  decidedBy: string | null
  decidedAt: string | null
  expiresAt: string | null
  createdAt: string
}

interface PerformanceStats {
  totalEvents: number
  totalCost: number
  byType: { type: string; count: number }[]
}

type Tab = 'kpis' | 'routines' | 'playbooks' | 'approvals' | 'history'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EVENT_TYPE_STYLES: Record<string, { icon: string; badge: string }> = {
  conversation: { icon: '\u{1F4AC}', badge: 'bg-blue-600 text-blue-100' },
  tool_call: { icon: '\u{1F527}', badge: 'bg-purple-600 text-purple-100' },
  approval: { icon: '\u{2705}', badge: 'bg-green-600 text-green-100' },
  error: { icon: '\u{1F6A8}', badge: 'bg-red-600 text-red-100' },
  job_start: { icon: '\u{1F680}', badge: 'bg-cyan-600 text-cyan-100' },
  job_complete: { icon: '\u{1F389}', badge: 'bg-green-600 text-green-100' },
  job_fail: { icon: '\u{274C}', badge: 'bg-red-600 text-red-100' },
  cost: { icon: '\u{1F4B0}', badge: 'bg-yellow-600 text-yellow-100' },
}
const DEFAULT_STYLE = { icon: '\u{26A1}', badge: 'bg-zinc-600 text-zinc-200' }

function getEventStyle(eventType: string): { icon: string; badge: string } {
  return EVENT_TYPE_STYLES[eventType] ?? DEFAULT_STYLE
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function formatCost(usd: number | null): string {
  if (usd == null) return '--'
  return `$${usd.toFixed(4)}`
}

function cronToHuman(cron: string): string {
  const parts = cron.split(/\s+/)
  if (parts.length < 5) return cron
  const [min, hour, dayOfMonth, month, dayOfWeek] = parts
  if (min === '0' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return 'Every hour'
  }
  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    if (hour === '*') return `Every hour at :${min.padStart(2, '0')}`
    return `Daily at ${hour}:${min.padStart(2, '0')}`
  }
  if (dayOfWeek !== '*' && dayOfMonth === '*') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const dayName = days[Number(dayOfWeek)] ?? dayOfWeek
    return `${dayName} at ${hour}:${min.padStart(2, '0')}`
  }
  return cron
}

function getStatusTone(status: string | null): 'emerald' | 'amber' | 'rose' | 'neutral' {
  if (!status) return 'neutral'
  if (status === 'active') return 'emerald'
  if (status === 'idle') return 'amber'
  if (status === 'suspended') return 'rose'
  return 'neutral'
}

function kpiStatusTone(status: string): 'emerald' | 'amber' | 'rose' | 'neutral' {
  if (status === 'green') return 'emerald'
  if (status === 'yellow') return 'amber'
  if (status === 'red') return 'rose'
  return 'neutral'
}

function priorityTone(priority: string): 'rose' | 'amber' | 'blue' | 'neutral' {
  if (priority === 'urgent' || priority === 'high') return 'rose'
  if (priority === 'medium') return 'amber'
  if (priority === 'low') return 'blue'
  return 'neutral'
}

function approvalStatusTone(status: string): 'amber' | 'emerald' | 'rose' | 'neutral' {
  if (status === 'pending') return 'amber'
  if (status === 'approved') return 'emerald'
  if (status === 'rejected') return 'rose'
  return 'neutral'
}

// ---------------------------------------------------------------------------
// Tab button
// ---------------------------------------------------------------------------

function TabButton({
  label,
  active,
  count,
  onClick,
}: {
  label: string
  active: boolean
  count?: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`relative rounded-2xl px-4 py-2.5 text-sm font-medium transition-all ${
        active
          ? 'bg-white/[0.08] text-cyan-300 border border-cyan-400/20'
          : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent'
      }`}
    >
      {label}
      {count != null && count > 0 && (
        <span className="ml-2 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-cyan-400/15 px-1.5 text-[10px] font-semibold text-cyan-300">
          {count}
        </span>
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Section components
// ---------------------------------------------------------------------------

function KpisSection({
  kpis,
  measurementMap,
}: {
  kpis: KpiDefinition[]
  measurementMap: Map<string, KpiMeasurement>
}) {
  if (kpis.length === 0) {
    return <EmptyState title="No KPIs defined" description="This employee has no key performance indicators configured yet." />
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {kpis.map((kpi) => {
        const m = measurementMap.get(kpi.id)
        const tone = m ? kpiStatusTone(m.status) : 'neutral'
        return (
          <div
            key={kpi.id}
            className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5"
          >
            <div className="flex items-center gap-2 mb-3">
              <StatusDot tone={tone === 'neutral' ? 'neutral' : tone} />
              <span className="text-sm font-medium text-zinc-100">{kpi.name}</span>
            </div>
            {kpi.description && (
              <p className="text-xs text-zinc-500 mb-3">{kpi.description}</p>
            )}
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-zinc-50">
                {m ? m.value : '--'}
              </span>
              <span className="text-xs text-zinc-500">{kpi.unit}</span>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-zinc-600">
              <span>target: {kpi.target} {kpi.unit}</span>
              {m && <span>{relativeTime(m.measuredAt)}</span>}
            </div>
            {/* Progress bar */}
            {m && kpi.target > 0 && (
              <div className="mt-3 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    tone === 'emerald' ? 'bg-emerald-400' :
                    tone === 'amber' ? 'bg-amber-400' :
                    tone === 'rose' ? 'bg-rose-400' : 'bg-cyan-400'
                  }`}
                  style={{
                    width: `${Math.min(100, (m.value / kpi.target) * 100)}%`,
                  }}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function RoutinesSection({ routines }: { routines: Routine[] }) {
  if (routines.length === 0) {
    return <EmptyState title="No routines configured" description="This employee has no scheduled routines yet." />
  }

  return (
    <div className="space-y-3">
      {routines.map((routine) => (
        <div
          key={routine.id}
          className="rounded-[1.4rem] border border-white/10 bg-white/[0.03] p-5"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-semibold text-zinc-100">{routine.name}</span>
                <Badge tone={routine.enabled ? 'emerald' : 'neutral'}>
                  {routine.enabled ? 'enabled' : 'disabled'}
                </Badge>
                {routine.lastStatus && (
                  <Badge tone={routine.lastStatus === 'success' ? 'emerald' : routine.lastStatus === 'error' ? 'rose' : 'neutral'}>
                    {routine.lastStatus}
                  </Badge>
                )}
              </div>
              {routine.description && (
                <p className="text-xs text-zinc-500 mb-2">{routine.description}</p>
              )}
              <p className="text-xs text-zinc-400 leading-5 whitespace-pre-wrap line-clamp-3">
                {routine.task}
              </p>
              <div className="flex items-center gap-4 mt-3 text-xs text-zinc-500">
                <span className="flex items-center gap-1">
                  <span className="text-zinc-600">Schedule:</span> {cronToHuman(routine.schedule)}
                </span>
                <span className="flex items-center gap-1">
                  <span className="text-zinc-600">Runs:</span> {routine.runCount}
                </span>
              </div>
            </div>
            <div className="text-right text-xs text-zinc-500 shrink-0 space-y-1">
              {routine.lastRunAt && <div>Last: {relativeTime(routine.lastRunAt)}</div>}
              {routine.nextRunAt && (
                <div className="text-cyan-400/60">Next: {new Date(routine.nextRunAt).toLocaleString()}</div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function PlaybooksSection({ frameworks }: { frameworks: Framework[] }) {
  if (frameworks.length === 0) {
    return <EmptyState title="No playbooks defined" description="This employee has no operating frameworks configured." />
  }

  return (
    <div className="space-y-4">
      {frameworks.map((framework) => (
        <div
          key={framework.name}
          className="rounded-[1.4rem] border border-white/10 bg-white/[0.03] p-5"
        >
          <div className="flex items-start gap-4">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-lg">
              {'\u{1F4D6}'}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-zinc-100">{framework.name}</h3>
              <p className="mt-1 text-sm text-zinc-400">{framework.purpose}</p>
              <div className="mt-4 space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">Moves</p>
                <ul className="space-y-1.5">
                  {framework.moves.map((move, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400/50" />
                      {move}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function ApprovalsSection({ approvals: items }: { approvals: EmployeeApproval[] }) {
  if (items.length === 0) {
    return <EmptyState title="No approvals" description="This employee has not requested any approvals." />
  }

  const pendingCount = items.filter((a) => a.status === 'pending').length

  return (
    <div className="space-y-3">
      {pendingCount > 0 && (
        <div className="flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1.5 text-xs uppercase tracking-[0.2em] text-amber-200 w-fit">
          <StatusDot tone="amber" />
          {pendingCount} pending
        </div>
      )}
      {items.map((approval) => (
        <div
          key={approval.id}
          className="rounded-[1.4rem] border border-white/10 bg-white/[0.03] p-5"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Badge tone={priorityTone(approval.priority)}>{approval.priority}</Badge>
                <Badge tone={approvalStatusTone(approval.status)}>{approval.status}</Badge>
                {approval.toolName && <Badge tone="blue">{approval.toolName}</Badge>}
              </div>
              <p className="text-sm font-medium text-zinc-100">{approval.action}</p>
              {approval.context && (
                <p className="mt-2 line-clamp-2 text-xs text-zinc-500">{approval.context}</p>
              )}
            </div>
            <div className="text-right text-xs text-zinc-500 shrink-0 space-y-1">
              <div>{relativeTime(approval.createdAt)}</div>
              {approval.decidedBy && (
                <div className="text-zinc-600">by {approval.decidedBy}</div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function PerformanceSection({
  activity,
  stats,
}: {
  activity: ActivityEvent[]
  stats: PerformanceStats
}) {
  return (
    <div className="space-y-6">
      {/* Performance summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Total events"
          value={stats.totalEvents}
          hint="All tracked activity for this employee."
          accent="cyan"
        />
        <MetricCard
          label="Total cost"
          value={formatCost(stats.totalCost)}
          hint="Cumulative spend across all operations."
          accent="amber"
        />
        <MetricCard
          label="Event types"
          value={stats.byType.length}
          hint="Distinct categories of activity."
          accent="blue"
        />
      </div>

      {/* Event type breakdown */}
      {stats.byType.length > 0 && (
        <Panel>
          <PanelHeader eyebrow="Breakdown" title="Activity by type" />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {stats.byType
              .sort((a, b) => b.count - a.count)
              .map(({ type, count }) => {
                const style = getEventStyle(type)
                const maxCount = Math.max(...stats.byType.map((b) => b.count))
                return (
                  <div key={type} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-base">{style.icon}</span>
                      <span className="text-xs font-medium text-zinc-300">{type.replace(/_/g, ' ')}</span>
                      <span className="ml-auto text-sm font-semibold text-zinc-100">{count}</span>
                    </div>
                    <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-cyan-400/60 transition-all"
                        style={{ width: `${(count / maxCount) * 100}%` }}
                      />
                    </div>
                  </div>
                )
              })}
          </div>
        </Panel>
      )}

      {/* Timeline */}
      <Panel>
        <PanelHeader eyebrow="Timeline" title="Recent activity" description="The last 20 recorded events for this employee." />
        {activity.length === 0 ? (
          <EmptyState title="No activity" description="No recorded events for this employee yet." />
        ) : (
          <div className="space-y-2">
            {activity.map((event) => {
              const style = getEventStyle(event.eventType)
              return (
                <div
                  key={event.id}
                  className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 hover:border-white/10 transition-colors"
                >
                  <span className="mt-0.5 text-base shrink-0">{style.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${style.badge}`}>
                        {event.eventType.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-300 line-clamp-2">{event.summary}</p>
                    {event.jobId && (
                      <p className="text-xs text-zinc-600 mt-0.5">Job: {event.jobId}</p>
                    )}
                  </div>
                  <div className="text-right text-xs text-zinc-500 shrink-0">
                    <div>{relativeTime(event.createdAt)}</div>
                    {event.costUsd > 0 && (
                      <div className="mt-0.5 text-amber-400">{formatCost(event.costUsd)}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Panel>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AgentDetailPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

  const [agent, setAgent] = useState<AgentDetail | null>(null)
  const [kpis, setKpis] = useState<KpiDefinition[]>([])
  const [measurements, setMeasurements] = useState<KpiMeasurement[]>([])
  const [agentRoutines, setAgentRoutines] = useState<Routine[]>([])
  const [activity, setActivity] = useState<ActivityEvent[]>([])
  const [frameworks, setFrameworks] = useState<Framework[]>([])
  const [agentApprovals, setAgentApprovals] = useState<EmployeeApproval[]>([])
  const [perfStats, setPerfStats] = useState<PerformanceStats>({ totalEvents: 0, totalCost: 0, byType: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('kpis')

  const fetchAgent = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${slug}`)
      const json = await res.json()
      if (json.success === false) {
        setError(json.error ?? 'Agent not found')
        return
      }
      setAgent(json.agent)
      setKpis(json.kpis ?? [])
      setMeasurements(json.latestMeasurements ?? [])
      setAgentRoutines(json.routines ?? [])
      setActivity(json.recentActivity ?? [])
      setFrameworks(json.frameworks ?? [])
      setAgentApprovals(json.approvals ?? [])
      setPerfStats(json.performanceStats ?? { totalEvents: 0, totalCost: 0, byType: [] })
    } catch {
      setError('Failed to load agent')
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    fetchAgent()
  }, [fetchAgent])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
      </div>
    )
  }

  if (error || !agent) {
    return (
      <PageShell eyebrow="Agents" title="Employee not found" description={error ?? 'The requested agent does not exist.'}>
        <button
          onClick={() => router.push('/agents')}
          className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-zinc-200 transition-colors hover:border-white/20 hover:bg-white/[0.08]"
        >
          Back to roster
        </button>
      </PageShell>
    )
  }

  const measurementMap = new Map(measurements.map((m) => [m.kpiId, m]))
  const pendingApprovals = agentApprovals.filter((a) => a.status === 'pending').length

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'kpis', label: 'KPIs', count: kpis.length },
    { id: 'routines', label: 'Routines', count: agentRoutines.length },
    { id: 'playbooks', label: 'Playbooks', count: frameworks.length },
    { id: 'approvals', label: 'Approvals', count: pendingApprovals },
    { id: 'history', label: 'Performance' },
  ]

  return (
    <PageShell
      eyebrow="Employee profile"
      title={agent.name}
      description={agent.title}
      actions={
        <button
          onClick={() => router.push('/agents')}
          className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-zinc-200 transition-colors hover:border-white/20 hover:bg-white/[0.08]"
        >
          Back to roster
        </button>
      }
    >
      {/* ── Profile header ── */}
      <Panel glow="cyan" className="mb-6">
        <div className="flex items-start gap-5">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-[1.4rem] border border-white/10 bg-white/[0.05] text-3xl">
            {agent.icon || '\u{1F916}'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              {agent.department && <Badge tone="blue">{agent.department}</Badge>}
              <Badge tone={getStatusTone(agent.status)}>{agent.status ?? 'unknown'}</Badge>
              {agent.archetype && <Badge tone="cyan">{agent.archetype}</Badge>}
            </div>
            {agent.objective && (
              <p className="text-sm leading-6 text-zinc-300 max-w-3xl">{agent.objective}</p>
            )}
          </div>
        </div>

        {/* Headline KPIs */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Total runs" value={agent.totalRuns ?? 0} accent="cyan" />
          <MetricCard
            label="Success rate"
            value={agent.successRate != null ? `${agent.successRate.toFixed(0)}%` : '--'}
            accent={
              agent.successRate != null
                ? agent.successRate >= 80 ? 'emerald' : agent.successRate >= 50 ? 'amber' : 'rose'
                : 'cyan'
            }
          />
          <MetricCard label="Total cost" value={formatCost(agent.totalCostUsd)} accent="amber" />
          <MetricCard label="Manager" value={agent.managerId ?? 'None'} accent="blue" />
        </div>
      </Panel>

      {/* ── Policy card ── */}
      <Panel className="mb-6">
        <PanelHeader eyebrow="Policy" title="Configuration & constraints" />
        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500 mb-2">Allowed tools</p>
            {agent.allowedTools.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {agent.allowedTools.map((tool) => (
                  <span
                    key={tool}
                    className="inline-block rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-mono text-zinc-300"
                  >
                    {tool}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-500">No restrictions — all tools allowed</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {agent.modelPreference && (
              <div>
                <span className="text-zinc-500">Model:</span>{' '}
                <span className="text-zinc-300">{agent.modelPreference}</span>
              </div>
            )}
            <div>
              <span className="text-zinc-500">Budget used:</span>{' '}
              <span className="text-zinc-300">{formatCost(agent.totalCostUsd)}</span>
            </div>
          </div>
        </div>
      </Panel>

      {/* ── Tab bar ── */}
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <TabButton
            key={tab.id}
            label={tab.label}
            active={activeTab === tab.id}
            count={tab.count}
            onClick={() => setActiveTab(tab.id)}
          />
        ))}
      </div>

      {/* ── Tab content ── */}
      <Panel glow={activeTab === 'approvals' && pendingApprovals > 0 ? 'amber' : 'none'}>
        <PanelHeader
          eyebrow={tabs.find((t) => t.id === activeTab)?.label}
          title={
            activeTab === 'kpis' ? 'Key performance indicators' :
            activeTab === 'routines' ? 'Scheduled routines' :
            activeTab === 'playbooks' ? 'Operating playbooks' :
            activeTab === 'approvals' ? 'Approval queue' :
            'Performance history'
          }
        />

        {activeTab === 'kpis' && <KpisSection kpis={kpis} measurementMap={measurementMap} />}
        {activeTab === 'routines' && <RoutinesSection routines={agentRoutines} />}
        {activeTab === 'playbooks' && <PlaybooksSection frameworks={frameworks} />}
        {activeTab === 'approvals' && <ApprovalsSection approvals={agentApprovals} />}
        {activeTab === 'history' && <PerformanceSection activity={activity} stats={perfStats} />}
      </Panel>
    </PageShell>
  )
}
