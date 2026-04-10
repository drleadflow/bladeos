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

export default function PerformancePage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccount, setSelectedAccount] = useState<string>('')
  const [dateRange, setDateRange] = useState<DateRange>('7d')
  const [data, setData] = useState<PerformanceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
        <button
          onClick={fetchData}
          className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-zinc-200 transition-all hover:border-white/20 hover:bg-white/[0.08]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
            <path d="M16 21h5v-5" />
          </svg>
          Refresh
        </button>
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

          {/* Row 2 — Response metrics */}
          <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label="Intro Response Rate"
              value={`${data.introResponseRate}%`}
              sub={data.introResponseCount.toString()}
              sparkData={data.sparklines.responses}
              sparkColor="amber"
              sparkGradient
            />
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
          </div>

          {/* Row 3 — Conversion tail */}
          <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label="CTA to Booking"
              value={`${data.ctaToBooking}%`}
              sub={data.totalBookings.toString()}
            />
            <StatCard
              label="Response no CTA"
              value={`${data.responseNoCTA}%`}
              sub={data.responseNoCtaCount.toString()}
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
        </>
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
