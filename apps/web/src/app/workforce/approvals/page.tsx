'use client'

import { useCallback, useEffect, useState } from 'react'
import { PageShell, Panel, PanelHeader, MetricCard } from '@/components/dashboard/cockpit-ui'

interface Approval {
  id: string
  description: string
  requestedBy: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  context?: string
}

interface ApprovalsResponse {
  success: boolean
  approvals: Approval[]
  pendingCount: number
  error?: string
}

function PriorityBadge({ priority }: { priority: Approval['priority'] }) {
  const map: Record<Approval['priority'], { bg: string; color: string; border: string }> = {
    critical: { bg: 'rgba(248,113,113,0.15)', color: '#f87171', border: 'rgba(248,113,113,0.3)' },
    high: { bg: 'rgba(251,146,60,0.15)', color: '#fb923c', border: 'rgba(251,146,60,0.3)' },
    medium: { bg: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: 'rgba(251,191,36,0.25)' },
    low: { bg: 'rgba(113,113,122,0.15)', color: '#a1a1aa', border: 'rgba(113,113,122,0.25)' },
  }
  const s = map[priority]
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
      style={{ backgroundColor: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      {priority}
    </span>
  )
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function WorkforceApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deciding, setDeciding] = useState<Record<string, 'approving' | 'rejecting'>>({})

  const fetchApprovals = useCallback(async () => {
    try {
      const res = await fetch('/api/approvals')
      const json = (await res.json()) as ApprovalsResponse
      if (json.success) {
        setApprovals(json.approvals ?? [])
        setPendingCount(json.pendingCount ?? 0)
      } else {
        setError(json.error ?? 'Failed to load approvals')
      }
    } catch {
      setError('Network error — could not reach /api/approvals')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchApprovals()
    const interval = setInterval(fetchApprovals, 15000)
    return () => clearInterval(interval)
  }, [fetchApprovals])

  async function decide(id: string, decision: 'approved' | 'rejected') {
    setDeciding((prev) => ({
      ...prev,
      [id]: decision === 'approved' ? 'approving' : 'rejecting',
    }))
    try {
      const res = await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, decision }),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (json.success) {
        setApprovals((prev) => prev.filter((a) => a.id !== id))
        setPendingCount((prev) => Math.max(0, prev - 1))
      } else {
        setError(json.error ?? 'Decision failed')
      }
    } catch {
      setError('Network error — decision could not be submitted')
    } finally {
      setDeciding((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    }
  }

  const pending = approvals.filter((a) => a.status === 'pending')
  const criticalCount = pending.filter((a) => a.priority === 'critical').length

  return (
    <PageShell
      eyebrow="Workforce"
      title="Approval Queue"
      description="Review and authorize pending agent actions before they execute. Approve or deny each request."
    >
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Pending approvals"
          value={pendingCount}
          hint="Actions waiting for your decision."
          accent={pendingCount > 0 ? 'amber' : 'emerald'}
        />
        <MetricCard
          label="Critical"
          value={criticalCount}
          hint="High-stakes actions requiring immediate review."
          accent={criticalCount > 0 ? 'rose' : 'emerald'}
        />
        <MetricCard
          label="Auto-refresh"
          value="15s"
          hint="Queue refreshes automatically every 15 seconds."
          accent="cyan"
        />
      </div>

      <div className="mt-4">
        <Panel glow={criticalCount > 0 ? 'rose' : 'cyan'}>
          <PanelHeader
            eyebrow="Queue"
            title="Pending actions"
            description="Oldest requests shown first."
            aside={
              <button
                onClick={fetchApprovals}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:text-zinc-200"
              >
                Refresh
              </button>
            }
          />

          {error && (
            <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {loading ? (
            <div className="grid min-h-[240px] place-items-center">
              <div className="h-9 w-9 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
            </div>
          ) : pending.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="grid h-16 w-16 place-items-center rounded-2xl border border-white/10 bg-emerald-500/10 text-3xl">
                ✓
              </div>
              <p className="text-sm font-medium text-zinc-300">No pending approvals</p>
              <p className="text-xs text-zinc-600">Your AI employees are operating autonomously. Nothing needs your sign-off right now.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {pending.map((approval) => {
                const isDeciding = !!deciding[approval.id]
                return (
                  <div
                    key={approval.id}
                    className="rounded-xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:bg-white/[0.05]"
                    style={{
                      borderColor:
                        approval.priority === 'critical'
                          ? 'rgba(248,113,113,0.25)'
                          : approval.priority === 'high'
                          ? 'rgba(251,146,60,0.2)'
                          : 'rgba(255,255,255,0.08)',
                    }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <PriorityBadge priority={approval.priority} />
                          <span className="text-xs text-zinc-600">{formatDate(approval.createdAt)}</span>
                        </div>
                        <p className="text-sm font-medium text-zinc-100">{approval.description}</p>
                        {approval.context && (
                          <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">{approval.context}</p>
                        )}
                        <p className="mt-2 text-xs text-zinc-600">
                          Requested by{' '}
                          <span className="font-medium text-zinc-400">{approval.requestedBy}</span>
                        </p>
                      </div>

                      <div className="flex flex-shrink-0 items-center gap-2">
                        <button
                          onClick={() => decide(approval.id, 'rejected')}
                          disabled={isDeciding}
                          className="rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-400 transition-all hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {deciding[approval.id] === 'rejecting' ? 'Denying…' : 'Deny'}
                        </button>
                        <button
                          onClick={() => decide(approval.id, 'approved')}
                          disabled={isDeciding}
                          className="rounded-lg px-4 py-2 text-xs font-semibold text-white transition-all hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
                          style={{ backgroundColor: '#a78bfa' }}
                        >
                          {deciding[approval.id] === 'approving' ? 'Approving…' : 'Approve'}
                        </button>
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
