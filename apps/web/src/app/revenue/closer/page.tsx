"use client";

import { useState, useEffect } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ActivityType = "call" | "deal_closed" | "follow_up" | "proposal_sent" | "no_show";

interface CloserMetrics {
  callsMade: number;
  callsBooked: number;
  showRate: number;
  dealsClosed: number;
  closeRate: number;
  revenueGenerated: number;
  avgDealSize: number;
  callsThisWeek: number;
  dealsThisWeek: number;
  revenueThisMonth: number;
}

interface ActivityItem {
  id: string;
  type: ActivityType;
  contact: string;
  company: string;
  detail: string;
  value: number | null;
  timestamp: string;
  outcome: "positive" | "negative" | "neutral";
}

// ─── Mock data (TODO: connect Closer AI employee events from /api/agents/closer/activity) ─

const MOCK_METRICS: CloserMetrics = {
  callsMade: 47,
  callsBooked: 63,
  showRate: 74.6,
  dealsClosed: 11,
  closeRate: 23.4,
  revenueGenerated: 41_800,
  avgDealSize: 3_800,
  callsThisWeek: 9,
  dealsThisWeek: 2,
  revenueThisMonth: 14_200,
};

const MOCK_ACTIVITY: ActivityItem[] = [
  { id: "a1", type: "deal_closed",    contact: "Dana Lee",      company: "Lee Wellness",     detail: "Signed agency retainer — full onboarding scheduled for next week.", value: 5500, timestamp: new Date(Date.now() - 0.5  * 3600000).toISOString(), outcome: "positive" },
  { id: "a2", type: "call",           contact: "Avery Chen",    company: "Chen Performance", detail: "Discovery call completed. Strong interest in full-service package.", value: null, timestamp: new Date(Date.now() - 2    * 3600000).toISOString(), outcome: "positive" },
  { id: "a3", type: "proposal_sent",  contact: "Marcus Webb",   company: "Webb Fitness Co.", detail: "Sent $3,500/mo agency proposal. Follow-up scheduled for 48 hours.", value: 3500, timestamp: new Date(Date.now() - 4    * 3600000).toISOString(), outcome: "neutral"  },
  { id: "a4", type: "no_show",        contact: "Chris Patel",   company: "Patel Training",   detail: "No-show on discovery call. Automated reschedule sequence triggered.", value: null, timestamp: new Date(Date.now() - 6    * 3600000).toISOString(), outcome: "negative" },
  { id: "a5", type: "follow_up",      contact: "Nina Torres",   company: "Torres Athletics", detail: "Second follow-up sent. Prospect requested one more week to decide.", value: null, timestamp: new Date(Date.now() - 10   * 3600000).toISOString(), outcome: "neutral"  },
  { id: "a6", type: "deal_closed",    contact: "Riley Johnson", company: "Johnson Athletics",detail: "Renewal + upsell closed. Expanded from coaching to full agency tier.", value: 6000, timestamp: new Date(Date.now() - 1    * 86400000).toISOString(), outcome: "positive" },
  { id: "a7", type: "call",           contact: "Taylor Grant",  company: "Grant Method",     detail: "Strategy call. Identified expansion opportunity for paid ads add-on.", value: null, timestamp: new Date(Date.now() - 1.5  * 86400000).toISOString(), outcome: "positive" },
  { id: "a8", type: "proposal_sent",  contact: "Sam Rivera",    company: "Rivera Health",    detail: "$2,800/mo coaching package proposal sent after triage call.", value: 2800, timestamp: new Date(Date.now() - 2    * 86400000).toISOString(), outcome: "neutral"  },
  { id: "a9", type: "call",           contact: "Jordan Cole",   company: "Cole Performance", detail: "Objection handled — price concern addressed with ROI breakdown.", value: null, timestamp: new Date(Date.now() - 2.5  * 86400000).toISOString(), outcome: "positive" },
  { id: "a10",type: "no_show",        contact: "Priya Sharma",  company: "FitLife Studios",  detail: "No-show. Left voicemail and sent follow-up email sequence.", value: null, timestamp: new Date(Date.now() - 3    * 86400000).toISOString(), outcome: "negative" },
];

const ACTIVITY_CONFIG: Record<ActivityType, { label: string; icon: string; bg: string; color: string }> = {
  call:           { label: "Call",          icon: "📞", bg: "rgba(59,130,246,0.12)",  color: "#60a5fa" },
  deal_closed:    { label: "Deal Closed",   icon: "🎯", bg: "rgba(52,211,153,0.12)",  color: "#34d399" },
  follow_up:      { label: "Follow-up",     icon: "📨", bg: "rgba(139,92,246,0.12)",  color: "#a78bfa" },
  proposal_sent:  { label: "Proposal",      icon: "📄", bg: "rgba(245,158,11,0.12)",  color: "#fbbf24" },
  no_show:        { label: "No-show",       icon: "⚠️", bg: "rgba(248,113,113,0.12)", color: "#f87171" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1000) return "$" + (n / 1000).toFixed(1) + "K";
  return "$" + n.toLocaleString("en-US");
}

function formatAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface MetricTileProps {
  label: string;
  value: string;
  hint: string;
  accent?: boolean;
}

function MetricTile({ label, value, hint, accent }: MetricTileProps) {
  return (
    <div
      className="rounded-xl border border-white/10 p-5 flex flex-col gap-1"
      style={{
        background: accent
          ? "linear-gradient(135deg, rgba(52,211,153,0.08) 0%, rgba(255,255,255,0.03) 100%)"
          : "rgba(255,255,255,0.03)",
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{label}</p>
      <p
        className="text-2xl font-light tabular-nums"
        style={{ color: accent ? "#34d399" : "#f4f4f5" }}
      >
        {value}
      </p>
      <p className="text-xs text-zinc-500">{hint}</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CloserPage() {
  const [metrics, setMetrics] = useState<CloserMetrics | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityFilter, setActivityFilter] = useState<ActivityType | "all">("all");

  useEffect(() => {
    // TODO: fetch("/api/agents/closer/activity") — pull real Closer AI employee events
    const timer = setTimeout(() => {
      setMetrics(MOCK_METRICS);
      setActivity(MOCK_ACTIVITY);
      setLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  const filteredActivity =
    activityFilter === "all"
      ? activity
      : activity.filter((a) => a.type === activityFilter);

  const allTypes: ActivityType[] = ["call", "deal_closed", "proposal_sent", "follow_up", "no_show"];

  if (loading) {
    return (
      <div className="min-h-screen p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <div className="h-10 w-48 rounded-xl bg-white/[0.04] animate-pulse" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-white/[0.04] animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-6xl space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-2">
              Revenue
            </p>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-light text-zinc-100">Closer AI</h1>
              <span
                className="text-xs font-medium px-2.5 py-1 rounded-full flex items-center gap-1.5"
                style={{ backgroundColor: "rgba(52,211,153,0.12)", color: "#34d399" }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Active
              </span>
            </div>
            <p className="mt-1 text-sm text-zinc-400">
              AI employee performance — calls, deals, close rate, and revenue attribution.
            </p>
          </div>
          <div
            className="rounded-xl border border-white/10 px-5 py-4 text-right"
            style={{ background: "rgba(52,211,153,0.06)" }}
          >
            <p className="text-xs text-zinc-500 uppercase tracking-widest">This Month</p>
            <p className="text-2xl font-light tabular-nums mt-1" style={{ color: "#34d399" }}>
              {fmt(metrics.revenueThisMonth)}
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {metrics.dealsThisWeek} deals this week
            </p>
          </div>
        </div>

        {/* Primary metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricTile
            label="Revenue Generated"
            value={fmt(metrics.revenueGenerated)}
            hint="All-time attributed revenue"
            accent
          />
          <MetricTile
            label="Deals Closed"
            value={String(metrics.dealsClosed)}
            hint={`${metrics.dealsThisWeek} this week`}
          />
          <MetricTile
            label="Close Rate"
            value={metrics.closeRate.toFixed(1) + "%"}
            hint="Calls → closed deals"
          />
          <MetricTile
            label="Avg Deal Size"
            value={fmt(metrics.avgDealSize)}
            hint="Per closed deal"
          />
        </div>

        {/* Secondary metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricTile
            label="Calls Made"
            value={String(metrics.callsMade)}
            hint={`${metrics.callsThisWeek} this week`}
          />
          <MetricTile
            label="Calls Booked"
            value={String(metrics.callsBooked)}
            hint="Discovery + triage calls"
          />
          <MetricTile
            label="Show Rate"
            value={metrics.showRate.toFixed(1) + "%"}
            hint="Booked → showed up"
          />
          <MetricTile
            label="Proposals Sent"
            value={String(activity.filter((a) => a.type === "proposal_sent").length)}
            hint="Awaiting decision"
          />
        </div>

        {/* Activity timeline */}
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-1">
                Activity Timeline
              </p>
              <p className="text-sm text-zinc-400">Recent Closer AI actions and outcomes</p>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {(["all", ...allTypes] as const).map((t) => {
                const active = activityFilter === t;
                const cfg = t !== "all" ? ACTIVITY_CONFIG[t] : null;
                return (
                  <button
                    key={t}
                    onClick={() => setActivityFilter(t)}
                    className="px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors"
                    style={{
                      backgroundColor: active ? (cfg?.bg ?? "rgba(52,211,153,0.12)") : "rgba(255,255,255,0.03)",
                      borderColor: active ? (cfg?.color ?? "#34d399") : "rgba(255,255,255,0.08)",
                      color: active ? (cfg?.color ?? "#34d399") : "#71717a",
                    }}
                  >
                    {t === "all" ? "All" : ACTIVITY_CONFIG[t].label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2.5">
            {filteredActivity.map((item) => {
              const cfg = ACTIVITY_CONFIG[item.type];
              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-4 flex items-start gap-4 hover:border-white/20 transition-colors"
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 mt-0.5"
                    style={{ backgroundColor: cfg.bg }}
                  >
                    {cfg.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: cfg.bg, color: cfg.color }}
                      >
                        {cfg.label}
                      </span>
                      <span className="text-sm font-medium text-zinc-100">{item.contact}</span>
                      <span className="text-xs text-zinc-600">·</span>
                      <span className="text-xs text-zinc-500">{item.company}</span>
                      {item.value && (
                        <>
                          <span className="text-xs text-zinc-600">·</span>
                          <span className="text-xs font-semibold" style={{ color: "#34d399" }}>
                            {fmt(item.value)}/mo
                          </span>
                        </>
                      )}
                    </div>
                    <p className="text-sm text-zinc-400 leading-5">{item.detail}</p>
                  </div>
                  <span className="text-xs text-zinc-600 shrink-0 mt-0.5 tabular-nums">
                    {formatAgo(item.timestamp)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* TODO notice */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-5 py-4">
          <p className="text-xs text-zinc-500">
            <span className="font-semibold text-zinc-400">TODO:</span> Wire to{" "}
            <code className="text-emerald-400 text-[11px]">/api/agents/closer/activity</code> — pull
            real Closer AI employee events from the activity log. Metrics should aggregate from GHL
            pipeline + conversation history.
          </p>
        </div>
      </div>
    </div>
  );
}
