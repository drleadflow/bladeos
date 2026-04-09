'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Badge,
  EmptyState,
  MetricCard,
  PageShell,
  Panel,
  PanelHeader,
  StatusDot,
} from '@/components/dashboard/cockpit-ui'

type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

interface CodingJob {
  id: string
  status: JobStatus
  repo: string | null
  branch: string | null
  prompt: string | null
  prUrl: string | null
  totalCost: number | null
  totalToolCalls: number | null
  error: string | null
  createdAt: string
  updatedAt: string
}

function statusTone(status: JobStatus): 'amber' | 'cyan' | 'emerald' | 'rose' | 'neutral' {
  if (status === 'queued') return 'amber'
  if (status === 'running') return 'cyan'
  if (status === 'completed') return 'emerald'
  if (status === 'failed') return 'rose'
  return 'neutral'
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

function formatCost(usd: number | null): string {
  if (usd == null) return '--'
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`
}

// TODO: Replace with real /api/jobs endpoint when available
const MOCK_JOBS: CodingJob[] = [
  {
    id: 'job-a1b2',
    status: 'running',
    repo: 'https://github.com/blade/agent',
    branch: 'feat/health-check',
    prompt: 'Add a /healthz endpoint that returns system status and uptime.',
    prUrl: null,
    totalCost: 0.0142,
    totalToolCalls: 7,
    error: null,
    createdAt: new Date(Date.now() - 900000).toISOString(),
    updatedAt: new Date(Date.now() - 60000).toISOString(),
  },
  {
    id: 'job-c3d4',
    status: 'completed',
    repo: 'https://github.com/blade/agent',
    branch: 'fix/auth-token',
    prompt: 'Fix the JWT expiry bug causing silent 401s on token refresh.',
    prUrl: 'https://github.com/blade/agent/pull/42',
    totalCost: 0.0387,
    totalToolCalls: 23,
    error: null,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 82000000).toISOString(),
  },
  {
    id: 'job-e5f6',
    status: 'failed',
    repo: 'https://github.com/blade/web',
    branch: 'feat/dashboard-v2',
    prompt: 'Rebuild the dashboard with the new cockpit-ui component system.',
    prUrl: null,
    totalCost: 0.0091,
    totalToolCalls: 4,
    error: 'Build failed: Cannot resolve module @/components/cockpit-ui',
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    updatedAt: new Date(Date.now() - 170000000).toISOString(),
  },
  {
    id: 'job-g7h8',
    status: 'queued',
    repo: 'https://github.com/blade/core',
    branch: null,
    prompt: 'Write unit tests for the tool-registry module targeting 80% coverage.',
    prUrl: null,
    totalCost: null,
    totalToolCalls: null,
    error: null,
    createdAt: new Date(Date.now() - 300000).toISOString(),
    updatedAt: new Date(Date.now() - 300000).toISOString(),
  },
]

export default function EngineeringJobsPage() {
  const [jobs, setJobs] = useState<CodingJob[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/jobs', { cache: 'no-store' })
      const json = await res.json()
      if (json.success && Array.isArray(json.data)) {
        setJobs(json.data)
      } else {
        setJobs(MOCK_JOBS)
      }
    } catch {
      setJobs(MOCK_JOBS)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchJobs()
    const interval = setInterval(fetchJobs, 8000)
    return () => clearInterval(interval)
  }, [fetchJobs])

  const runningCount = jobs.filter((j) => j.status === 'running').length
  const completedCount = jobs.filter((j) => j.status === 'completed').length
  const failedCount = jobs.filter((j) => j.status === 'failed').length

  return (
    <PageShell
      eyebrow="Engineering / Jobs"
      title="Coding jobs"
      description="Every autonomous coding task Blade has been asked to complete — queued, running, done, or failed."
      actions={
        <div className="flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-2 text-xs uppercase tracking-[0.2em] text-blue-300">
          <StatusDot tone="cyan" />
          {runningCount > 0 ? `${runningCount} running` : 'Idle'}
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Running" value={runningCount} hint="Jobs actively being worked on right now." accent="cyan" />
        <MetricCard label="Completed" value={completedCount} hint="Jobs that finished successfully." accent="emerald" />
        <MetricCard label="Failed" value={failedCount} hint="Jobs that errored and need attention." accent={failedCount > 0 ? 'rose' : 'blue'} />
      </div>

      <div className="mt-4">
        <Panel glow="cyan">
          <PanelHeader
            eyebrow="Queue"
            title="All coding jobs"
            description="Click a job to expand its details, error message, and linked PR."
          />

          {loading ? (
            <div className="grid min-h-[300px] place-items-center">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
            </div>
          ) : jobs.length === 0 ? (
            <EmptyState
              title="No jobs yet"
              description="Use blade code to queue a new coding job."
            />
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <div key={job.id}>
                  <button
                    onClick={() => setExpandedId(expandedId === job.id ? null : job.id)}
                    className="w-full rounded-[1.4rem] border border-white/10 bg-zinc-950/45 p-4 text-left transition-colors hover:border-blue-400/20 hover:bg-white/[0.05]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <Badge tone={statusTone(job.status)}>{job.status}</Badge>
                          <span className="font-mono text-xs text-zinc-600">{job.id}</span>
                        </div>
                        <p className="truncate text-sm text-zinc-200">
                          {job.prompt ?? 'No prompt recorded.'}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-500">
                          {job.repo && <span>{job.repo.replace('https://github.com/', '')}</span>}
                          {job.branch && <span>{job.branch}</span>}
                          {job.totalCost != null && <span className="text-amber-400">{formatCost(job.totalCost)}</span>}
                          {job.totalToolCalls != null && <span>{job.totalToolCalls} tool calls</span>}
                        </div>
                      </div>
                      <div className="text-right text-xs text-zinc-500">
                        <div>Created {relativeTime(job.createdAt)}</div>
                        <div className="mt-1">Updated {relativeTime(job.updatedAt)}</div>
                      </div>
                    </div>
                  </button>

                  {expandedId === job.id && (
                    <div className="mt-2 rounded-[1.3rem] border border-white/10 bg-white/[0.03] p-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-3">
                          <div className="rounded-xl border border-white/10 bg-zinc-950/45 px-4 py-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Full prompt</p>
                            <p className="mt-2 text-sm leading-6 text-zinc-300">{job.prompt ?? 'No prompt recorded.'}</p>
                          </div>
                          {job.error && (
                            <div className="rounded-xl border border-rose-400/20 bg-rose-400/5 px-4 py-3">
                              <p className="text-xs uppercase tracking-[0.18em] text-rose-400">Error</p>
                              <p className="mt-2 font-mono text-xs text-rose-200">{job.error}</p>
                            </div>
                          )}
                        </div>
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            {[
                              ['Status', job.status],
                              ['Cost', formatCost(job.totalCost)],
                              ['Tool calls', String(job.totalToolCalls ?? '--')],
                              ['Branch', job.branch ?? '--'],
                            ].map(([label, value]) => (
                              <div key={label} className="rounded-xl border border-white/10 bg-zinc-950/45 px-3 py-3">
                                <p className="uppercase tracking-[0.15em] text-zinc-600">{label}</p>
                                <p className="mt-1 font-mono text-zinc-200">{value}</p>
                              </div>
                            ))}
                          </div>
                          {job.prUrl && (
                            <a
                              href={job.prUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="block rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-sm text-emerald-300 transition-colors hover:bg-emerald-400/10"
                            >
                              Open Pull Request
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </PageShell>
  )
}
