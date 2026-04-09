'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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

interface WorkerSession {
  id: string
  jobId: string | null
  name: string
  workerType: string
  runtime: string
  status: string
  repoUrl: string | null
  branch: string | null
  containerName: string | null
  conversationId: string | null
  entrypoint: string | null
  latestSummary: string | null
  metadataJson: string | null
  lastSeenAt: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

interface WorkerControlMetadata {
  source?: string
  baseBranch?: string
  control?: {
    requestedAction?: string
    requestedBy?: string
    requestedAt?: string
  }
}

function parseWorkerMetadata(json: string | null): WorkerControlMetadata | null {
  if (!json) return null
  try {
    return JSON.parse(json) as WorkerControlMetadata
  } catch {
    return null
  }
}

interface WorkerDetailResponse {
  worker: WorkerSession
  job: {
    id: string
    status: string
    prUrl?: string
    totalCost?: number
    totalToolCalls?: number
    totalIterations?: number
    error?: string
  } | null
  logs: Array<{
    level: string
    message: string
    created_at: string
  }>
  activity: Array<{
    id: number
    eventType: string
    summary: string
    createdAt: string
  }>
}

function workerTone(status: string): 'neutral' | 'amber' | 'cyan' | 'emerald' | 'rose' {
  if (status === 'queued') return 'amber'
  if (status === 'booting' || status === 'stopping') return 'amber'
  if (status === 'active') return 'cyan'
  if (status === 'completed') return 'emerald'
  if (status === 'failed' || status === 'stopped') return 'rose'
  return 'neutral'
}

function relativeTime(iso: string | null): string {
  if (!iso) return '--'
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

function formatCost(usd?: number): string {
  if (usd == null) return '--'
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`
}

export default function WorkersPage() {
  const [workers, setWorkers] = useState<WorkerSession[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<WorkerDetailResponse | null>(null)
  const [actionState, setActionState] = useState<{ workerId: string; action: string } | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [lastListSyncAt, setLastListSyncAt] = useState<string | null>(null)
  const [lastDetailSyncAt, setLastDetailSyncAt] = useState<string | null>(null)
  const [detailRefreshError, setDetailRefreshError] = useState<string | null>(null)

  const fetchWorkers = useCallback(async () => {
    try {
      const res = await fetch('/api/workers', { cache: 'no-store' })
      const json = await res.json()
      if (json.success) {
        setWorkers(json.data)
        setLastListSyncAt(new Date().toISOString())
      }
    } catch {
      // keep current state
    }
  }, [])

  const fetchWorkerDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/workers/${id}`, { cache: 'no-store' })
      const json = await res.json()
      if (json.success) {
        setDetail(json.data)
        setLastDetailSyncAt(new Date().toISOString())
        setDetailRefreshError(null)
      } else {
        setDetailRefreshError(json.error ?? 'Failed to refresh worker details.')
      }
    } catch {
      setDetailRefreshError('Failed to refresh worker details.')
    }
  }, [])

  useEffect(() => {
    fetchWorkers()
    const interval = setInterval(fetchWorkers, 4000)
    const onFocus = () => fetchWorkers()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [fetchWorkers])

  useEffect(() => {
    if (!expandedId) return
    fetchWorkerDetail(expandedId)
    const interval = setInterval(() => {
      fetchWorkerDetail(expandedId)
    }, 3000)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchWorkerDetail(expandedId)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [expandedId, fetchWorkerDetail])

  const metrics = useMemo(() => {
    const live = workers.filter((worker) => ['booting', 'active', 'stopping'].includes(worker.status)).length
    const docker = workers.filter((worker) => worker.runtime === 'docker').length
    const failed = workers.filter((worker) => ['failed', 'stopped'].includes(worker.status)).length
    return { live, docker, failed }
  }, [workers])

  const selectedMetadata = useMemo(() => parseWorkerMetadata(detail?.worker.metadataJson ?? null), [detail?.worker.metadataJson])

  async function handleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null)
      setDetail(null)
      return
    }

    setExpandedId(id)
    await fetchWorkerDetail(id)
  }

  async function handleAction(worker: WorkerSession, action: 'stop' | 'retry') {
    setActionState({ workerId: worker.id, action })
    setActionMessage(null)
    setDetailRefreshError(null)
    try {
      const res = await fetch(`/api/workers/${worker.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const json = await res.json()
      if (!json.success) {
        setActionMessage(json.error ?? `Failed to ${action} worker.`)
      } else {
        setActionMessage(json.data?.message ?? `Worker ${action} requested.`)
      }
      await fetchWorkers()
      if (expandedId === worker.id) {
        await fetchWorkerDetail(worker.id)
      }
    } catch {
      setActionMessage(`Failed to ${action} worker.`)
    } finally {
      setActionState(null)
    }
  }

  return (
    <PageShell
      eyebrow="Workers"
      title="Remote worker control"
      description="Track the sessions that are actually doing the work, which runtime they are using, and what they are doing right now from a mobile-friendly command surface."
      actions={
        <div className="flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-xs uppercase tracking-[0.2em] text-cyan-300">
          <StatusDot tone="cyan" />
          Control Plane
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Live workers" value={metrics.live} hint="Sessions currently booting or active." accent="cyan" />
        <MetricCard label="Docker-backed" value={metrics.docker} hint="Workers running in a sandbox instead of local mode." accent="emerald" />
        <MetricCard label="Needs attention" value={metrics.failed} hint="Failed workers you may want to inspect or retry." accent={metrics.failed > 0 ? 'rose' : 'blue'} />
      </div>

      <div className="mt-4">
        <Panel glow="cyan">
          <PanelHeader
            eyebrow="Sessions"
            title="Worker registry"
            description="This is the layer a mobile app would supervise: runtime, branch, container, freshness, and the most recent summary."
            aside={
              <div className="flex flex-col items-end gap-1 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                <span>{lastListSyncAt ? `Synced ${relativeTime(lastListSyncAt)}` : 'Waiting for sync'}</span>
                <span>{workers.length} workers tracked</span>
              </div>
            }
          />
          {actionMessage ? (
            <div className="mb-4 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
              {actionMessage}
            </div>
          ) : null}
          {detailRefreshError ? (
            <div className="mb-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
              {detailRefreshError}
            </div>
          ) : null}

          {workers.length === 0 ? (
            <EmptyState
              title="No workers yet"
              description="Create and start a job to see its worker session appear here."
            />
          ) : (
            <div className="space-y-3">
              {workers.map((worker) => (
                <div key={worker.id}>
                  <button
                    onClick={() => handleExpand(worker.id)}
                    className="w-full rounded-[1.4rem] border border-white/10 bg-zinc-950/45 p-4 text-left transition-colors hover:border-cyan-400/20 hover:bg-white/[0.05]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <Badge tone={workerTone(worker.status)}>{worker.status}</Badge>
                          <Badge tone={worker.runtime === 'docker' ? 'emerald' : worker.runtime === 'local' ? 'amber' : 'neutral'}>
                            {worker.runtime}
                          </Badge>
                          {worker.workerType ? <span className="text-xs uppercase tracking-[0.18em] text-zinc-500">{worker.workerType}</span> : null}
                        </div>
                        <h3 className="truncate text-base font-semibold text-zinc-100">{worker.name}</h3>
                        <p className="mt-2 text-sm text-zinc-400">
                          {worker.latestSummary ?? 'No summary yet.'}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-500">
                          {worker.branch ? <span>Branch {worker.branch}</span> : null}
                          {worker.containerName ? <span>{worker.containerName}</span> : null}
                          {worker.jobId ? <span>Job {worker.jobId.slice(0, 8)}</span> : null}
                        </div>
                      </div>

                      <div className="text-right text-xs text-zinc-500">
                        <div>Updated {relativeTime(worker.updatedAt)}</div>
                        <div className="mt-2">Seen {relativeTime(worker.lastSeenAt)}</div>
                        <div className="mt-2">
                          {expandedId === worker.id ? 'Watching live' : 'Polling'}
                        </div>
                      </div>
                    </div>
                  </button>

                  {expandedId === worker.id && detail?.worker.id === worker.id ? (
                    <div className="mt-2 rounded-[1.35rem] border border-white/10 bg-white/[0.04] p-4">
                      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                        <div className="space-y-4">
                          <div className="rounded-[1.1rem] border border-white/10 bg-zinc-950/45 p-4">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Operator controls</p>
                            <div className="mt-3 flex flex-wrap gap-3">
                              <button
                                type="button"
                                onClick={() => handleAction(detail.worker, 'stop')}
                                disabled={!detail.job || ['completed', 'failed', 'stopped', 'stopping'].includes(detail.worker.status) || actionState?.workerId === detail.worker.id}
                                className="rounded-full border border-amber-400/25 bg-amber-400/10 px-4 py-2 text-sm text-amber-100 transition disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {actionState?.workerId === detail.worker.id && actionState.action === 'stop' ? 'Requesting stop...' : 'Request stop'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAction(detail.worker, 'retry')}
                                disabled={!detail.job || !['failed', 'completed', 'stopped'].includes(detail.job.status) || actionState?.workerId === detail.worker.id}
                                className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100 transition disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {actionState?.workerId === detail.worker.id && actionState.action === 'retry' ? 'Launching retry...' : 'Retry worker'}
                              </button>
                            </div>
                            <p className="mt-3 text-xs text-zinc-500">
                              Stop is cooperative and will halt at the next safe pipeline checkpoint. Retry starts a fresh job-backed worker run.
                            </p>
                          </div>

                          <div className="rounded-[1.1rem] border border-white/10 bg-zinc-950/45 p-4">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Control state</p>
                            {selectedMetadata ? (
                              <div className="mt-3 space-y-2 text-sm text-zinc-300">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-zinc-500">Source</span>
                                  <span>{selectedMetadata.source ?? '--'}</span>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-zinc-500">Base branch</span>
                                  <span>{selectedMetadata.baseBranch ?? '--'}</span>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-zinc-500">Requested action</span>
                                  <span>{selectedMetadata.control?.requestedAction ?? 'none'}</span>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-zinc-500">Requested by</span>
                                  <span>{selectedMetadata.control?.requestedBy ?? '--'}</span>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-zinc-500">Requested at</span>
                                  <span>{selectedMetadata.control?.requestedAt ? relativeTime(selectedMetadata.control.requestedAt) : '--'}</span>
                                </div>
                              </div>
                            ) : (
                              <EmptyState title="No control metadata" description="This worker has not recorded control state yet." />
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-[1rem] border border-white/10 bg-zinc-950/45 p-3">
                              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Runtime</p>
                              <p className="mt-2 text-sm text-zinc-100">{detail.worker.runtime}</p>
                            </div>
                            <div className="rounded-[1rem] border border-white/10 bg-zinc-950/45 p-3">
                              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Entry point</p>
                              <p className="mt-2 text-sm text-zinc-100">{detail.worker.entrypoint ?? '--'}</p>
                            </div>
                            <div className="rounded-[1rem] border border-white/10 bg-zinc-950/45 p-3">
                              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Started</p>
                              <p className="mt-2 text-sm text-zinc-100">{relativeTime(detail.worker.startedAt)}</p>
                            </div>
                            <div className="rounded-[1rem] border border-white/10 bg-zinc-950/45 p-3">
                              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Conversation</p>
                              <p className="mt-2 text-sm text-zinc-100">{detail.worker.conversationId ? detail.worker.conversationId.slice(0, 12) : '--'}</p>
                            </div>
                          </div>

                          <div className="rounded-[1.1rem] border border-white/10 bg-zinc-950/45 p-4 text-sm text-zinc-300">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Operator note</p>
                            <p className="mt-2 leading-6">
                              {detail.worker.status === 'stopping'
                                ? 'A stop has been requested and Blade is waiting for the next safe checkpoint.'
                                : detail.worker.status === 'stopped'
                                  ? 'This worker was stopped cleanly and can be retried from the control panel.'
                                  : detail.worker.status === 'failed'
                                    ? 'This worker failed and is eligible for a retry once you’re ready.'
                                    : 'This worker is live. Keep an eye on logs and recent activity for the fastest read on progress.'}
                            </p>
                            <p className="mt-3 text-xs text-zinc-500">
                              Detail synced {lastDetailSyncAt ? relativeTime(lastDetailSyncAt) : '--'}
                            </p>
                          </div>

                          {detail.job ? (
                            <div className="rounded-[1.1rem] border border-white/10 bg-zinc-950/45 p-4">
                              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Linked job</p>
                              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-zinc-300">
                                <span>Status: {detail.job.status}</span>
                                <span>Cost: {formatCost(detail.job.totalCost)}</span>
                                <span>Tool calls: {detail.job.totalToolCalls ?? 0}</span>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-3">
                                <Link href="/jobs" className="text-sm text-cyan-300 hover:text-cyan-200">
                                  Open jobs board
                                </Link>
                                {detail.job.prUrl ? (
                                  <a href={detail.job.prUrl} target="_blank" rel="noreferrer" className="text-sm text-emerald-300 hover:text-emerald-200">
                                    Open PR
                                  </a>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                        </div>

                        <div className="space-y-4">
                          <div className="rounded-[1.1rem] border border-white/10 bg-zinc-950/55 p-4">
                            <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-zinc-500">Recent logs</p>
                            {detail.logs.length > 0 ? (
                              <div className="max-h-64 space-y-2 overflow-y-auto font-mono text-xs">
                                {detail.logs.map((log, index) => (
                                  <div key={`${log.created_at}-${index}`} className="flex gap-2 rounded-lg border border-white/5 bg-black/20 px-3 py-2">
                                    <span className="shrink-0 text-zinc-600">{new Date(log.created_at).toLocaleTimeString()}</span>
                                    <span className={log.level === 'error' ? 'text-rose-300' : log.level === 'warn' ? 'text-amber-300' : 'text-cyan-200'}>
                                      [{log.level}]
                                    </span>
                                    <span className="text-zinc-300">{log.message}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <EmptyState title="No logs yet" description="Logs will appear here as the worker executes." />
                            )}
                          </div>

                          <div className="rounded-[1.1rem] border border-white/10 bg-zinc-950/55 p-4">
                            <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-zinc-500">Recent activity</p>
                            {detail.activity.length > 0 ? (
                              <div className="space-y-2">
                                {detail.activity.map((event) => (
                                  <div key={event.id} className="rounded-lg border border-white/5 bg-black/20 px-3 py-2 text-sm text-zinc-300">
                                    <p>{event.summary}</p>
                                    <p className="mt-1 text-xs text-zinc-500">{relativeTime(event.createdAt)}</p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <EmptyState title="No activity yet" description="Conversation events will show up here once the worker starts interacting." />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </PageShell>
  )
}
