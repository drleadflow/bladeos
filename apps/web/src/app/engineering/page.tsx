'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Badge,
  MetricCard,
  PageShell,
  Panel,
  PanelHeader,
  StatusDot,
} from '@/components/dashboard/cockpit-ui'

interface WorkerSession {
  id: string
  status: string
}

interface ActivityEvent {
  id: number
  eventType: string
  actorId: string
  summary: string
  createdAt: string
  costUsd: number
}

interface CostData {
  totalUsd: number
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

const QUICK_LINKS = [
  { href: '/engineering/runs', label: 'Pipeline Runs', description: 'Live execution timeline of all agent events.' },
  { href: '/engineering/workers', label: 'Active Workers', description: 'Control and inspect live worker sessions.' },
  { href: '/engineering/jobs', label: 'Coding Jobs', description: 'View and manage async coding jobs.' },
  { href: '/engineering/costs', label: 'AI Costs', description: 'Model spend, token telemetry, and daily breakdown.' },
]

export default function EngineeringDashboardPage() {
  const [workers, setWorkers] = useState<WorkerSession[]>([])
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [costData, setCostData] = useState<CostData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    try {
      const [workersRes, timelineRes, costsRes] = await Promise.all([
        fetch('/api/workers', { cache: 'no-store' }),
        fetch('/api/timeline?limit=15'),
        fetch('/api/costs'),
      ])
      const [wJson, tJson, cJson] = await Promise.all([
        workersRes.json(),
        timelineRes.json(),
        costsRes.json(),
      ])
      if (wJson.success) setWorkers(wJson.data)
      if (tJson.success) setEvents(tJson.data.events)
      if (cJson.success) setCostData(cJson.data)
    } catch {
      // keep current state
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 6000)
    return () => clearInterval(interval)
  }, [fetchAll])

  const liveWorkers = useMemo(
    () => workers.filter((w) => ['booting', 'active', 'stopping'].includes(w.status)).length,
    [workers]
  )

  const runningJobs = useMemo(
    () => events.filter((e) => e.eventType === 'job_start').length,
    [events]
  )

  const todayCost = costData ? `$${costData.totalUsd.toFixed(4)}` : '—'

  return (
    <PageShell
      eyebrow="Engineering"
      title="Engineering control plane"
      description="The technical layer — pipeline runs, active workers, coding jobs, and AI spend all in one place."
      actions={
        <div className="flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-2 text-xs uppercase tracking-[0.2em] text-blue-300">
          <StatusDot tone="cyan" />
          Live
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Active Workers" value={liveWorkers} hint="Worker sessions currently booting or active." accent="blue" />
        <MetricCard label="Running Jobs" value={runningJobs} hint="Job-start events in the recent feed." accent="blue" />
        <MetricCard label="Total Runs" value={events.length} hint="Events visible in the current feed window." accent="cyan" />
        <MetricCard label="Cost (window)" value={todayCost} hint="Total spend across the current reporting window." accent="amber" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <Panel>
          <PanelHeader
            eyebrow="Navigation"
            title="Engineering surfaces"
            description="Jump directly to any engineering sub-system."
          />
          <div className="space-y-3">
            {QUICK_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-start gap-4 rounded-[1.3rem] border border-white/10 bg-zinc-950/45 px-4 py-4 transition-colors hover:border-blue-400/20 hover:bg-white/[0.05]"
              >
                <div className="pt-1.5">
                  <div className="h-2 w-2 rounded-full bg-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-100">{link.label}</p>
                  <p className="mt-1 text-xs text-zinc-500">{link.description}</p>
                </div>
              </Link>
            ))}
          </div>

          <div className="mt-4 rounded-[1.3rem] border border-white/10 bg-zinc-950/45 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">System Note</p>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              {liveWorkers > 0
                ? `${liveWorkers} worker${liveWorkers > 1 ? 's' : ''} live right now. Monitor closely for errors or approval requests.`
                : 'No live workers. Create a job to start a worker session.'}
            </p>
          </div>
        </Panel>

        <Panel glow="cyan">
          <PanelHeader
            eyebrow="Activity"
            title="Recent run events"
            description="Live execution trace from the pipeline."
          />
          {loading ? (
            <div className="grid min-h-[300px] place-items-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
            </div>
          ) : events.length === 0 ? (
            <div className="grid min-h-[200px] place-items-center text-center">
              <div>
                <p className="text-sm font-medium text-zinc-300">No activity yet</p>
                <p className="mt-1 text-xs text-zinc-500">Engineering events will appear as jobs run.</p>
              </div>
            </div>
          ) : (
            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="flex items-start gap-3 rounded-[1.2rem] border border-white/10 bg-zinc-950/45 px-4 py-3 transition-colors hover:border-white/20"
                >
                  <div className="pt-1">
                    <StatusDot
                      tone={
                        event.eventType === 'error' || event.eventType === 'job_fail'
                          ? 'rose'
                          : event.eventType === 'job_complete'
                            ? 'emerald'
                            : 'cyan'
                      }
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge
                        tone={
                          event.eventType === 'error' || event.eventType === 'job_fail'
                            ? 'rose'
                            : event.eventType === 'job_complete'
                              ? 'emerald'
                              : 'cyan'
                        }
                      >
                        {event.eventType}
                      </Badge>
                      <span className="text-xs text-zinc-500">{event.actorId || 'blade'}</span>
                    </div>
                    <p className="truncate text-sm text-zinc-300">{event.summary}</p>
                    <div className="mt-1 flex items-center gap-3 text-xs text-zinc-600">
                      <span>{relativeTime(event.createdAt)}</span>
                      {event.costUsd > 0 && (
                        <span className="text-amber-400">${event.costUsd.toFixed(4)}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </PageShell>
  )
}
