'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Badge,
  EmptyState,
  PageShell,
} from '@/components/dashboard/cockpit-ui'
import { Sparkline } from '@/components/dashboard/sparkline'

// ── Types ────────────────────────────────────────────────────

interface Account {
  id: string
  name: string
  isDefault: boolean
}

interface PerformanceData {
  leadActivations: number
  totalBookings: number
  leadToBooking: number
  leadsToCTA: number
  leadsToCtaCount: number
  introResponseRate: number
  introResponseCount: number
  followupResponseRate: number
  followupResponseCount: number
  neverRepliedRate: number
  neverRepliedCount: number
  responseToCTA: number
  responseToCtaCount: number
  responseToBooking: number
  ctaToBooking: number
  responseNoCTA: number
  responseNoCtaCount: number
  leadsDQ: number
  leadsDqCount: number
  avgInteractions: number
  avgHuntsFired: number
  timeSaved: number
  moneySaved: number
  sparklines: {
    activations: number[]
    responses: number[]
    cta: number[]
  }
  topIntros?: IntroPattern[]
}

interface IntroPattern {
  intro: string
  contactName: string
  gotResponse: boolean
  firstResponse: string
  messageCount: number
  conversationId: string
}

// ── Date range presets ───────────────────────────────────────

type DateRange = '7d' | '30d' | '60d' | '90d'

function getDateRange(range: DateRange): { startDate: string; endDate: string; label: string } {
  const end = new Date()
  const start = new Date()
  const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '60d' ? 60 : 90
  start.setDate(start.getDate() - days)

  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    label: `${fmt(start)} - ${fmt(end)}`,
  }
}

// ── Metric card with sparkline ───────────────────────────────

function StatCard({
  label,
  value,
  sub,
  sparkData,
  sparkColor,
  sparkGradient,
}: {
  label: string
  value: string
  sub?: string
  sparkData?: number[]
  sparkColor?: 'cyan' | 'emerald' | 'amber' | 'rose' | 'blue' | 'pink' | 'yellow'
  sparkGradient?: boolean
}) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
      <p className="text-sm text-zinc-400">{label}</p>
      <p className="mt-2 text-3xl font-bold text-zinc-50">{value}</p>
      {sub && <p className="mt-1 text-sm text-zinc-500">{sub}</p>}
      {sparkData && sparkData.length >= 2 && (
        <div className="mt-3">
          <Sparkline
            data={sparkData}
            color={sparkColor}
            gradient={sparkGradient}
            width={180}
            height={32}
          />
        </div>
      )}
      {(!sparkData || sparkData.length < 2) && (
        <p className="mt-3 text-xs text-zinc-600">No data</p>
      )}
    </div>
  )
}

// ── Efficiency card with icon ────────────────────────────────

function EfficiencyCard({
  icon,
  label,
  value,
  iconBg,
}: {
  icon: string
  label: string
  value: string
  iconBg: string
}) {
  return (
    <div className="flex items-center gap-4 rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
      <div
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${iconBg}`}
      >
        <span className="text-lg">{icon}</span>
      </div>
      <div>
        <p className="text-xs text-zinc-500">{label}</p>
        <p className="mt-1 text-2xl font-bold text-zinc-50">{value}</p>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────

interface PipelineOption {
  id: string
  name: string
  stageCount: number
}

interface PipelineAnalysis {
  pipelineId: string
  pipelineName: string
  totalOpportunities: number
  stageBreakdown: Array<{ stage: string; count: number; pct: number }>
  introResponseRate: number
  introResponseCount: number
  followupResponseRate: number
  followupResponseCount: number
  neverRepliedRate: number
  neverRepliedCount: number
  sampled: number
  topIntros: Array<{
    name: string
    intro: string
    gotResponse: boolean
    reply: string
  }>
}

export default function PerformancePage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccount, setSelectedAccount] = useState<string>('')
  const [dateRange, setDateRange] = useState<DateRange>('7d')
  const [data, setData] = useState<PerformanceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cached, setCached] = useState(false)
  const [syncedAt, setSyncedAt] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  // Pipeline state
  const [pipelines, setPipelines] = useState<PipelineOption[]>([])
  const [selectedPipeline, setSelectedPipeline] = useState<string>('')
  const [pipelineData, setPipelineData] = useState<PipelineAnalysis | null>(null)
  const [pipelineLoading, setPipelineLoading] = useState(false)

  // Fetch pipelines when account changes
  useEffect(() => {
    if (!selectedAccount) return
    setPipelines([])
    setSelectedPipeline('')
    setPipelineData(null)
    async function loadPipelines() {
      try {
        const res = await fetch(`/api/performance/pipelines?accountId=${selectedAccount}`)
        const json = await res.json()
        if (json.success && json.data) {
          setPipelines(json.data)
        }
      } catch { /* ignore */ }
    }
    loadPipelines()
  }, [selectedAccount])

  // Fetch pipeline analysis when pipeline is selected
  useEffect(() => {
    if (!selectedAccount || !selectedPipeline) {
      setPipelineData(null)
      return
    }
    let cancelled = false
    async function loadPipelineData() {
      setPipelineLoading(true)
      try {
        const res = await fetch(
          `/api/performance/pipeline?accountId=${selectedAccount}&pipelineId=${selectedPipeline}`
        )
        const json = await res.json()
        if (!cancelled && json.success) {
          setPipelineData(json.data)
        }
      } catch { /* ignore */ }
      finally { if (!cancelled) setPipelineLoading(false) }
    }
    loadPipelineData()
    return () => { cancelled = true }
  }, [selectedAccount, selectedPipeline])

  // Fetch accounts on mount
  useEffect(() => {
    async function loadAccounts() {
      try {
        const res = await fetch('/api/performance/accounts')
        const json = await res.json()
        if (json.success && json.data) {
          setAccounts(json.data)
          const defaultAccount = json.data.find((a: Account) => a.isDefault)
          setSelectedAccount(defaultAccount?.id ?? json.data[0]?.id ?? '')
        }
      } catch {
        setError('Failed to load accounts')
      }
    }
    loadAccounts()
  }, [])

  // Fetch performance data when account or date range changes
  const fetchData = useCallback(async () => {
    if (!selectedAccount) return
    setLoading(true)
    setError(null)

    const { startDate, endDate } = getDateRange(dateRange)

    try {
      const res = await fetch(
        `/api/performance?accountId=${selectedAccount}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
      )
      const json = await res.json()
      if (json.success) {
        setData(json.data)
        setCached(Boolean(json.cached))
        setSyncedAt(json.syncedAt ?? null)
      } else if (json.error === 'token_expired') {
        setError(`Token expired for ${accountName}. The account owner needs to reinstall the GHL integration or create a Private Integration Token.`)
      } else {
        setError(json.error ?? 'Failed to load performance data')
      }
    } catch {
      setError('Network error loading performance data')
    } finally {
      setLoading(false)
    }
  }, [selectedAccount, dateRange])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 5 * 60 * 1000) // Refresh every 5 min
    return () => clearInterval(interval)
  }, [fetchData])

  const { label: dateLabel } = getDateRange(dateRange)
  const accountName =
    accounts.find((a) => a.id === selectedAccount)?.name ?? 'Select account'

  return (
    <PageShell
      eyebrow="Analytics"
      title="Performance"
      description="Review AI Setter data and performance."
      actions={
        <div className="flex items-center gap-3">
          {syncedAt && (
            <span className="text-xs text-zinc-500">
              {cached ? 'Cached' : 'Live'} {syncedAt ? `\u00b7 ${new Date(syncedAt).toLocaleTimeString()}` : ''}
            </span>
          )}
          <button
            onClick={async () => {
              if (!selectedAccount || syncing) return
              setSyncing(true)
              try {
                await fetch('/api/performance/sync', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ accountId: selectedAccount }),
                })
                await fetchData()
              } finally {
                setSyncing(false)
              }
            }}
            disabled={syncing}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-zinc-200 transition-all hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-50"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={syncing ? 'animate-spin' : ''}>
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 21h5v-5" />
            </svg>
            {syncing ? 'Syncing...' : 'Refresh'}
          </button>
        </div>
      }
    >
      {/* ── Filter bar ──────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        {/* Account picker */}
        <select
          value={selectedAccount}
          onChange={(e) => setSelectedAccount(e.target.value)}
          className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-zinc-200 backdrop-blur-xl transition-colors hover:border-white/20 focus:border-cyan-400/40 focus:outline-none"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id} className="bg-zinc-900">
              {a.name}
            </option>
          ))}
        </select>

        {/* Date range tabs */}
        <div className="flex rounded-full border border-white/10 bg-white/[0.04] p-0.5">
          {(['7d', '30d', '60d', '90d'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setDateRange(r)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
                dateRange === r
                  ? 'bg-white text-zinc-950'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        {/* Pipeline picker */}
        {pipelines.length > 0 && (
          <select
            value={selectedPipeline}
            onChange={(e) => setSelectedPipeline(e.target.value)}
            className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-zinc-200 backdrop-blur-xl transition-colors hover:border-white/20 focus:border-cyan-400/40 focus:outline-none"
          >
            <option value="" className="bg-zinc-900">All Conversations</option>
            {pipelines.map((p) => (
              <option key={p.id} value={p.id} className="bg-zinc-900">
                {p.name}
              </option>
            ))}
          </select>
        )}

        {/* AI Setter badge */}
        <Badge tone="cyan">AI Setter</Badge>

        {/* Date label */}
        <span className="ml-auto text-sm text-zinc-500">{dateLabel}</span>
      </div>

      {/* ── Loading skeleton ─────────────────────────────── */}
      {loading && (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="animate-pulse rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
                <div className="h-3 w-24 rounded bg-zinc-700/50" />
                <div className="mt-4 h-8 w-20 rounded bg-zinc-700/50" />
                <div className="mt-3 h-2 w-16 rounded bg-zinc-800/50" />
                <div className="mt-4 h-8 w-full rounded bg-zinc-800/30" />
              </div>
            ))}
          </div>
          <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
                <div className="h-3 w-32 rounded bg-zinc-700/50" />
                <div className="mt-4 h-8 w-24 rounded bg-zinc-700/50" />
                <div className="mt-3 h-2 w-12 rounded bg-zinc-800/50" />
                <div className="mt-4 h-8 w-full rounded bg-zinc-800/30" />
              </div>
            ))}
          </div>
          <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
                <div className="h-3 w-24 rounded bg-zinc-700/50" />
                <div className="mt-4 h-8 w-20 rounded bg-zinc-700/50" />
              </div>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="animate-pulse rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-zinc-700/30" />
                  <div>
                    <div className="h-2 w-16 rounded bg-zinc-800/50" />
                    <div className="mt-3 h-6 w-24 rounded bg-zinc-700/50" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-zinc-500">
            Analyzing {accountName} conversations...
          </p>
        </>
      )}

      {/* ── Error state ─────────────────────────────────── */}
      {!loading && error && (
        <EmptyState
          title="Failed to load data"
          description={error}
        />
      )}

      {/* ── Data display ────────────────────────────────── */}
      {!loading && !error && data && (
        <>
          {/* Row 1 — Top funnel */}
          <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Lead Activations"
              value={data.leadActivations.toLocaleString()}
              sub="-"
              sparkData={data.sparklines.activations}
              sparkColor="cyan"
              sparkGradient
            />
            <StatCard
              label="Total Bookings"
              value={data.totalBookings.toLocaleString()}
              sub="-"
            />
            <StatCard
              label="Lead to Booking"
              value={`${data.leadToBooking}%`}
              sub={data.totalBookings.toString()}
            />
            <StatCard
              label="Leads To CTA"
              value={`${data.leadsToCTA}%`}
              sub={data.leadsToCtaCount.toString()}
              sparkData={data.sparklines.cta}
              sparkColor="blue"
              sparkGradient
            />
          </div>

          {/* Row 2 — Response breakdown */}
          <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label="Replied to Intro"
              value={`${data.introResponseRate}%`}
              sub={`${data.introResponseCount} replied before follow-up`}
              sparkData={data.sparklines.responses}
              sparkColor="emerald"
              sparkGradient
            />
            <StatCard
              label="Replied to Follow-up"
              value={`${data.followupResponseRate}%`}
              sub={`${data.followupResponseCount} replied to later messages`}
              sparkColor="amber"
            />
            <StatCard
              label="Never Replied"
              value={`${data.neverRepliedRate}%`}
              sub={`${data.neverRepliedCount} total dead leads`}
              sparkColor="rose"
            />
          </div>

          {/* Row 3 — CTA metrics */}
          <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label="Response to CTA"
              value={`${data.responseToCTA}%`}
              sub={data.responseToCtaCount.toString()}
              sparkData={data.sparklines.cta}
              sparkColor="pink"
              sparkGradient
            />
            <StatCard
              label="Response to Booking"
              value={`${data.responseToBooking}%`}
              sub={data.totalBookings.toString()}
            />
            <StatCard
              label="Response no CTA"
              value={`${data.responseNoCTA}%`}
              sub={data.responseNoCtaCount.toString()}
            />
          </div>

          {/* Row 4 — Conversion tail */}
          <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
            <StatCard
              label="CTA to Booking"
              value={`${data.ctaToBooking}%`}
              sub={data.totalBookings.toString()}
            />
            <StatCard
              label="Leads DQ%"
              value={`${data.leadsDQ}%`}
              sub={data.leadsDqCount.toString()}
            />
          </div>

          {/* Row 4 — Efficiency */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <EfficiencyCard
              icon="🎯"
              label="Time Saved"
              value={`${data.timeSaved} hours`}
              iconBg="bg-emerald-500/20"
            />
            <EfficiencyCard
              icon="💎"
              label="Money Saved"
              value={`$${data.moneySaved.toLocaleString()}`}
              iconBg="bg-emerald-500/20"
            />
            <EfficiencyCard
              icon="⚡"
              label="Avg. Hunts Fired"
              value={`${data.avgHuntsFired} per conv.`}
              iconBg="bg-blue-500/20"
            />
            <EfficiencyCard
              icon="💬"
              label="Avg. Lead Interactions"
              value={`${data.avgInteractions} per conv.`}
              iconBg="bg-cyan-500/20"
            />
          </div>

          {/* Row 5 — Top Performing Intros */}
          {data.topIntros && data.topIntros.length > 0 && (
            <div className="mt-6">
              <div className="mb-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-zinc-500">
                  Message Intelligence
                </p>
                <h2 className="mt-1 text-lg font-semibold text-zinc-100">
                  Top Performing Intros
                </h2>
                <p className="mt-1 text-sm text-zinc-400">
                  First messages that got a reply vs ones that went dead.
                </p>
              </div>

              {/* Winning intros */}
              <div className="mb-4 space-y-3">
                {data.topIntros
                  .filter((p) => p.gotResponse)
                  .slice(0, 8)
                  .map((pattern) => (
                    <div
                      key={pattern.conversationId}
                      className="rounded-[1.5rem] border border-emerald-400/20 bg-emerald-400/[0.04] p-5"
                    >
                      <div className="mb-3 flex items-center gap-2">
                        <span className="inline-flex items-center rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-300">
                          Got Reply
                        </span>
                        <span className="text-xs text-zinc-500">
                          {pattern.messageCount} messages in thread
                        </span>
                      </div>
                      <p className="text-sm leading-6 text-zinc-200">
                        {pattern.intro.length > 280
                          ? pattern.intro.slice(0, 280) + '...'
                          : pattern.intro}
                      </p>
                      {pattern.firstResponse && (
                        <div className="mt-3 rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                            Lead replied
                          </p>
                          <p className="mt-1 text-sm text-cyan-300/90">
                            &ldquo;{pattern.firstResponse.length > 150
                              ? pattern.firstResponse.slice(0, 150) + '...'
                              : pattern.firstResponse}&rdquo;
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
              </div>

              {/* Dead intros */}
              {data.topIntros.filter((p) => !p.gotResponse).length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                    No Reply
                  </p>
                  {data.topIntros
                    .filter((p) => !p.gotResponse)
                    .slice(0, 4)
                    .map((pattern) => (
                      <div
                        key={pattern.conversationId}
                        className="rounded-[1.5rem] border border-white/5 bg-white/[0.02] p-5 opacity-60"
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <span className="inline-flex items-center rounded-full border border-zinc-700/50 bg-zinc-800/50 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
                            Dead
                          </span>
                        </div>
                        <p className="text-sm leading-6 text-zinc-400">
                          {pattern.intro.length > 200
                            ? pattern.intro.slice(0, 200) + '...'
                            : pattern.intro}
                        </p>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Pipeline Analysis ────────────────────────────── */}
      {selectedPipeline && pipelineLoading && (
        <div className="mt-6 rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-6">
          <div className="flex items-center gap-3">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
            <p className="text-sm text-zinc-400">Analyzing pipeline conversations...</p>
          </div>
        </div>
      )}

      {selectedPipeline && !pipelineLoading && pipelineData && (
        <div className="mt-6 space-y-4">
          <div className="rounded-[1.75rem] border border-cyan-400/20 bg-cyan-400/[0.03] p-6">
            <div className="mb-5">
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-cyan-300/80">
                Pipeline Analysis
              </p>
              <h2 className="mt-1 text-lg font-semibold text-zinc-100">
                {pipelineData.pipelineName}
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                {pipelineData.totalOpportunities} total leads &middot; {pipelineData.sampled} sampled for response analysis
              </p>
            </div>

            {/* Response breakdown */}
            <div className="mb-5 grid gap-4 sm:grid-cols-3">
              <StatCard
                label="Replied to Intro"
                value={`${pipelineData.introResponseRate}%`}
                sub={`${pipelineData.introResponseCount}/${pipelineData.sampled} sampled`}
                sparkColor="emerald"
              />
              <StatCard
                label="Replied to Follow-up"
                value={`${pipelineData.followupResponseRate}%`}
                sub={`${pipelineData.followupResponseCount}/${pipelineData.sampled}`}
                sparkColor="amber"
              />
              <StatCard
                label="Never Replied"
                value={`${pipelineData.neverRepliedRate}%`}
                sub={`${pipelineData.neverRepliedCount}/${pipelineData.sampled}`}
                sparkColor="rose"
              />
            </div>

            {/* Stage breakdown */}
            {pipelineData.stageBreakdown.length > 0 && (
              <div className="mb-5">
                <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                  Stage Breakdown
                </p>
                <div className="space-y-2">
                  {pipelineData.stageBreakdown.map((s) => (
                    <div key={s.stage} className="flex items-center gap-3">
                      <span className="w-44 truncate text-sm text-zinc-300">{s.stage}</span>
                      <div className="flex-1">
                        <div className="h-2 rounded-full bg-white/5">
                          <div
                            className="h-2 rounded-full bg-gradient-to-r from-cyan-400/60 to-blue-500/40"
                            style={{ width: `${Math.max(s.pct, 2)}%` }}
                          />
                        </div>
                      </div>
                      <span className="w-16 text-right text-xs text-zinc-500">
                        {s.count} ({s.pct}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top intros for this pipeline */}
            {pipelineData.topIntros.length > 0 && (
              <div>
                <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                  Intro Messages
                </p>
                <div className="space-y-3">
                  {pipelineData.topIntros.filter((p) => p.gotResponse).slice(0, 5).map((pattern, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] p-4"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span className="inline-flex items-center rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-300">
                          Got Reply
                        </span>
                        <span className="text-xs text-zinc-500">{pattern.name}</span>
                      </div>
                      <p className="text-sm leading-6 text-zinc-200">
                        {pattern.intro.length > 250 ? pattern.intro.slice(0, 250) + '...' : pattern.intro}
                      </p>
                      {pattern.reply && (
                        <div className="mt-2 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2">
                          <p className="text-xs text-cyan-300/90">
                            &ldquo;{pattern.reply.length > 120 ? pattern.reply.slice(0, 120) + '...' : pattern.reply}&rdquo;
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                  {pipelineData.topIntros.filter((p) => !p.gotResponse).slice(0, 3).map((pattern, i) => (
                    <div
                      key={`dead-${i}`}
                      className="rounded-xl border border-white/5 bg-white/[0.02] p-4 opacity-60"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span className="inline-flex items-center rounded-full border border-zinc-700/50 bg-zinc-800/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">
                          Dead
                        </span>
                        <span className="text-xs text-zinc-600">{pattern.name}</span>
                      </div>
                      <p className="text-sm leading-6 text-zinc-400">
                        {pattern.intro.length > 200 ? pattern.intro.slice(0, 200) + '...' : pattern.intro}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Empty data state ────────────────────────────── */}
      {!loading && !error && data && data.leadActivations === 0 && (
        <div className="mt-6">
          <EmptyState
            title="No conversations found"
            description={`No AI setter conversations found for ${accountName} in the selected date range.`}
          />
        </div>
      )}
    </PageShell>
  )
}
