'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  EmptyState,
  MetricCard,
  PageShell,
} from '@/components/dashboard/cockpit-ui'

interface Agent {
  slug: string
  name: string
  title: string
  department: string | null
  icon: string
  objective: string | null
  status: string | null
  modelPreference: string | null
  totalRuns: number | null
  totalCostUsd: number | null
  successRate: number | null
  active: boolean
  archetype: string | null
  activeMissions: number
  recentTurns: number
  createdAt: string
}

const MODEL_LABELS: Record<string, string> = {
  standard: 'Sonnet',
  fast: 'Haiku',
  premium: 'Opus',
  sonnet: 'Sonnet',
  haiku: 'Haiku',
  opus: 'Opus',
}

function getModelLabel(pref: string | null): string {
  if (!pref) return 'Sonnet'
  return MODEL_LABELS[pref.toLowerCase()] ?? pref
}

function getStatusColor(status: string | null): string {
  if (status === 'active') return 'bg-emerald-400'
  if (status === 'idle') return 'bg-amber-400'
  if (status === 'suspended') return 'bg-rose-400'
  return 'bg-zinc-500'
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/agents')
      const json = await res.json()
      if (json.success !== false && json.agents) {
        setAgents(json.agents)
      }
    } catch { /* retry on next poll */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchAgents()
    const interval = setInterval(fetchAgents, 10000)
    return () => clearInterval(interval)
  }, [fetchAgents])

  const activeCount = agents.filter(a => a.status === 'active').length
  const totalMissions = agents.reduce((sum, a) => sum + (a.activeMissions ?? 0), 0)

  return (
    <PageShell
      eyebrow="Agents"
      title="AI workforce roster"
      description="Your specialist operators — live status, model, workload, and mission queue."
    >
      {/* ── Summary Cards ─────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Total agents" value={agents.length} accent="cyan" />
        <MetricCard label="Live now" value={`${activeCount}/${agents.length}`} accent="emerald" />
        <MetricCard label="Active missions" value={totalMissions} accent="amber" />
        <MetricCard
          label="Avg health"
          value={`${agents.length > 0 ? Math.round(agents.reduce((s, a) => s + (a.successRate ?? 0), 0) / agents.length) : 0}%`}
          accent="blue"
        />
      </div>

      {/* ── Agent Grid ────────────────────────────────────── */}
      <div className="mt-6">
        {loading ? (
          <div className="grid min-h-[300px] place-items-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
          </div>
        ) : agents.length === 0 ? (
          <EmptyState title="No agents yet" description="Onboard employees to see them here." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {agents.map(agent => (
              <button
                key={agent.slug}
                onClick={() => router.push(`/agents/${agent.slug}`)}
                className="group relative rounded-[1.6rem] border border-white/10 bg-zinc-950/50 p-5 text-left transition-all hover:border-cyan-400/25 hover:bg-white/[0.04]"
              >
                {/* ── Header: Icon + Name + Status ── */}
                <div className="flex items-start gap-3">
                  <div className="grid h-14 w-14 shrink-0 place-items-center rounded-[1.2rem] border border-white/10 bg-white/[0.05] text-2xl">
                    {agent.icon || '🤖'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-base font-semibold text-zinc-100 truncate">{agent.name}</p>
                      {/* Animated live dot */}
                      <span className="relative flex h-2.5 w-2.5 shrink-0">
                        {agent.status === 'active' && (
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
                        )}
                        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${getStatusColor(agent.status)}`} />
                      </span>
                    </div>
                    <p className="text-sm text-zinc-500 truncate">{agent.title}</p>
                  </div>
                </div>

                {/* ── Model + Status Labels ── */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-300">
                    {getModelLabel(agent.modelPreference)}
                  </span>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                    agent.status === 'active'
                      ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
                      : agent.status === 'idle'
                        ? 'border-amber-400/20 bg-amber-400/10 text-amber-300'
                        : 'border-zinc-500/20 bg-zinc-500/10 text-zinc-400'
                  }`}>
                    {agent.status ?? 'offline'}
                  </span>
                  {agent.activeMissions > 0 && (
                    <span className="inline-flex items-center rounded-full border border-pink-400/20 bg-pink-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-pink-300">
                      {agent.activeMissions} mission{agent.activeMissions > 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {/* ── Metrics Row ── */}
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-600">Turns</p>
                    <p className="text-base font-semibold text-zinc-200">{agent.recentTurns}</p>
                  </div>
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-600">Runs</p>
                    <p className="text-base font-semibold text-zinc-200">{agent.totalRuns ?? 0}</p>
                  </div>
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-600">Cost</p>
                    <p className="text-base font-semibold text-zinc-200">
                      ${(agent.totalCostUsd ?? 0).toFixed(2)}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  )
}
