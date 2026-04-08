'use client'

import { useCallback, useEffect, useState } from 'react'

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

const STATUS_COLORS: Record<string, string> = {
  queued: 'bg-zinc-600 text-zinc-200',
  cloning: 'bg-yellow-600 text-yellow-100',
  branching: 'bg-yellow-600 text-yellow-100',
  container_starting: 'bg-yellow-600 text-yellow-100',
  coding: 'bg-blue-600 text-blue-100',
  testing: 'bg-purple-600 text-purple-100',
  pr_creating: 'bg-cyan-600 text-cyan-100',
  completed: 'bg-green-600 text-green-100',
  failed: 'bg-red-600 text-red-100',
}

function StatusBadge({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] ?? 'bg-zinc-600 text-zinc-200'
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${colors}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
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
      // silently retry on next poll
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

  return (
    <div className="min-h-screen bg-zinc-950 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-zinc-100">Jobs</h1>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            New Job
          </button>
        </div>

        {jobs.length === 0 ? (
          <div className="text-center py-16 text-zinc-500">
            <p className="text-lg mb-2">No jobs yet</p>
            <p className="text-sm">Create a new job to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => (
              <div key={job.id}>
                <button
                  onClick={() => handleExpand(job.id)}
                  className="w-full text-left bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold text-zinc-100 truncate">
                          {job.title}
                        </h3>
                        <StatusBadge status={job.status} />
                      </div>
                      <div className="flex items-center gap-4 text-xs text-zinc-500">
                        <span className="truncate max-w-[200px]">{job.repoUrl}</span>
                        <span>{job.branch}</span>
                      </div>
                    </div>
                    <div className="text-right text-xs text-zinc-500 whitespace-nowrap">
                      <div>{formatCost(job.totalCost)}</div>
                      <div className="mt-1">{formatTime(job.createdAt)}</div>
                      {job.completedAt && (
                        <div className="text-green-500">{formatTime(job.completedAt)}</div>
                      )}
                    </div>
                  </div>
                </button>

                {expandedId === job.id && detail && (
                  <div className="mt-1 bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 space-y-4">
                    {detail.description && (
                      <div>
                        <h4 className="text-xs font-semibold text-zinc-400 uppercase mb-1">Description</h4>
                        <p className="text-sm text-zinc-300">{detail.description}</p>
                      </div>
                    )}

                    {detail.error && (
                      <div className="bg-red-950/30 border border-red-900 rounded p-3">
                        <h4 className="text-xs font-semibold text-red-400 uppercase mb-1">Error</h4>
                        <p className="text-sm text-red-300 font-mono">{detail.error}</p>
                      </div>
                    )}

                    {detail.prUrl && (
                      <div>
                        <h4 className="text-xs font-semibold text-zinc-400 uppercase mb-1">Pull Request</h4>
                        <a
                          href={detail.prUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-400 hover:text-blue-300 underline"
                        >
                          {detail.prUrl}
                        </a>
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-zinc-500">Model:</span>{' '}
                        <span className="text-zinc-300">{detail.agentModel ?? '--'}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Tool calls:</span>{' '}
                        <span className="text-zinc-300">{detail.totalToolCalls ?? 0}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Iterations:</span>{' '}
                        <span className="text-zinc-300">{detail.totalIterations ?? 0}</span>
                      </div>
                    </div>

                    {logs.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-zinc-400 uppercase mb-2">Logs</h4>
                        <div className="bg-zinc-950 border border-zinc-800 rounded p-3 max-h-64 overflow-y-auto font-mono text-xs space-y-1">
                          {logs.map((log, i) => (
                            <div key={i} className="flex gap-2">
                              <span className="text-zinc-600 shrink-0">
                                {new Date(log.created_at).toLocaleTimeString()}
                              </span>
                              <span
                                className={
                                  log.level === 'error'
                                    ? 'text-red-400'
                                    : log.level === 'warn'
                                      ? 'text-yellow-400'
                                      : 'text-zinc-400'
                                }
                              >
                                [{log.level}]
                              </span>
                              <span className="text-zinc-300">{log.message}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-lg p-6">
            <h2 className="text-lg font-bold text-zinc-100 mb-4">New Job</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-blue-500"
                  placeholder="Add dark mode support"
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Description</label>
                <textarea
                  required
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-blue-500 resize-none"
                  placeholder="Describe what the agent should implement..."
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Repository URL</label>
                <input
                  type="url"
                  required
                  value={formData.repoUrl}
                  onChange={(e) => setFormData({ ...formData, repoUrl: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-blue-500"
                  placeholder="https://github.com/owner/repo"
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Base Branch</label>
                <input
                  type="text"
                  value={formData.baseBranch}
                  onChange={(e) => setFormData({ ...formData, baseBranch: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-blue-500"
                  placeholder="main"
                />
              </div>

              {error && (
                <p className="text-sm text-red-400">{error}</p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {submitting ? 'Creating...' : 'Create Job'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
