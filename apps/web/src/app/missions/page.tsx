'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  EmptyState,
  PageShell,
  PanelHeader,
  MetricCard,
} from '@/components/dashboard/cockpit-ui'

interface Mission {
  id: string
  title: string
  description: string | null
  priority: string
  status: string
  assignedEmployee: string | null
  createdBy: string
  result: string | null
  resultSummary: string | null
  costUsd: number
  startedAt: string | null
  completedAt: string | null
  createdAt: string
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'border-rose-400/30 bg-rose-400/15 text-rose-300',
  high: 'border-amber-400/30 bg-amber-400/15 text-amber-300',
  medium: 'border-blue-400/30 bg-blue-400/15 text-blue-300',
  low: 'border-zinc-400/30 bg-zinc-400/15 text-zinc-400',
}

const STATUS_COLUMNS = ['queued', 'live', 'done', 'failed'] as const
const STATUS_LABELS: Record<string, string> = {
  queued: 'Queued',
  live: 'Live',
  done: 'Done',
  failed: 'Failed',
}
const STATUS_ACCENT: Record<string, string> = {
  queued: 'border-zinc-500/20',
  live: 'border-cyan-400/30',
  done: 'border-emerald-400/20',
  failed: 'border-rose-400/20',
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function MissionsPage() {
  const [missions, setMissions] = useState<Mission[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newPriority, setNewPriority] = useState('medium')
  const [creating, setCreating] = useState(false)
  const [assigning, setAssigning] = useState<string | null>(null)

  const fetchMissions = useCallback(async () => {
    try {
      const res = await fetch('/api/missions')
      const json = await res.json()
      if (json.success) setMissions(json.data ?? [])
    } catch { /* retry */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchMissions()
    const interval = setInterval(fetchMissions, 5000)
    return () => clearInterval(interval)
  }, [fetchMissions])

  async function handleCreate() {
    if (!newTitle.trim()) return
    setCreating(true)
    try {
      await fetch('/api/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim(), description: newDesc.trim() || undefined, priority: newPriority }),
      })
      setNewTitle('')
      setNewDesc('')
      setShowCreate(false)
      await fetchMissions()
    } catch { /* silent */ }
    finally { setCreating(false) }
  }

  async function handleAutoAssign(id: string) {
    setAssigning(id)
    try {
      await fetch('/api/missions/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      await fetchMissions()
    } catch { /* silent */ }
    finally { setAssigning(null) }
  }

  async function handleStatusChange(id: string, status: string) {
    await fetch('/api/missions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    await fetchMissions()
  }

  async function handleDelete(id: string) {
    await fetch('/api/missions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await fetchMissions()
  }

  const byStatus = (status: string) => missions.filter(m => m.status === status)

  const counts = {
    queued: byStatus('queued').length,
    live: byStatus('live').length,
    done: byStatus('done').length,
    failed: byStatus('failed').length,
  }

  return (
    <PageShell
      eyebrow="Mission Control"
      title="Task command center"
      description="Create tasks, auto-assign to the best agent, track progress across your workforce."
      actions={
        <button
          onClick={() => setShowCreate(v => !v)}
          className="rounded-2xl px-4 py-2.5 text-sm font-semibold text-zinc-950 transition-transform hover:scale-[1.01]"
          style={{ background: 'linear-gradient(to right, #22d3ee, #06b6d4)' }}
        >
          + New Mission
        </button>
      }
    >
      {/* ── Stats ──────────────────────────────────────────── */}
      <div className="grid gap-3 grid-cols-4">
        <MetricCard label="Queued" value={counts.queued} accent="cyan" />
        <MetricCard label="Live" value={counts.live} accent="blue" />
        <MetricCard label="Done" value={counts.done} accent="emerald" />
        <MetricCard label="Failed" value={counts.failed} accent="rose" />
      </div>

      {/* ── Create Form ────────────────────────────────────── */}
      {showCreate && (
        <div className="mt-4 rounded-[1.75rem] border border-white/10 bg-white/[0.045] p-5 backdrop-blur-xl">
          <PanelHeader eyebrow="New" title="Create a mission" />
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="Mission title"
              className="col-span-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-cyan-400/40"
            />
            <textarea
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="col-span-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-cyan-400/40"
            />
            <select
              value={newPriority}
              onChange={e => setNewPriority(e.target.value)}
              className="rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-cyan-400/40"
            >
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div className="mt-3 flex gap-3">
            <button
              onClick={handleCreate}
              disabled={creating || !newTitle.trim()}
              className="rounded-2xl px-5 py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-50"
              style={{ background: 'linear-gradient(to right, #22d3ee, #06b6d4)' }}
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="rounded-2xl border border-white/10 bg-white/[0.05] px-5 py-2.5 text-sm font-semibold text-zinc-300 hover:bg-white/[0.08]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Kanban Columns ─────────────────────────────────── */}
      {loading ? (
        <div className="mt-6 grid min-h-[300px] place-items-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
        </div>
      ) : missions.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="No missions yet" description="Create your first mission to get started." />
        </div>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-4">
          {STATUS_COLUMNS.map(status => (
            <div key={status}>
              <div className="mb-3 flex items-center gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{STATUS_LABELS[status]}</h3>
                <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] font-semibold text-zinc-400">
                  {byStatus(status).length}
                </span>
              </div>
              <div className="space-y-2">
                {byStatus(status).map(mission => (
                  <div
                    key={mission.id}
                    className={`rounded-xl border ${STATUS_ACCENT[status]} bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.05]`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-zinc-200 line-clamp-2">{mission.title}</p>
                      <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${PRIORITY_COLORS[mission.priority]}`}>
                        {mission.priority}
                      </span>
                    </div>

                    {mission.description && (
                      <p className="mt-1.5 text-xs text-zinc-500 line-clamp-2">{mission.description}</p>
                    )}

                    {mission.assignedEmployee && (
                      <div className="mt-2">
                        <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-300">
                          {mission.assignedEmployee}
                        </span>
                      </div>
                    )}

                    {mission.resultSummary && (
                      <p className="mt-2 text-xs text-emerald-400 line-clamp-2">{mission.resultSummary}</p>
                    )}

                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[10px] text-zinc-600">{timeAgo(mission.createdAt)}</span>
                      <div className="flex gap-1">
                        {status === 'queued' && !mission.assignedEmployee && (
                          <button
                            onClick={() => handleAutoAssign(mission.id)}
                            disabled={assigning === mission.id}
                            className="rounded-lg px-2 py-1 text-[10px] font-semibold text-cyan-300 border border-cyan-400/20 bg-cyan-400/10 hover:bg-cyan-400/20 disabled:opacity-50 transition-colors"
                          >
                            {assigning === mission.id ? '...' : 'Auto-assign'}
                          </button>
                        )}
                        {status === 'queued' && mission.assignedEmployee && (
                          <button
                            onClick={() => handleStatusChange(mission.id, 'live')}
                            className="rounded-lg px-2 py-1 text-[10px] font-semibold text-emerald-300 border border-emerald-400/20 bg-emerald-400/10 hover:bg-emerald-400/20 transition-colors"
                          >
                            Start
                          </button>
                        )}
                        {(status === 'queued' || status === 'failed') && (
                          <button
                            onClick={() => handleDelete(mission.id)}
                            className="rounded-lg px-2 py-1 text-[10px] font-semibold text-rose-400 border border-rose-400/20 bg-rose-400/10 hover:bg-rose-400/20 transition-colors"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {byStatus(status).length === 0 && (
                  <div className="rounded-xl border border-dashed border-white/[0.06] p-4 text-center text-xs text-zinc-600">
                    Empty
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  )
}
