'use client'

import { Badge, EmptyState, Panel, PanelHeader, StatusDot } from '@/components/dashboard/cockpit-ui'
import type { TraceEvent } from '@/lib/store'

interface ActivityTraceProps {
  events: TraceEvent[]
  isStreaming: boolean
  totalCost: number
}

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function formatUsd(usd: number): string {
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`
}

function toneToDot(tone: TraceEvent['tone']): 'neutral' | 'cyan' | 'emerald' | 'amber' | 'rose' {
  if (tone === 'blue') return 'cyan'
  return tone
}

function toneToBadge(tone: TraceEvent['tone']): 'neutral' | 'blue' | 'cyan' | 'emerald' | 'amber' | 'rose' {
  return tone
}

export function ActivityTrace({ events, isStreaming, totalCost }: ActivityTraceProps) {
  const latest = events[0]
  const toolEvents = events.filter((event) => event.type === 'tool_call')
  const latestIteration = events.find((event) => typeof event.iteration === 'number')?.iteration

  return (
    <Panel glow={isStreaming ? 'cyan' : 'none'} className="h-full">
      <PanelHeader
        eyebrow="Live Trace"
        title="What Blade is doing"
        description="A real-time operational trail of stages, tool use, completions, and failures."
        aside={
          <div className="flex items-center gap-2">
            <Badge tone={isStreaming ? 'cyan' : latest?.type === 'error' ? 'rose' : 'emerald'}>
              {isStreaming ? 'Live' : latest?.type === 'error' ? 'Needs review' : 'Ready'}
            </Badge>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
        <div className="rounded-[1.25rem] border border-white/10 bg-zinc-950/50 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Latest stage</p>
          <p className="mt-2 text-sm font-medium text-zinc-100">
            {latest?.title ?? 'Waiting for work'}
          </p>
        </div>
        <div className="rounded-[1.25rem] border border-white/10 bg-zinc-950/50 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Tool calls</p>
          <p className="mt-2 text-sm font-medium text-zinc-100">{toolEvents.length}</p>
        </div>
        <div className="rounded-[1.25rem] border border-white/10 bg-zinc-950/50 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Session cost</p>
          <p className="mt-2 text-sm font-medium text-zinc-100">{formatUsd(totalCost)}</p>
          {latestIteration ? (
            <p className="mt-1 text-xs text-zinc-500">Latest iteration: {latestIteration}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-4">
        {events.length === 0 ? (
          <EmptyState
            title="No trace yet"
            description="Once Blade starts working, this rail will show each meaningful step instead of leaving you blind."
          />
        ) : (
          <div className="space-y-3 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
            {events.map((event) => (
              <div
                key={event.id}
                className="rounded-[1.25rem] border border-white/10 bg-zinc-950/45 px-4 py-4 transition-colors hover:border-white/20"
              >
                <div className="flex items-start gap-3">
                  <div className="pt-1">
                    <StatusDot tone={toneToDot(event.tone)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge tone={toneToBadge(event.tone)}>
                        {event.type.replace(/_/g, ' ')}
                      </Badge>
                      <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                        {relativeTime(event.timestamp)}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-zinc-100">{event.title}</p>
                    {event.detail ? (
                      <p className="mt-2 text-sm leading-6 text-zinc-400">{event.detail}</p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                      {typeof event.iteration === 'number' ? (
                        <span className="rounded-full border border-white/10 px-2 py-1">
                          Iteration {event.iteration}
                        </span>
                      ) : null}
                      {typeof event.durationMs === 'number' ? (
                        <span className="rounded-full border border-white/10 px-2 py-1">
                          {event.durationMs}ms
                        </span>
                      ) : null}
                      {typeof event.costSoFar === 'number' ? (
                        <span className="rounded-full border border-white/10 px-2 py-1 text-amber-300">
                          {formatUsd(event.costSoFar)}
                        </span>
                      ) : null}
                      {event.stopReason ? (
                        <span className="rounded-full border border-white/10 px-2 py-1">
                          {event.stopReason}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  )
}
