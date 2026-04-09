'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge, EmptyState, StatusDot } from '@/components/dashboard/cockpit-ui'

interface Approval {
  id: string
  requestedBy: string
  action: string
  toolName: string | null
  context: string | null
  priority: string
  status: string
  expiresAt: string | null
  createdAt: string
}

function priorityTone(priority: string): 'rose' | 'amber' | 'blue' | 'neutral' {
  if (priority === 'urgent' || priority === 'high') return 'rose'
  if (priority === 'medium') return 'amber'
  if (priority === 'low') return 'blue'
  return 'neutral'
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString()
}

export default function ApprovalsInbox() {
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [deciding, setDeciding] = useState<string | null>(null)

  const fetchApprovals = useCallback(async () => {
    try {
      const res = await fetch('/api/approvals')
      const json = await res.json()
      if (json.success) {
        setApprovals(json.approvals)
        setPendingCount(json.pendingCount)
      }
    } catch {
      // Silently retry on next poll.
    }
  }, [])

  useEffect(() => {
    fetchApprovals()
    const interval = setInterval(fetchApprovals, 10000)
    return () => clearInterval(interval)
  }, [fetchApprovals])

  const handleDecision = async (id: string, decision: 'approved' | 'rejected') => {
    setDeciding(id)
    try {
      const res = await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, decision }),
      })
      const json = await res.json()
      if (json.success) {
        await fetchApprovals()
      }
    } catch {
      // Retry on next poll.
    } finally {
      setDeciding(null)
    }
  }

  if (approvals.length === 0) {
    return (
      <EmptyState
        title="No pending approvals"
        description="Blade does not need any human sign-off right now."
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1.5 text-xs uppercase tracking-[0.2em] text-amber-200">
          <StatusDot tone="amber" />
          {pendingCount} waiting
        </div>
      </div>

      <div className="space-y-3">
        {approvals.map((approval) => (
          <div
            key={approval.id}
            className="rounded-[1.4rem] border border-white/10 bg-zinc-950/45 p-4"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge tone={priorityTone(approval.priority)}>{approval.priority}</Badge>
                  {approval.toolName ? <Badge tone="blue">{approval.toolName}</Badge> : null}
                  <span className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                    {formatTime(approval.createdAt)}
                  </span>
                </div>

                <p className="text-sm text-zinc-400">
                  Requested by <span className="font-medium text-zinc-200">{approval.requestedBy}</span>
                </p>
                <p className="mt-2 text-base font-medium leading-7 text-zinc-100">
                  {approval.action}
                </p>

                {approval.context ? (
                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-zinc-500">
                    {approval.context}
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => handleDecision(approval.id, 'approved')}
                  disabled={deciding === approval.id}
                  className="rounded-2xl bg-gradient-to-r from-emerald-300 via-emerald-400 to-teal-500 px-4 py-3 text-sm font-semibold text-zinc-950 transition-transform duration-200 hover:scale-[1.01] disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleDecision(approval.id, 'rejected')}
                  disabled={deciding === approval.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-zinc-200 transition-colors hover:border-rose-400/20 hover:bg-rose-400/10 hover:text-rose-100 disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
