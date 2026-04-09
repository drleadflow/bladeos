'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Badge,
  EmptyState,
  MetricCard,
  PageShell,
  Panel,
  PanelHeader,
  StatusDot,
} from '@/components/dashboard/cockpit-ui'

interface Agent {
  slug: string
  name: string
  title: string
  department: string | null
  icon: string
  objective: string | null
  status: string | null
  totalRuns: number | null
  totalCostUsd: number | null
  successRate: number | null
  active: boolean
  archetype: string | null
  managerId: string | null
  createdAt: string
}

function formatCost(usd: number | null): string {
  if (usd == null) return '--'
  return `$${usd.toFixed(2)}`
}

function getHealthLabel(rate: number | null): string {
  if (rate == null) return '--'
  return `${rate.toFixed(0)}%`
}

function getStatusTone(status: string | null): 'emerald' | 'amber' | 'rose' | 'neutral' {
  if (!status) return 'neutral'
  if (status === 'active') return 'emerald'
  if (status === 'idle') return 'amber'
  if (status === 'suspended') return 'rose'
  return 'neutral'
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
    } catch {
      // Silently retry on next poll.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAgents()
    const interval = setInterval(fetchAgents, 10000)
    return () => clearInterval(interval)
  }, [fetchAgents])

  const activeCount = agents.filter((agent) => agent.status === 'active').length
  const avgHealth =
    agents.length > 0
      ? Math.round(
          agents.reduce((sum, agent) => sum + (agent.successRate ?? 0), 0) /
            agents.length
        )
      : 0

  return (
    <PageShell
      eyebrow="Agents"
      title="AI workforce roster"
      description="Monitor your specialist operators, inspect their workload, and understand who owns what across the business."
    >
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Total agents" value={agents.length} hint="Available operators in your workforce." accent="cyan" />
        <MetricCard label="Active now" value={activeCount} hint="Currently engaged in live work." accent="emerald" />
        <MetricCard label="Average health" value={`${avgHealth}%`} hint="Aggregate success posture across the roster." accent={avgHealth >= 80 ? 'emerald' : avgHealth >= 50 ? 'amber' : 'rose'} />
      </div>

      <div className="mt-4">
        <Panel glow="cyan">
          <PanelHeader
            eyebrow="Roster"
            title="Current team"
            description="Every employee agent with role, department, health, and operational footprint."
          />

          {loading ? (
            <div className="grid min-h-[420px] place-items-center">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
            </div>
          ) : agents.length === 0 ? (
            <EmptyState
              title="No agents yet"
              description="Once employees are onboarded, they’ll appear here with live health and workload signals."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {agents.map((agent) => (
                <button
                  key={agent.slug}
                  onClick={() => router.push(`/agents/${agent.slug}`)}
                  className="group rounded-[1.6rem] border border-white/10 bg-zinc-950/45 p-5 text-left transition-all hover:border-cyan-400/20 hover:bg-white/[0.05]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="grid h-14 w-14 place-items-center rounded-[1.2rem] border border-white/10 bg-white/[0.05] text-2xl">
                        {agent.icon || '🤖'}
                      </div>
                      <div>
                        <p className="text-base font-semibold text-zinc-100">{agent.name}</p>
                        <p className="text-sm text-zinc-500">{agent.title}</p>
                      </div>
                    </div>
                    <StatusDot tone={getStatusTone(agent.status)} />
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Badge tone="blue">{agent.department ?? 'unassigned'}</Badge>
                    <Badge tone={getStatusTone(agent.status)}>
                      {agent.status ?? 'unknown'}
                    </Badge>
                  </div>

                  <p className="mt-4 line-clamp-3 text-sm leading-6 text-zinc-300">
                    {agent.objective ?? 'No objective configured yet.'}
                  </p>

                  <div className="mt-5 grid grid-cols-3 gap-3">
                    <div className="rounded-[1rem] border border-white/10 bg-white/[0.03] p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Health</p>
                      <p className="mt-2 text-lg font-semibold text-zinc-100">{getHealthLabel(agent.successRate)}</p>
                    </div>
                    <div className="rounded-[1rem] border border-white/10 bg-white/[0.03] p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Runs</p>
                      <p className="mt-2 text-lg font-semibold text-zinc-100">{agent.totalRuns ?? 0}</p>
                    </div>
                    <div className="rounded-[1rem] border border-white/10 bg-white/[0.03] p-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Cost</p>
                      <p className="mt-2 text-lg font-semibold text-zinc-100">{formatCost(agent.totalCostUsd)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </PageShell>
  )
}
