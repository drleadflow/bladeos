'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import ApprovalsInbox from '@/components/approvals/inbox'
import {
  ActionButton,
  Badge,
  EmptyState,
  MetricCard,
  PageShell,
  Panel,
  PanelHeader,
  StatusDot,
} from '@/components/dashboard/cockpit-ui'

interface MonitorAlert {
  id: number
  monitorId: string
  monitorName: string
  severity: string
  message: string
  value: string | null
  acknowledged: number
  createdAt: string
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

interface ActiveAgent {
  id: string
  slug: string
  name: string
  title: string
  pillar: string
  description: string
  icon: string
  archetype: string | null
}

interface CostSummary {
  totalUsd: number
  byModel: Record<string, number>
  byDay: Record<string, number>
  tokenCount: { input: number; output: number }
}

interface EvalSummary {
  totalJobs: number
  passed: number
  failed: number
  partial: number
  successRatePct: number
  avgCostUsd: number
  avgDurationSec: number
  avgToolCalls: number
  avgFixCycles: number
}

interface TodayData {
  alerts: MonitorAlert[]
  criticalAlertCount: number
  warningAlertCount: number
  topAlert: MonitorAlert | null
  pendingApprovals: number
  recentActivity: ActivityEvent[]
  todayCost: CostSummary
  activeAgents: ActiveAgent[]
  todayEventCount: number
  evalSummary?: EvalSummary
  activeWorkerCount?: number
  systemHealth?: number
}

const EVENT_TYPE_STYLES: Record<string, { icon: string; tone: 'blue' | 'cyan' | 'emerald' | 'rose' | 'amber' | 'neutral' }> = {
  conversation: { icon: 'Conversation', tone: 'blue' },
  tool_call: { icon: 'Tool Call', tone: 'cyan' },
  approval: { icon: 'Approval', tone: 'emerald' },
  error: { icon: 'Error', tone: 'rose' },
  job_start: { icon: 'Job Start', tone: 'cyan' },
  job_complete: { icon: 'Complete', tone: 'emerald' },
  job_fail: { icon: 'Failed', tone: 'rose' },
  cost: { icon: 'Cost', tone: 'amber' },
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

function formatCost(usd: number): string {
  if (usd === 0) return '$0.00'
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(2)}`
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
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

function getSeverityTone(severity: string): 'rose' | 'amber' | 'blue' {
  if (severity === 'critical' || severity === 'error') return 'rose'
  if (severity === 'warning') return 'amber'
  return 'blue'
}

function getAlertAction(severity: string): string {
  if (severity === 'critical' || severity === 'error') return 'Escalate now and assign an owner.'
  if (severity === 'warning' || severity === 'high') return 'Review before the next execution cycle.'
  return 'Watch for drift and keep the board clear.'
}

function getActivityImpact(eventType: string): string {
  if (eventType === 'tool_call') return 'Blade executed a tool and moved work forward.'
  if (eventType === 'job_start') return 'A new implementation job entered the pipeline.'
  if (eventType === 'job_complete') return 'A job finished and likely produced a usable output.'
  if (eventType === 'job_fail') return 'A job failed and may need human follow-up.'
  if (eventType === 'approval') return 'A human decision unblocked a downstream action.'
  if (eventType === 'error') return 'Something needs attention before it compounds.'
  if (eventType === 'cost') return 'Spend changed and should be checked against budget.'
  return 'A business event changed the operating picture.'
}

export default function TodayPage() {
  const [data, setData] = useState<TodayData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/today')
      const json = await res.json()
      if (json.success) {
        setData(json.data)
      }
    } catch {
      // Silently retry on next poll.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  const leadAlert = data?.alerts[0] ?? null
  const activityStats = useMemo(() => {
    if (!data) {
      return {
        toolCalls: 0,
        jobEvents: 0,
        approvals: 0,
        errors: 0,
        conversations: 0,
      }
    }

    return data.recentActivity.reduce(
      (stats, event) => {
        if (event.eventType === 'tool_call') stats.toolCalls += 1
        if (event.eventType.startsWith('job_')) stats.jobEvents += 1
        if (event.eventType === 'approval') stats.approvals += 1
        if (event.eventType === 'error') stats.errors += 1
        if (event.eventType === 'conversation') stats.conversations += 1
        return stats
      },
      {
        toolCalls: 0,
        jobEvents: 0,
        approvals: 0,
        errors: 0,
        conversations: 0,
      }
    )
  }, [data])

  const priorityQueue = useMemo(() => {
    if (!data) return []

    const items: Array<{
      rank: string
      title: string
      detail: string
      tone: 'blue' | 'cyan' | 'emerald' | 'rose' | 'amber' | 'neutral'
    }> = []

    if (leadAlert) {
      items.push({
        rank: 'Priority 1',
        title: leadAlert.monitorName,
        detail: `${leadAlert.message} ${getAlertAction(leadAlert.severity)}`,
        tone: getSeverityTone(leadAlert.severity),
      })
    }

    if (data.pendingApprovals > 0) {
      items.push({
        rank: items.length === 0 ? 'Priority 1' : 'Priority 2',
        title: `${data.pendingApprovals} approvals waiting`,
        detail:
          data.pendingApprovals === 1
            ? 'One decision is blocking execution. Clear it to let Blade continue.'
            : 'Multiple human decisions are blocking downstream work. Clear the queue to unblock the workforce.',
        tone: 'amber',
      })
    }

    const topActivity = data.recentActivity[0]
    if (topActivity) {
      items.push({
        rank: items.length === 0 ? 'Priority 1' : items.length === 1 ? 'Priority 2' : 'Priority 3',
        title: topActivity.summary,
        detail: getActivityImpact(topActivity.eventType),
        tone: topActivity.eventType === 'error' ? 'rose' : topActivity.eventType === 'approval' ? 'emerald' : 'cyan',
      })
    }

    if (items.length === 0) {
      items.push({
        rank: 'Priority',
        title: 'Board clear',
        detail: 'No immediate blockers. Use the quiet board to pursue the highest-leverage work.',
        tone: 'emerald',
      })
    }

    return items.slice(0, 3)
  }, [data, leadAlert])

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <EmptyState
          title="Dashboard unavailable"
          description="Blade couldn't load today's control-center data. Try refreshing in a moment."
        />
      </div>
    )
  }

  return (
    <PageShell
      eyebrow="Today"
      title={`${getGreeting()}, Emeka.`}
      description={`${formatDate()} — this is the operational snapshot of what Blade is watching, what needs approval, and where momentum is building.`}
      actions={
        <>
          <ActionButton href="/">Open Chat</ActionButton>
          <ActionButton href="/runs" tone="secondary">Live Runs</ActionButton>
          <ActionButton href="/workers" tone="secondary">Workers</ActionButton>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1.6fr_0.9fr]">
        <Panel glow="cyan" className="overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />
          <PanelHeader
            eyebrow="Executive Brief"
            title={leadAlert ? `Priority 1: ${leadAlert.monitorName}` : 'Board is clear'}
            description={
              leadAlert
                ? `${leadAlert.message} ${getAlertAction(leadAlert.severity)}`
                : 'No active alerts right now. Blade is monitoring the business and keeping the board clear.'
            }
            aside={<Badge tone={leadAlert ? getSeverityTone(leadAlert.severity) : 'emerald'}>{leadAlert ? leadAlert.severity : 'stable'}</Badge>}
          />

          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
            <MetricCard
              label="System Health"
              value={data.systemHealth != null ? `${data.systemHealth}%` : '--'}
              hint="Composite score from alerts, eval rate, cost, and agents."
              accent={data.systemHealth != null && data.systemHealth >= 70 ? 'emerald' : data.systemHealth != null && data.systemHealth >= 40 ? 'amber' : 'rose'}
            />
            <MetricCard
              label="Success Rate"
              value={data.evalSummary?.totalJobs ? `${data.evalSummary.successRatePct}%` : '--'}
              hint={data.evalSummary?.totalJobs ? `${data.evalSummary.passed}/${data.evalSummary.totalJobs} jobs passed (30d)` : 'No eval data yet'}
              accent={data.evalSummary && data.evalSummary.successRatePct >= 80 ? 'emerald' : data.evalSummary && data.evalSummary.successRatePct >= 50 ? 'amber' : 'cyan'}
            />
            <MetricCard
              label="Events Today"
              value={data.todayEventCount}
              hint="Everything Blade surfaced, executed, or logged."
              accent="cyan"
            />
            <MetricCard
              label="Pending Approvals"
              value={data.pendingApprovals}
              hint={data.pendingApprovals > 0 ? 'Human decisions are holding work back.' : 'No decisions waiting on you.'}
              accent={data.pendingApprovals > 0 ? 'amber' : 'emerald'}
            />
            <MetricCard
              label="Today's Cost"
              value={formatCost(data.todayCost.totalUsd)}
              hint={`${data.todayCost.tokenCount.input + data.todayCost.tokenCount.output} total tokens`}
              accent="blue"
            />
            <MetricCard
              label="Active Agents"
              value={data.activeAgents.length}
              hint={data.activeWorkerCount ? `${data.activeWorkerCount} worker(s) running` : 'The current workforce on deck.'}
              accent="emerald"
            />
          </div>

          <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge tone={leadAlert ? getSeverityTone(leadAlert.severity) : 'emerald'}>
                {leadAlert ? 'Priority queue open' : 'No priority queue'}
              </Badge>
              <Badge tone={data.pendingApprovals > 0 ? 'amber' : 'emerald'}>
                {data.pendingApprovals} approvals
              </Badge>
              <Badge tone={activityStats.errors > 0 ? 'rose' : 'cyan'}>
                {activityStats.errors} errors
              </Badge>
            </div>
            <div className="space-y-3">
              {priorityQueue.map((item) => (
                <div key={`${item.rank}-${item.title}`} className="rounded-[1.1rem] border border-white/10 bg-white/[0.03] px-4 py-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge tone={item.tone}>{item.rank}</Badge>
                    <span className="text-xs uppercase tracking-[0.18em] text-zinc-500">Blade priority</span>
                  </div>
                  <p className="text-sm font-medium text-zinc-100">{item.title}</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-400">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel glow="emerald">
          <PanelHeader
            eyebrow="Operating Posture"
            title="Live posture"
            description="A quick pulse check across the workforce and decision queue."
          />
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-[1.3rem] border border-white/10 bg-zinc-950/50 px-4 py-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Active agents</p>
                <p className="mt-1 text-2xl font-semibold text-zinc-100">{data.activeAgents.length}</p>
              </div>
              <StatusDot tone={data.activeAgents.length > 0 ? 'emerald' : 'neutral'} />
            </div>
            <div className="flex items-center justify-between rounded-[1.3rem] border border-white/10 bg-zinc-950/50 px-4 py-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Alert pressure</p>
                <p className="mt-1 text-2xl font-semibold text-zinc-100">{data.alerts.length}</p>
              </div>
              <StatusDot tone={data.alerts.length > 0 ? 'amber' : 'emerald'} />
            </div>
            {data.evalSummary && data.evalSummary.totalJobs > 0 && (
              <div className="flex items-center justify-between rounded-[1.3rem] border border-white/10 bg-zinc-950/50 px-4 py-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Job success (30d)</p>
                  <p className="mt-1 text-2xl font-semibold text-zinc-100">{data.evalSummary.successRatePct}%</p>
                  <p className="text-xs text-zinc-500">{data.evalSummary.passed}/{data.evalSummary.totalJobs} passed, avg ${data.evalSummary.avgCostUsd.toFixed(4)}/job</p>
                </div>
                <StatusDot tone={data.evalSummary.successRatePct >= 80 ? 'emerald' : data.evalSummary.successRatePct >= 50 ? 'amber' : 'rose'} />
              </div>
            )}
            {(data.activeWorkerCount ?? 0) > 0 && (
              <div className="flex items-center justify-between rounded-[1.3rem] border border-white/10 bg-zinc-950/50 px-4 py-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Active workers</p>
                  <p className="mt-1 text-2xl font-semibold text-zinc-100">{data.activeWorkerCount}</p>
                </div>
                <StatusDot tone="cyan" />
              </div>
            )}
            <div className="flex items-center justify-between rounded-[1.3rem] border border-white/10 bg-zinc-950/50 px-4 py-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Pending approvals</p>
                <p className="mt-1 text-2xl font-semibold text-zinc-100">{data.pendingApprovals}</p>
              </div>
              <StatusDot tone={data.pendingApprovals > 0 ? 'amber' : 'emerald'} />
            </div>
            <div className="rounded-[1.3rem] border border-white/10 bg-gradient-to-br from-white/[0.05] to-cyan-400/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Recommended move</p>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                {data.pendingApprovals > 0
                  ? 'Clear approvals first to unblock execution across active agents.'
                  : data.alerts.length > 0
                    ? 'Review the newest alert and assign follow-up before the next cycle.'
                    : 'Use the quiet board to kick off higher-leverage work while the system is clear.'}
              </p>
            </div>
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Panel>
          <PanelHeader
            eyebrow="Execution Feed"
            title="What changed most recently"
            description="A live operational feed of what Blade has been doing."
            aside={
              <Link href="/runs" className="text-sm text-cyan-300 transition-colors hover:text-cyan-200">
                View full timeline
              </Link>
            }
          />
          <div className="mb-4 flex flex-wrap gap-2">
            <Badge tone="cyan">{data.todayEventCount} events</Badge>
            <Badge tone="blue">{activityStats.toolCalls} tool calls</Badge>
            <Badge tone="amber">{activityStats.jobEvents} job events</Badge>
            <Badge tone={activityStats.approvals > 0 ? 'emerald' : 'neutral'}>{activityStats.approvals} approvals</Badge>
          </div>

          {data.recentActivity.length === 0 ? (
            <EmptyState
              title="No activity yet"
              description="As agents act, investigate, and finish work, the most important moments will land here."
            />
          ) : (
            <div className="space-y-3">
              {data.recentActivity.map((event) => {
                const style = EVENT_TYPE_STYLES[event.eventType] ?? { icon: 'Event', tone: 'neutral' as const }
                return (
                  <div
                    key={event.id}
                    className="rounded-[1.3rem] border border-white/10 bg-zinc-950/45 px-4 py-4 transition-colors hover:border-white/20"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <Badge tone={style.tone}>{style.icon}</Badge>
                          <span className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                            {event.actorId || 'Blade'}
                          </span>
                        </div>
                        <p className="text-sm leading-6 text-zinc-100">{event.summary}</p>
                        <p className="mt-2 text-sm leading-6 text-zinc-500">{getActivityImpact(event.eventType)}</p>
                        {event.jobId ? (
                          <p className="mt-2 text-xs text-zinc-500">Job {event.jobId}</p>
                        ) : null}
                      </div>
                      <div className="text-right text-xs text-zinc-500">
                        <div>{relativeTime(event.createdAt)}</div>
                        {event.costUsd > 0 ? (
                          <div className="mt-2 text-amber-300">{formatCost(event.costUsd)}</div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel glow={data.alerts.length > 0 ? 'amber' : 'emerald'}>
            <PanelHeader
              eyebrow="Alerts"
              title={data.alerts.length > 0 ? 'Watch items' : 'System clear'}
              description={
                data.alerts.length > 0
                  ? `${data.criticalAlertCount} critical, ${data.warningAlertCount} elevated. Blade has surfaced issues that may need intervention.`
                  : 'No active alerts. Monitoring is calm right now.'
              }
            />
            {data.alerts.length > 0 ? (
              <div className="mb-4 flex flex-wrap gap-2">
                <Badge tone="rose">{data.criticalAlertCount} critical</Badge>
                <Badge tone="amber">{data.warningAlertCount} elevated</Badge>
                <Badge tone="blue">{data.alerts.length} open</Badge>
              </div>
            ) : null}
            {data.alerts.length === 0 ? (
              <EmptyState
                title="No active alerts"
                description="Your monitors are quiet. Blade will raise anything material here."
              />
            ) : (
              <div className="space-y-3">
                {data.alerts.slice(0, 3).map((alert) => (
                  <div key={alert.id} className="rounded-[1.3rem] border border-white/10 bg-zinc-950/45 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <Badge tone={getSeverityTone(alert.severity)}>{alert.severity}</Badge>
                          <span className="text-xs uppercase tracking-[0.18em] text-zinc-500">{alert.monitorName}</span>
                        </div>
                        <p className="text-sm leading-6 text-zinc-200">{alert.message}</p>
                        <p className="mt-2 text-xs text-zinc-500">{getAlertAction(alert.severity)}</p>
                      </div>
                      <span className="text-xs text-zinc-500">{relativeTime(alert.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel>
            <PanelHeader
              eyebrow="Active Agents"
              title="Who is on deck"
              description="A quick roster of the currently active workforce."
            />
            {data.activeAgents.length === 0 ? (
              <EmptyState
                title="No active agents"
                description="Onboard employees and activate them to populate the roster."
              />
            ) : (
              <div className="space-y-3">
                {data.activeAgents.slice(0, 4).map((agent) => (
                  <Link
                    key={agent.id}
                    href={`/agents/${agent.slug}`}
                    className="flex items-center gap-3 rounded-[1.25rem] border border-white/10 bg-zinc-950/45 px-4 py-3 transition-colors hover:border-cyan-400/20 hover:bg-white/[0.05]"
                  >
                    <span className="text-2xl">{agent.icon || '🤖'}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-zinc-100">{agent.name}</p>
                        <StatusDot tone="emerald" />
                      </div>
                      <p className="truncate text-xs text-zinc-500">{agent.title}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge tone="blue">{agent.pillar}</Badge>
                        {agent.archetype ? <Badge tone="neutral">{agent.archetype}</Badge> : null}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>

      {data.pendingApprovals > 0 ? (
        <div className="mt-4">
          <Panel glow="amber">
            <PanelHeader
              eyebrow="Approvals"
              title="Decisions waiting on you"
              description="Approve or reject the actions that require human sign-off."
            />
            <ApprovalsInbox />
          </Panel>
        </div>
      ) : null}
    </PageShell>
  )
}
