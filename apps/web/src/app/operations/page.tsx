'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Badge,
  MetricCard,
  PageShell,
  Panel,
  PanelHeader,
  StatusDot,
} from '@/components/dashboard/cockpit-ui'

interface ActivityEvent {
  id: number
  eventType: string
  actorId: string
  summary: string
  createdAt: string
  costUsd: number
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
  { href: '/operations/workflows', label: 'Workflow Runs', description: 'View and inspect multi-step workflow executions.' },
  { href: '/operations/monitors', label: 'System Monitors', description: 'Cost burn, memory health, and employee health checks.' },
  { href: '/operations/automations', label: 'Automations', description: 'Toggle and manage automation rules.' },
  { href: '/operations/cron', label: 'Cron Jobs', description: 'Scheduled jobs, next run times, and status.' },
]

export default function OperationsDashboardPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Initial fetch
    fetch('/api/timeline?limit=50', { credentials: 'include' })
      .then(r => r.json())
      .then(json => {
        if (json.success) setEvents(json.data.events as ActivityEvent[])
      })
      .catch(() => {})
      .finally(() => setLoading(false))

    // SSE stream for real-time updates
    const eventSource = new EventSource('/api/timeline/stream')

    eventSource.addEventListener('activity', (e) => {
      try {
        const event = JSON.parse(e.data) as ActivityEvent
        setEvents(prev => [event, ...prev].slice(0, 100))
      } catch { /* ignore parse errors */ }
    })

    eventSource.addEventListener('init', (e) => {
      try {
        const { events: initialEvents } = JSON.parse(e.data) as { events: ActivityEvent[] }
        setEvents(initialEvents)
        setLoading(false)
      } catch { /* ignore */ }
    })

    eventSource.onerror = () => {
      // EventSource auto-reconnects, no action needed
    }

    return () => eventSource.close()
  }, [])

  const monitorAlerts = events.filter((e) => e.eventType === 'monitor.check').length
  const errorCount = events.filter((e) => e.eventType === 'error').length

  return (
    <PageShell
      eyebrow="Operations"
      title="Ops command center"
      description="The operational layer of Blade — workflows, monitors, automations, and scheduled jobs in one surface."
      actions={
        <div className="flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs uppercase tracking-[0.2em] text-amber-300">
          <StatusDot tone="amber" />
          Live
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Active Workflows" value="—" hint="Live workflow executions." accent="amber" />
        <MetricCard label="Monitor Alerts" value={monitorAlerts} hint="Monitor check events in feed." accent={monitorAlerts > 0 ? 'rose' : 'amber'} />
        <MetricCard label="Running Automations" value="—" hint="Automation rules currently firing." accent="amber" />
        <MetricCard label="Cron Jobs" value={5} hint="Scheduled recurring jobs registered." accent="amber" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <Panel>
          <PanelHeader
            eyebrow="Navigation"
            title="Ops surfaces"
            description="Jump directly to any operational sub-system."
          />
          <div className="space-y-3">
            {QUICK_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-start gap-4 rounded-[1.3rem] border border-white/10 bg-zinc-950/45 px-4 py-4 transition-colors hover:border-amber-400/20 hover:bg-white/[0.05]"
              >
                <div className="pt-1.5">
                  <div className="h-2 w-2 rounded-full bg-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-100">{link.label}</p>
                  <p className="mt-1 text-xs text-zinc-500">{link.description}</p>
                </div>
              </Link>
            ))}
          </div>

          <div className="mt-4 rounded-[1.3rem] border border-white/10 bg-zinc-950/45 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Ops Health</p>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              {errorCount > 0
                ? `${errorCount} error${errorCount > 1 ? 's' : ''} in the recent activity feed. Review workflows and monitor alerts.`
                : 'No critical errors in the recent feed. Ops systems appear nominal.'}
            </p>
          </div>
        </Panel>

        <Panel glow="amber">
          <PanelHeader
            eyebrow="Activity"
            title="Recent operational events"
            description="Live feed of monitor checks, workflow steps, errors, and system events."
          />
          {loading ? (
            <div className="grid min-h-[300px] place-items-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
            </div>
          ) : events.length === 0 ? (
            <div className="grid min-h-[200px] place-items-center text-center">
              <div>
                <p className="text-sm font-medium text-zinc-300">No activity yet</p>
                <p className="mt-1 text-xs text-zinc-500">Ops events will appear here as the system runs.</p>
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
                        event.eventType === 'error'
                          ? 'rose'
                          : event.eventType === 'monitor.check'
                            ? 'amber'
                            : 'neutral'
                      }
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge
                        tone={
                          event.eventType === 'error'
                            ? 'rose'
                            : event.eventType === 'monitor.check'
                              ? 'amber'
                              : 'neutral'
                        }
                      >
                        {event.eventType}
                      </Badge>
                      <span className="text-xs text-zinc-500">{event.actorId || 'system'}</span>
                    </div>
                    <p className="truncate text-sm text-zinc-300">{event.summary}</p>
                    <p className="mt-1 text-xs text-zinc-600">{relativeTime(event.createdAt)}</p>
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
