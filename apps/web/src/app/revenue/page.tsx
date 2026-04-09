"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RevenueClient {
  id: string;
  name: string;
  monthly: number;
  status: "active" | "churned" | "paused";
  startDate: string;
}

interface RevenueData {
  clients: RevenueClient[];
  targetMrr: number;
  prevMonthMrr: number;
}

interface SummaryStats {
  mrr: number;
  arr: number;
  activeClients: number;
  pipelineValue: number;
  avgDealSize: number;
  mrrDelta: number;
  mrrDeltaPct: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(1) + "K";
  return "$" + n.toLocaleString("en-US");
}


// ─── Sub-components ───────────────────────────────────────────────────────────

interface SummaryCardProps {
  label: string;
  value: string;
  hint: string;
  accent?: boolean;
  delta?: { value: string; positive: boolean } | null;
}

function SummaryCard({ label, value, hint, accent, delta }: SummaryCardProps) {
  return (
    <div
      className="rounded-xl border border-white/10 p-6 flex flex-col gap-2"
      style={{
        background: accent
          ? "linear-gradient(135deg, rgba(52,211,153,0.08) 0%, rgba(255,255,255,0.03) 100%)"
          : "rgba(255,255,255,0.03)",
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{label}</p>
      <p
        className="text-3xl font-light tabular-nums"
        style={{ color: accent ? "#34d399" : "#f4f4f5" }}
      >
        {value}
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm text-zinc-400">{hint}</p>
        {delta && (
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: delta.positive ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)",
              color: delta.positive ? "#34d399" : "#f87171",
            }}
          >
            {delta.positive ? "+" : ""}{delta.value}
          </span>
        )}
      </div>
    </div>
  );
}

interface QuickLinkProps {
  href: string;
  label: string;
  description: string;
  icon: string;
}

function QuickLink({ href, label, description, icon }: QuickLinkProps) {
  return (
    <Link
      href={href}
      className="flex items-start gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-white/20 hover:bg-white/[0.06]"
    >
      <span className="text-2xl shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-zinc-100">{label}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
      </div>
    </Link>
  );
}

// ─── Mock pipeline data (TODO: wire to GHL API at /api/revenue/pipeline) ─────

const MOCK_PIPELINE_VALUE = 47_500;
const MOCK_PIPELINE_DEALS = 8;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RevenuePage() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/revenue")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((json) => {
        setData(json);
        setLoading(false);
      });
  }, []);

  const stats: SummaryStats | null = data
    ? (() => {
        const active = data.clients.filter((c) => c.status === "active");
        const mrr = active.reduce((s, c) => s + (c.monthly ?? 0), 0);
        const mrrDelta = mrr - (data.prevMonthMrr ?? 0);
        const mrrDeltaPct = data.prevMonthMrr > 0 ? (mrrDelta / data.prevMonthMrr) * 100 : 0;
        const avgDealSize = active.length > 0 ? Math.round(mrr / active.length) : 0;
        return {
          mrr,
          arr: mrr * 12,
          activeClients: active.length,
          pipelineValue: MOCK_PIPELINE_VALUE,
          avgDealSize,
          mrrDelta,
          mrrDeltaPct,
        };
      })()
    : null;

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-6xl space-y-8">
        {/* Header */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-2">
            Revenue
          </p>
          <h1 className="text-3xl font-light text-zinc-100">Revenue Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-400">
            MRR, active clients, pipeline, and deal performance — all in one place.
          </p>
        </div>

        {/* Summary Cards */}
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-6 h-32 animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard
              label="MRR"
              value={stats ? fmt(stats.mrr) : "—"}
              hint="Monthly recurring revenue"
              accent
              delta={
                stats && stats.mrrDelta !== 0
                  ? {
                      value: fmt(Math.abs(stats.mrrDelta)) + " vs last month",
                      positive: stats.mrrDelta >= 0,
                    }
                  : null
              }
            />
            <SummaryCard
              label="ARR"
              value={stats ? fmt(stats.arr) : "—"}
              hint="Annualised run rate"
            />
            <SummaryCard
              label="Active Clients"
              value={stats ? String(stats.activeClients) : "—"}
              hint="Revenue-generating accounts"
            />
            <SummaryCard
              label="Pipeline Value"
              value={fmt(MOCK_PIPELINE_VALUE)}
              hint={`${MOCK_PIPELINE_DEALS} open deals`}
            />
          </div>
        )}

        {/* Secondary metrics */}
        {!loading && stats && (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <SummaryCard
              label="Avg Deal Size"
              value={fmt(stats.avgDealSize)}
              hint="Per active client / month"
            />
            <SummaryCard
              label="MRR Growth"
              value={
                stats.mrrDeltaPct !== 0
                  ? (stats.mrrDeltaPct >= 0 ? "+" : "") +
                    stats.mrrDeltaPct.toFixed(1) +
                    "%"
                  : "—"
              }
              hint="vs. previous month"
              delta={
                stats.mrrDeltaPct !== 0
                  ? { value: "", positive: stats.mrrDeltaPct >= 0 }
                  : null
              }
            />
            <SummaryCard
              label="Target MRR"
              value={data?.targetMrr ? fmt(data.targetMrr) : "Not set"}
              hint={
                data?.targetMrr && stats
                  ? `${Math.round((stats.mrr / data.targetMrr) * 100)}% of target`
                  : "Set a target to track progress"
              }
            />
          </div>
        )}

        {/* MRR progress bar */}
        {!loading && stats && data?.targetMrr && data.targetMrr > 0 && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                MRR Towards Target
              </p>
              <span className="text-sm text-zinc-300 tabular-nums">
                {fmt(stats.mrr)} / {fmt(data.targetMrr)}
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-2 rounded-full transition-all duration-700"
                style={{
                  width: `${Math.min(100, (stats.mrr / data.targetMrr) * 100)}%`,
                  backgroundColor: "#34d399",
                }}
              />
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              {Math.round((stats.mrr / data.targetMrr) * 100)}% complete —{" "}
              {fmt(data.targetMrr - stats.mrr)} to go
            </p>
          </div>
        )}

        {/* Quick Navigation */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-4">
            Revenue Tools
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <QuickLink
              href="/revenue/pipeline"
              label="Pipeline"
              description="Kanban board — track every deal from prospect to close"
              icon="📊"
            />
            <QuickLink
              href="/revenue/leads"
              label="Leads OS"
              description="Full lead table with search, filter, and action controls"
              icon="🎯"
            />
            <QuickLink
              href="/revenue/clients"
              label="Clients"
              description="Active client health scores, MRR, and churn risk"
              icon="🤝"
            />
            <QuickLink
              href="/revenue/closer"
              label="Closer AI"
              description="Closer employee performance — calls, deals, close rate"
              icon="🤖"
            />
            <QuickLink
              href="/revenue/outreach"
              label="Outreach"
              description="Cold-email campaigns — sent, opened, replied, booked"
              icon="📧"
            />
            <QuickLink
              href="/revenue/campaigns"
              label="Campaigns"
              description="Ad campaign metrics — spend, CTR, CPA, conversions"
              icon="📣"
            />
          </div>
        </div>

        {/* Client status breakdown */}
        {!loading && data && data.clients.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-5">
              Client Status Breakdown
            </p>
            <div className="grid grid-cols-3 gap-4">
              {(["active", "churned", "paused"] as const).map((status) => {
                const count = data.clients.filter((c) => c.status === status).length;
                const statusColors: Record<string, { bg: string; text: string }> = {
                  active: { bg: "rgba(52,211,153,0.12)", text: "#34d399" },
                  churned: { bg: "rgba(248,113,113,0.12)", text: "#f87171" },
                  paused: { bg: "rgba(251,191,36,0.12)", text: "#fbbf24" },
                };
                const c = statusColors[status];
                return (
                  <div
                    key={status}
                    className="rounded-lg p-4 text-center"
                    style={{ backgroundColor: c.bg }}
                  >
                    <p className="text-2xl font-light tabular-nums" style={{ color: c.text }}>
                      {count}
                    </p>
                    <p className="text-xs text-zinc-500 capitalize mt-1">{status}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
