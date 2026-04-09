'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Badge,
  EmptyState,
  MetricCard,
  PageShell,
  Panel,
  PanelHeader,
  StatusDot,
} from '@/components/dashboard/cockpit-ui'

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

type FilterType = 'all' | 'conversation' | 'conversation_reply' | 'tool_call' | 'approval' | 'error' | 'worker_stop_requested' | 'worker_retry_requested' | 'worker_failed' | 'monitor.check'

const FILTERS: { label: string; value: FilterType }[] = [
  { label: 'All', value: 'all' },
  { label: 'Conversations', value: 'conversation' },
  { label: 'Replies', value: 'conversation_reply' },
  { label: 'Tool Calls', value: 'tool_call' },
  { label: 'Worker Stops', value: 'worker_stop_requested' },
  { label: 'Approvals', value: 'approval' },
  { label: 'Errors', value: 'error' },
]

const EVENT_TYPE_STYLES: Record<string, { label: string; tone: 'blue' | 'cyan' | 'emerald' | 'rose' | 'amber' | 'neutral' }> = {
  conversation: { label: 'Conversation', tone: 'blue' },
  conversation_reply: { label: 'Reply', tone: 'emerald' },
  tool_call: { label: 'Tool Call', tone: 'cyan' },
  approval: { label: 'Approval', tone: 'emerald' },
  error: { label: 'Error', tone: 'rose' },
  job_start: { label: 'Job Start', tone: 'cyan' },
  job_complete: { label: 'Complete', tone: 'emerald' },
  job_fail: { label: 'Failed', tone: 'rose' },
  cost: { label: 'Cost', tone: 'amber' },
  worker_stop_requested: { label: 'Worker Stop', tone: 'amber' },
  worker_retry_requested: { label: 'Worker Retry', tone: 'cyan' },
  worker_failed: { label: 'Worker Failed', tone: 'rose' },
  'monitor.check': { label: 'Monitor', tone: 'amber' },
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
  return `$${usd.toFixed(4)}`
}

function parseDetail(detailJson: string | null): Record<string, string> {
  if (!detailJson) return {}

  try {
    const parsed = JSON.parse(detailJson) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, value]) => value !== null && value !== undefined && value !== '')
        .slice(0, 4)
        .map(([key, value]) => [key, String(value)])
    )
  } catch {
    return {}
  }
}

function getEventHref(event: ActivityEvent): string | null {
  if (event.targetType === 'worker' && event.targetId) {
    return '/workers'
  }
  if (event.jobId) {
    return '/jobs'
  }
  if (event.conversationId) {
    return '/'
  }
  if (event.eventType === 'approval') {
    return '/today'
  }
  return null
}

export default function RunsPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [total, setTotal] = useState(0)
  const [filter, setFilter] = useState<FilterType>('all')
  const [loading, setLoading] = useState(true)
  const feedRef = useRef<HTMLDivElement>(null)
  const prevCountRef = useRef(0)

  const fetchEvents = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '100' })
      if (filter !== 'all') {
        params.set('type', filter)
      }
      const res = await fetch(`/api/timeline?${params.toString()}`)
      const json = await res.json()
      if (json.success) {
        const incoming = json.data.events as ActivityEvent[]
        setEvents(incoming)
        setTotal(json.data.total)

        if (incoming.length > prevCountRef.current && feedRef.current) {
          feedRef.current.scrollTo({ top: 0, behavior: 'smooth' })
        }
        prevCountRef.current = incoming.length
      }
    } catch {
      // Silently retry on next poll.
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    setLoading(true)
    fetchEvents()
    const interval = setInterval(fetchEvents, 5000)
    return () => clearInterval(interval)
  }, [fetchEvents])

  const errorCount = events.filter((event) => event.eventType === 'error').length
  const approvalCount = events.filter((event) => event.eventType === 'approval').length
  const workerActionCount = events.filter((event) => event.eventType.startsWith('worker_')).length
  const totalCost = events.reduce((sum, event) => sum + event.costUsd, 0)

  return (
    <PageShell
      eyebrow="Runs"
      title="Live execution timeline"
      description="This is the operational feed of what Blade is doing right now, what has completed, and where intervention may be needed."
      actions={
        <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs uppercase tracking-[0.2em] text-emerald-300">
          <StatusDot tone="emerald" />
          Live
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-3">
            <MetricCard label="Visible events" value={total} hint="Recent operational moments across the system." accent="cyan" />
        <MetricCard label="Errors" value={errorCount} hint="Exceptions surfaced in the current feed." accent={errorCount > 0 ? 'rose' : 'emerald'} />
        <MetricCard label="Feed cost" value={formatCost(totalCost)} hint={`${approvalCount} approvals, ${workerActionCount} worker actions`} accent="amber" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[0.82fr_1.18fr]">
        <Panel>
          <PanelHeader
            eyebrow="Filters"
            title="Tune the signal"
            description="Focus the board on the type of work you want to inspect."
          />
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`rounded-full px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] transition-all ${
                  filter === f.value
                    ? 'bg-white text-zinc-950'
                    : 'border border-white/10 bg-white/[0.04] text-zinc-400 hover:border-white/20 hover:bg-white/[0.08] hover:text-zinc-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="mt-6 space-y-3">
            <div className="rounded-[1.3rem] border border-white/10 bg-zinc-950/45 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Attention</p>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                {errorCount > 0
                  ? 'Errors are present in the active feed. Investigate the newest red event first.'
                  : approvalCount > 0
                    ? 'Approvals are stacking up. Clearing them will restore flow.'
                    : 'The timeline looks clean. Use this view to validate that work is progressing smoothly.'}
              </p>
            </div>
            <div className="rounded-[1.3rem] border border-white/10 bg-zinc-950/45 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Why this matters</p>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                The best agent interface makes execution legible. This feed is where Blade proves it is acting, not just responding.
              </p>
            </div>
          </div>
        </Panel>

        <Panel glow="cyan">
          <PanelHeader
            eyebrow="Execution Feed"
            title="Recent runs and events"
            description="A chronological trace of conversations, tool use, approvals, failures, and completions."
          />

          {loading ? (
            <div className="grid min-h-[420px] place-items-center">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
            </div>
          ) : events.length === 0 ? (
            <EmptyState
              title="No activity yet"
              description="As agents begin working, the timeline will fill with the operational trace."
            />
          ) : (
            <div ref={feedRef} className="space-y-3 max-h-[calc(100vh-300px)] overflow-y-auto pr-1">
                {events.map((event) => {
                  const style = EVENT_TYPE_STYLES[event.eventType] ?? { label: 'Event', tone: 'neutral' as const }
                  const detail = parseDetail(event.detailJson)
                  const href = getEventHref(event)
                  return (
                  <div
                    key={event.id}
                    className="rounded-[1.35rem] border border-white/10 bg-zinc-950/45 px-4 py-4 transition-colors hover:border-white/20"
                  >
                    <div className="flex items-start gap-4">
                      <div className="pt-1">
                        <StatusDot
                          tone={
                            style.tone === 'blue'
                              ? 'cyan'
                              : style.tone === 'neutral'
                                ? 'neutral'
                                : style.tone
                          }
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <Badge tone={style.tone}>{style.label}</Badge>
                          <span className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                            {event.actorId || 'Blade'}
                          </span>
                        </div>
                        <p className="text-sm leading-6 text-zinc-200">{event.summary}</p>
                        {Object.keys(detail).length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
                            {Object.entries(detail).map(([key, value]) => (
                              <span
                                key={key}
                                className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1"
                              >
                                {key}: {value}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-zinc-500">
                          <span>{relativeTime(event.createdAt)}</span>
                          {event.conversationId ? <span>Conversation {event.conversationId.slice(0, 8)}</span> : null}
                          {event.jobId ? <span>Job {event.jobId}</span> : null}
                          {event.costUsd > 0 ? <span className="text-amber-300">{formatCost(event.costUsd)}</span> : null}
                          {href ? (
                            <Link href={href} className="text-cyan-300 transition-colors hover:text-cyan-200">
                              Open related surface
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
      </div>
    </PageShell>
  )
}
