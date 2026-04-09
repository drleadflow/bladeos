'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Badge,
  EmptyState,
  MetricCard,
  PageShell,
  Panel,
  PanelHeader,
  StatusDot,
} from '@/components/dashboard/cockpit-ui'

interface Job {
  id: string
  title: string
  status: string
  repoUrl: string
  branch: string
  prUrl?: string
  totalCost?: number
  createdAt: string
  completedAt?: string
}

interface JobDetail extends Job {
  description: string
  baseBranch: string
  containerName?: string
  prNumber?: number
  agentModel?: string
  totalToolCalls?: number
  totalIterations?: number
  error?: string
  updatedAt: string
}

interface JobLog {
  job_id: string
  level: string
  message: string
  data_json?: string
  created_at: string
}

function statusTone(status: string): 'neutral' | 'amber' | 'cyan' | 'emerald' | 'rose' {
  if (['cloning', 'branching', 'container_starting'].includes(status)) return 'amber'
  if (['coding', 'testing', 'pr_creating'].includes(status)) return 'cyan'
  if (status === 'completed') return 'emerald'
  if (['failed', 'stopped'].includes(status)) return 'rose'
  return 'neutral'
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString()
}

function formatCost(usd?: number): string {
  if (usd == null) return '--'
  return `$${usd.toFixed(4)}`
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<JobDetail | null>(null)
  const [logs, setLogs] = useState<JobLog[]>([])
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    repoUrl: '',
    baseBranch: 'main',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/jobs')
      const json = await res.json()
      if (json.success) {
        setJobs(json.data)
      }
    } catch {
      // Silently retry on next poll.
    }
  }, [])

  useEffect(() => {
    fetchJobs()
    const interval = setInterval(fetchJobs, 5000)
    return () => clearInterval(interval)
  }, [fetchJobs])

  const handleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null)
      setDetail(null)
      setLogs([])
      return
    }

    setExpandedId(id)
    try {
      const res = await fetch(`/api/jobs/${id}`)
      const json = await res.json()
      if (json.success) {
        setDetail(json.data.job)
        setLogs(json.data.logs)
      }
    } catch {
      setDetail(null)
      setLogs([])
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      const json = await res.json()

      if (!json.success) {
        setError(json.error ?? 'Failed to create job')
        return
      }

      setShowModal(false)
      setFormData({ title: '', description: '', repoUrl: '', baseBranch: 'main' })
      await fetchJobs()
    } catch {
      setError('Network error')
    } finally {
      setSubmitting(false)
    }
  }

  const metrics = useMemo(() => {
    const active = jobs.filter((job) => !['completed', 'failed', 'stopped'].includes(job.status)).length
    const completed = jobs.filter((job) => job.status === 'completed').length
    const totalCost = jobs.reduce((sum, job) => sum + (job.totalCost ?? 0), 0)
    return { active, completed, totalCost }
  }, [jobs])

  return (
    <PageShell
      eyebrow="Jobs"
      title="Execution queue"
      description="Create implementation jobs, inspect their state, review logs, and keep the coding pipeline visible from one command surface."
      actions={
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-600 px-4 py-3 text-sm font-semibold text-zinc-950 transition-transform duration-200 hover:scale-[1.01]"
        >
          New Job
        </button>
      }
    >
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Queued or running" value={metrics.active} hint="Jobs currently in flight." accent="cyan" />
        <MetricCard label="Completed" value={metrics.completed} hint="Jobs that finished successfully." accent="emerald" />
        <MetricCard label="Total job cost" value={formatCost(metrics.totalCost)} hint="Accumulated spend across visible jobs." accent="amber" />
      </div>

      <div className="mt-4">
        <Panel glow="cyan">
          <PanelHeader
            eyebrow="Pipeline"
            title="Recent jobs"
            description="A live list of work requests moving through clone, code, test, and PR creation."
          />

          {jobs.length === 0 ? (
            <EmptyState
              title="No jobs yet"
              description="Create a job to send Blade into a repo and track the full execution lifecycle."
            />
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <div key={job.id}>
                  <button
                    onClick={() => handleExpand(job.id)}
                    className="w-full rounded-[1.4rem] border border-white/10 bg-zinc-950/45 p-4 text-left transition-colors hover:border-cyan-400/20 hover:bg-white/[0.05]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <Badge tone={statusTone(job.status)}>{job.status.replace(/_/g, ' ')}</Badge>
                          <span className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                            {job.branch}
                          </span>
                        </div>
                        <h3 className="truncate text-base font-semibold text-zinc-100">
                          {job.title}
                        </h3>
                        <p className="mt-2 truncate text-sm text-zinc-500">{job.repoUrl}</p>
                      </div>
                      <div className="text-right text-xs text-zinc-500">
                        <div>{formatCost(job.totalCost)}</div>
                        <div className="mt-2">{formatTime(job.createdAt)}</div>
                        {job.completedAt ? (
                          <div className="mt-1 text-emerald-300">{formatTime(job.completedAt)}</div>
                        ) : null}
                      </div>
                    </div>
                  </button>

                  {expandedId === job.id && detail ? (
                    <div className="mt-2 rounded-[1.35rem] border border-white/10 bg-white/[0.04] p-4">
                      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                        <div className="space-y-4">
                          {detail.description ? (
                            <div className="rounded-[1.1rem] border border-white/10 bg-zinc-950/45 p-4">
                              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Description</p>
                              <p className="mt-2 text-sm leading-6 text-zinc-200">{detail.description}</p>
                            </div>
                          ) : null}

                          {detail.error ? (
                            <div className="rounded-[1.1rem] border border-rose-400/20 bg-rose-400/10 p-4">
                              <p className="text-[11px] uppercase tracking-[0.18em] text-rose-200">Error</p>
                              <p className="mt-2 font-mono text-sm text-rose-100">{detail.error}</p>
                            </div>
                          ) : null}

                          {detail.prUrl ? (
                            <div className="rounded-[1.1rem] border border-white/10 bg-zinc-950/45 p-4">
                              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Pull Request</p>
                              <a
                                href={detail.prUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-2 inline-block text-sm text-cyan-300 underline-offset-4 hover:underline"
                              >
                                {detail.prUrl}
                              </a>
                            </div>
                          ) : null}

                          <div className="grid grid-cols-3 gap-3">
                            <div className="rounded-[1rem] border border-white/10 bg-zinc-950/45 p-3">
                              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Model</p>
                              <p className="mt-2 text-sm text-zinc-100">{detail.agentModel ?? '--'}</p>
                            </div>
                            <div className="rounded-[1rem] border border-white/10 bg-zinc-950/45 p-3">
                              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Tool calls</p>
                              <p className="mt-2 text-sm text-zinc-100">{detail.totalToolCalls ?? 0}</p>
                            </div>
                            <div className="rounded-[1rem] border border-white/10 bg-zinc-950/45 p-3">
                              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Iterations</p>
                              <p className="mt-2 text-sm text-zinc-100">{detail.totalIterations ?? 0}</p>
                            </div>
                          </div>
                        </div>

                        <div>
                          <div className="rounded-[1.1rem] border border-white/10 bg-zinc-950/55 p-4">
                            <div className="mb-3 flex items-center justify-between">
                              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Execution logs</p>
                              <StatusDot tone={detail.status === 'failed' ? 'rose' : detail.status === 'completed' ? 'emerald' : 'cyan'} />
                            </div>
                            {logs.length > 0 ? (
                              <div className="max-h-80 space-y-2 overflow-y-auto font-mono text-xs">
                                {logs.map((log, i) => (
                                  <div key={i} className="flex gap-2 rounded-lg border border-white/5 bg-black/20 px-3 py-2">
                                    <span className="shrink-0 text-zinc-600">
                                      {new Date(log.created_at).toLocaleTimeString()}
                                    </span>
                                    <span
                                      className={
                                        log.level === 'error'
                                          ? 'text-rose-300'
                                          : log.level === 'warn'
                                            ? 'text-amber-300'
                                            : 'text-cyan-200'
                                      }
                                    >
                                      [{log.level}]
                                    </span>
                                    <span className="text-zinc-300">{log.message}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <EmptyState
                                title="No logs captured"
                                description="Logs will appear here as Blade moves through the pipeline."
                              />
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

      {showModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[2rem] border border-white/10 bg-zinc-950/95 p-6 shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
            <div className="mb-6">
              <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-300/80">Create Job</p>
              <h2 className="mt-2 text-2xl font-semibold text-zinc-100">Launch a new repo task</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Define the work request, target repository, and base branch. Blade will take it through the pipeline from clone to PR.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm text-zinc-400">Title</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-cyan-400/40"
                  placeholder="Add dark mode support"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm text-zinc-400">Description</label>
                <textarea
                  required
                  rows={4}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-cyan-400/40"
                  placeholder="Describe what the agent should implement..."
                />
              </div>
              <div className="grid gap-4 md:grid-cols-[1fr_180px]">
                <div>
                  <label className="mb-2 block text-sm text-zinc-400">Repository URL</label>
                  <input
                    type="url"
                    required
                    value={formData.repoUrl}
                    onChange={(e) => setFormData({ ...formData, repoUrl: e.target.value })}
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-cyan-400/40"
                    placeholder="https://github.com/owner/repo"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm text-zinc-400">Base Branch</label>
                  <input
                    type="text"
                    value={formData.baseBranch}
                    onChange={(e) => setFormData({ ...formData, baseBranch: e.target.value })}
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-cyan-400/40"
                    placeholder="main"
                  />
                </div>
              </div>

              {error ? <p className="text-sm text-rose-300">{error}</p> : null}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-zinc-300 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-zinc-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-2xl bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-600 px-4 py-3 text-sm font-semibold text-zinc-950 transition-transform duration-200 hover:scale-[1.01] disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Job'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </PageShell>
  )
}
