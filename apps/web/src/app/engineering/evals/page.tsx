'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Badge,
  MetricCard,
  PageShell,
  Panel,
  PanelHeader,
  StatusDot,
} from '@/components/dashboard/cockpit-ui'

interface EvalSummary {
  totalJobs: number
  passed: number
  failed: number
  partial: number
  successRatePct: number
  avgCostUsd: number
  avgDurationSec: number
  avgToolCalls: number
  avgFixCycles: number
}

interface TrendBucket {
  bucket: string
  totalJobs: number
  passed: number
  successRatePct: number
  avgCostUsd: number
  avgDurationSec: number
}

interface RecentEval {
  job_id: string
  jobTitle: string | null
  status: string
  language: string | null
  agent_model: string | null
  total_cost_usd: number
  duration_ms: number
  tests_passed: number
  tests_failed: number
  fix_cycles_used: number
  files_changed: number
  evaluated_at: string
  stop_reason: string | null
}

function statusTone(status: string): 'emerald' | 'rose' | 'amber' | 'neutral' {
  if (status === 'passed') return 'emerald'
  if (status === 'failed') return 'rose'
  if (status === 'partial') return 'amber'
  return 'neutral'
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes}m ${secs}s`
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

export default function EvalsPage() {
  const [summary, setSummary] = useState<EvalSummary | null>(null)
  const [trend, setTrend] = useState<TrendBucket[]>([])
  const [recent, setRecent] = useState<RecentEval[]>([])
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const [summaryRes, trendRes, recentRes] = await Promise.all([
        fetch(`/api/evals?view=summary&days=${days}`),
        fetch(`/api/evals?view=trend&days=90&bucketDays=7`),
        fetch(`/api/evals?view=recent&limit=30`),
      ])

      const summaryData = await summaryRes.json()
      const trendData = await trendRes.json()
      const recentData = await recentRes.json()

      if (summaryData.success) setSummary(summaryData.data)
      if (trendData.success) setTrend(trendData.data)
      if (recentData.success) setRecent(recentData.data)
    } catch {
      // Silently handle fetch errors
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30_000)
    return () => clearInterval(interval)
  }, [fetchData])

  return (
    <PageShell eyebrow="Engineering" title="Agent Evals" description="Structured performance metrics for every coding job">
      {/* Summary Metrics */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard
          label="Success Rate"
          value={summary ? `${summary.successRatePct}%` : '--'}
          hint={summary ? `${summary.passed}/${summary.totalJobs} jobs` : undefined}
        />
        <MetricCard
          label="Total Jobs"
          value={summary?.totalJobs?.toString() ?? '--'}
          hint={`Last ${days} days`}
        />
        <MetricCard
          label="Avg Cost"
          value={summary ? `$${summary.avgCostUsd.toFixed(4)}` : '--'}
          hint="per job"
        />
        <MetricCard
          label="Avg Duration"
          value={summary ? `${summary.avgDurationSec}s` : '--'}
          hint="per job"
        />
        <MetricCard
          label="Avg Fix Cycles"
          value={summary?.avgFixCycles?.toFixed(1) ?? '--'}
          hint={`of 3 max`}
        />
      </div>

      {/* Time range selector */}
      <div className="mt-6 flex gap-2">
        {[7, 14, 30, 60, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
              days === d
                ? 'bg-white/20 text-white'
                : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70'
            }`}
          >
            {d}d
          </button>
        ))}
      </div>

      {/* Trend Chart (simple bar representation) */}
      {trend.length > 0 && (
        <Panel className="mt-6">
          <PanelHeader title="Weekly Success Rate Trend" />
          <div className="flex items-end gap-1 p-4" style={{ height: 120 }}>
            {trend.map((bucket, i) => {
              const height = Math.max(4, (bucket.successRatePct / 100) * 100)
              const color = bucket.successRatePct >= 80
                ? 'bg-green-500'
                : bucket.successRatePct >= 50
                  ? 'bg-yellow-500'
                  : 'bg-red-500'
              return (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] text-white/40">{bucket.successRatePct}%</span>
                  <div
                    className={`w-full rounded-t ${color}`}
                    style={{ height: `${height}%`, minHeight: 4 }}
                    title={`${bucket.bucket}: ${bucket.passed}/${bucket.totalJobs} passed (${bucket.successRatePct}%)`}
                  />
                  <span className="text-[9px] text-white/30">{bucket.totalJobs}</span>
                </div>
              )
            })}
          </div>
        </Panel>
      )}

      {/* Recent Evals Table */}
      <Panel className="mt-6">
        <PanelHeader title="Recent Evaluations" />
        {loading ? (
          <div className="p-4 text-sm text-white/40">Loading...</div>
        ) : recent.length === 0 ? (
          <div className="p-4 text-sm text-white/40">No evaluations recorded yet. Run a coding job to generate evals.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-white/50">
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Job</th>
                  <th className="px-3 py-2 font-medium">Language</th>
                  <th className="px-3 py-2 font-medium">Tests</th>
                  <th className="px-3 py-2 font-medium">Fix Cycles</th>
                  <th className="px-3 py-2 font-medium">Files</th>
                  <th className="px-3 py-2 font-medium">Cost</th>
                  <th className="px-3 py-2 font-medium">Duration</th>
                  <th className="px-3 py-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((ev, i) => (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                    <td className="px-3 py-2">
                      <StatusDot tone={statusTone(ev.status)} />
                      <span className="ml-1.5">{ev.status}</span>
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-2 text-white/80">
                      {ev.jobTitle ?? ev.job_id}
                    </td>
                    <td className="px-3 py-2">
                      {ev.language ? <Badge>{ev.language}</Badge> : <span className="text-white/30">--</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-green-400">{ev.tests_passed}p</span>
                      {ev.tests_failed > 0 && <span className="ml-1 text-red-400">{ev.tests_failed}f</span>}
                    </td>
                    <td className="px-3 py-2 text-white/60">{ev.fix_cycles_used}/3</td>
                    <td className="px-3 py-2 text-white/60">{ev.files_changed}</td>
                    <td className="px-3 py-2 text-white/60">${ev.total_cost_usd.toFixed(4)}</td>
                    <td className="px-3 py-2 text-white/60">{formatDuration(ev.duration_ms)}</td>
                    <td className="px-3 py-2 text-white/40">{relativeTime(ev.evaluated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </PageShell>
  )
}
