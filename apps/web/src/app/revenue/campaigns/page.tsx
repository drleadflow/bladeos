"use client";

import { useState, useEffect } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type CampaignObjective = "lead_gen" | "retargeting" | "awareness" | "conversion";
type CampaignPlatform = "Meta" | "Google" | "TikTok" | "YouTube" | "LinkedIn";

interface AdCampaign {
  id: string;
  name: string;
  platform: CampaignPlatform;
  objective: CampaignObjective;
  status: "active" | "paused" | "ended";
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  cpa: number;
  roas: number;
  startDate: string;
  client: string;
}

interface CampaignSummary {
  totalSpend: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  avgCtr: number;
  avgCpa: number;
  avgRoas: number;
}

// ─── Mock data (TODO: fetch("/api/ads") — pull from Meta, Google Ads APIs) ──────

const MOCK_CAMPAIGNS: AdCampaign[] = [
  {
    id: "ad1", name: "Gym Owners — Lead Gen (Broad)",
    platform: "Meta", objective: "lead_gen", status: "active",
    spend: 4200, impressions: 182000, clicks: 3276, ctr: 1.8, conversions: 74, cpa: 56.76, roas: 4.2,
    startDate: "2024-03-01", client: "Webb Fitness Co.",
  },
  {
    id: "ad2", name: "Med Spa Retargeting — VSL",
    platform: "Meta", objective: "retargeting", status: "active",
    spend: 1850, impressions: 54000, clicks: 1620, ctr: 3.0, conversions: 41, cpa: 45.12, roas: 6.1,
    startDate: "2024-03-15", client: "Vitality Med Spa",
  },
  {
    id: "ad3", name: "Personal Trainers — Search",
    platform: "Google", objective: "conversion", status: "active",
    spend: 2900, impressions: 44000, clicks: 1980, ctr: 4.5, conversions: 38, cpa: 76.32, roas: 3.4,
    startDate: "2024-02-20", client: "Cole Performance",
  },
  {
    id: "ad4", name: "Fitness Coaches — Awareness",
    platform: "TikTok", objective: "awareness", status: "active",
    spend: 1200, impressions: 390000, clicks: 4680, ctr: 1.2, conversions: 22, cpa: 54.55, roas: 2.8,
    startDate: "2024-04-01", client: "FitLife Studios",
  },
  {
    id: "ad5", name: "IV Wellness — YouTube Pre-roll",
    platform: "YouTube", objective: "awareness", status: "paused",
    spend: 780, impressions: 68000, clicks: 544, ctr: 0.8, conversions: 8, cpa: 97.50, roas: 1.9,
    startDate: "2024-03-10", client: "IV Wellness",
  },
  {
    id: "ad6", name: "B2B Agency — LinkedIn Lead Gen",
    platform: "LinkedIn", objective: "lead_gen", status: "active",
    spend: 3100, impressions: 28000, clicks: 840, ctr: 3.0, conversions: 29, cpa: 106.90, roas: 3.1,
    startDate: "2024-02-01", client: "Torres Athletics",
  },
  {
    id: "ad7", name: "Summer Body — Conversion",
    platform: "Meta", objective: "conversion", status: "ended",
    spend: 5500, impressions: 210000, clicks: 4200, ctr: 2.0, conversions: 95, cpa: 57.89, roas: 5.6,
    startDate: "2024-01-01", client: "Blake Fitness",
  },
];

const PLATFORM_CONFIG: Record<CampaignPlatform, { bg: string; color: string; icon: string }> = {
  Meta:     { bg: "rgba(59,130,246,0.12)",  color: "#60a5fa", icon: "M" },
  Google:   { bg: "rgba(234,179,8,0.12)",   color: "#eab308", icon: "G" },
  TikTok:   { bg: "rgba(248,113,113,0.12)", color: "#f87171", icon: "T" },
  YouTube:  { bg: "rgba(239,68,68,0.12)",   color: "#ef4444", icon: "▶" },
  LinkedIn: { bg: "rgba(14,165,233,0.12)",  color: "#38bdf8", icon: "in" },
};

const OBJECTIVE_LABELS: Record<CampaignObjective, string> = {
  lead_gen:    "Lead Gen",
  retargeting: "Retargeting",
  awareness:   "Awareness",
  conversion:  "Conversion",
};

const STATUS_CONFIG = {
  active: { bg: "rgba(52,211,153,0.12)",  color: "#34d399", label: "Active" },
  paused: { bg: "rgba(113,113,122,0.12)", color: "#a1a1aa", label: "Paused" },
  ended:  { bg: "rgba(59,130,246,0.10)",  color: "#60a5fa", label: "Ended" },
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtUSD(n: number): string {
  if (n >= 1000) return "$" + (n / 1000).toFixed(1) + "K";
  return "$" + n.toFixed(2);
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function roasColor(roas: number): string {
  if (roas >= 4) return "#34d399";
  if (roas >= 2.5) return "#fbbf24";
  return "#f87171";
}

function cpaColor(cpa: number, goodThreshold = 60): string {
  if (cpa <= goodThreshold) return "#34d399";
  if (cpa <= goodThreshold * 1.5) return "#fbbf24";
  return "#f87171";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface SummaryCardProps {
  label: string;
  value: string;
  hint: string;
  accent?: boolean;
}

function SummaryCard({ label, value, hint, accent }: SummaryCardProps) {
  return (
    <div
      className="rounded-xl border border-white/10 p-5"
      style={{
        background: accent
          ? "linear-gradient(135deg, rgba(52,211,153,0.08) 0%, rgba(255,255,255,0.03) 100%)"
          : "rgba(255,255,255,0.03)",
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{label}</p>
      <p className="text-2xl font-light tabular-nums mt-1.5" style={{ color: accent ? "#34d399" : "#f4f4f5" }}>
        {value}
      </p>
      <p className="text-xs text-zinc-500 mt-1">{hint}</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [platformFilter, setPlatformFilter] = useState<CampaignPlatform | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"active" | "paused" | "ended" | "all">("all");
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");

  useEffect(() => {
    // TODO: fetch(`/api/ads?period=${period}`) — pull from Meta/Google/TikTok/LinkedIn ad APIs
    const timer = setTimeout(() => {
      setCampaigns(MOCK_CAMPAIGNS);
      setLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [period]);

  const filtered = campaigns.filter((c) => {
    const matchPlatform = platformFilter === "all" || c.platform === platformFilter;
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    return matchPlatform && matchStatus;
  });

  const summary: CampaignSummary = {
    totalSpend:       filtered.reduce((s, c) => s + c.spend, 0),
    totalImpressions: filtered.reduce((s, c) => s + c.impressions, 0),
    totalClicks:      filtered.reduce((s, c) => s + c.clicks, 0),
    totalConversions: filtered.reduce((s, c) => s + c.conversions, 0),
    avgCtr:           filtered.length > 0 ? filtered.reduce((s, c) => s + c.ctr, 0) / filtered.length : 0,
    avgCpa:           filtered.length > 0 ? filtered.reduce((s, c) => s + c.cpa, 0) / filtered.length : 0,
    avgRoas:          filtered.length > 0 ? filtered.reduce((s, c) => s + c.roas, 0) / filtered.length : 0,
  };

  const platforms: CampaignPlatform[] = Array.from(new Set(campaigns.map((c) => c.platform)));

  if (loading) {
    return (
      <div className="min-h-screen p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <div className="h-10 w-48 rounded-xl bg-white/[0.04] animate-pulse" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-white/[0.04] animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-6xl space-y-8">
        {/* Header */}
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-2">
              Revenue
            </p>
            <h1 className="text-3xl font-light text-zinc-100">Campaigns</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Ad campaign performance — spend, impressions, CTR, conversions, and CPA.
            </p>
          </div>
          {/* Period selector */}
          <div className="flex gap-1.5">
            {(["7d", "30d", "90d"] as const).map((p) => (
              <button
                key={p}
                onClick={() => { setPeriod(p); setLoading(true); }}
                className="px-3 py-2 rounded-xl text-xs font-medium border transition-colors"
                style={{
                  backgroundColor: period === p ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.03)",
                  borderColor: period === p ? "#34d399" : "rgba(255,255,255,0.08)",
                  color: period === p ? "#34d399" : "#71717a",
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard
            label="Total Spend"
            value={fmtUSD(summary.totalSpend)}
            hint={`${filtered.length} campaigns`}
            accent
          />
          <SummaryCard
            label="Impressions"
            value={fmtNum(summary.totalImpressions)}
            hint={`${summary.avgCtr.toFixed(2)}% avg CTR`}
          />
          <SummaryCard
            label="Conversions"
            value={String(summary.totalConversions)}
            hint={`$${summary.avgCpa.toFixed(0)} avg CPA`}
          />
          <SummaryCard
            label="Avg ROAS"
            value={summary.avgRoas.toFixed(2) + "x"}
            hint="Return on ad spend"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setPlatformFilter("all")}
              className="px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors"
              style={{
                backgroundColor: platformFilter === "all" ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.03)",
                borderColor: platformFilter === "all" ? "#34d399" : "rgba(255,255,255,0.08)",
                color: platformFilter === "all" ? "#34d399" : "#71717a",
              }}
            >
              All Platforms
            </button>
            {platforms.map((p) => {
              const cfg = PLATFORM_CONFIG[p];
              const active = platformFilter === p;
              return (
                <button
                  key={p}
                  onClick={() => setPlatformFilter(p)}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors"
                  style={{
                    backgroundColor: active ? cfg.bg : "rgba(255,255,255,0.03)",
                    borderColor: active ? cfg.color : "rgba(255,255,255,0.08)",
                    color: active ? cfg.color : "#71717a",
                  }}
                >
                  {p}
                </button>
              );
            })}
          </div>

          <div className="flex gap-1.5">
            {(["all", "active", "paused", "ended"] as const).map((s) => {
              const active = statusFilter === s;
              const cfg = s !== "all" ? STATUS_CONFIG[s] : null;
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors"
                  style={{
                    backgroundColor: active ? (cfg?.bg ?? "rgba(52,211,153,0.12)") : "rgba(255,255,255,0.03)",
                    borderColor: active ? (cfg?.color ?? "#34d399") : "rgba(255,255,255,0.08)",
                    color: active ? (cfg?.color ?? "#34d399") : "#71717a",
                  }}
                >
                  {s === "all" ? "All" : STATUS_CONFIG[s].label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Campaign cards */}
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] py-16 text-center">
            <p className="text-zinc-500 text-sm">No campaigns match your filters.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((campaign) => {
              const pc = PLATFORM_CONFIG[campaign.platform];
              const sc = STATUS_CONFIG[campaign.status];
              return (
                <div
                  key={campaign.id}
                  className="rounded-xl border border-white/10 bg-white/[0.02] p-5 hover:border-white/20 transition-colors"
                >
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-3 mb-5">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0"
                        style={{ backgroundColor: pc.bg, color: pc.color }}
                      >
                        {pc.icon}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-100 truncate">{campaign.name}</p>
                        <div className="flex items-center gap-2 flex-wrap mt-1">
                          <span className="text-xs text-zinc-500">{campaign.platform}</span>
                          <span className="text-zinc-700 text-xs">·</span>
                          <span className="text-xs text-zinc-500">{OBJECTIVE_LABELS[campaign.objective]}</span>
                          <span className="text-zinc-700 text-xs">·</span>
                          <span className="text-xs text-zinc-500">{campaign.client}</span>
                        </div>
                      </div>
                    </div>
                    <span
                      className="text-xs font-medium px-2.5 py-1 rounded-full shrink-0"
                      style={{ backgroundColor: sc.bg, color: sc.color }}
                    >
                      {sc.label}
                    </span>
                  </div>

                  {/* Metrics */}
                  <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                    {[
                      { label: "Spend",        value: fmtUSD(campaign.spend),               color: undefined },
                      { label: "Impressions",  value: fmtNum(campaign.impressions),          color: undefined },
                      { label: "Clicks",       value: fmtNum(campaign.clicks),               color: undefined },
                      { label: "CTR",          value: campaign.ctr.toFixed(1) + "%",         color: campaign.ctr >= 2 ? "#34d399" : campaign.ctr >= 1 ? "#fbbf24" : "#f87171" },
                      { label: "Conversions",  value: String(campaign.conversions),           color: undefined },
                      { label: "CPA",          value: fmtUSD(campaign.cpa),                  color: cpaColor(campaign.cpa) },
                      { label: "ROAS",         value: campaign.roas.toFixed(1) + "x",        color: roasColor(campaign.roas) },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="rounded-lg px-3 py-2.5 bg-white/[0.03] border border-white/[0.05] text-center"
                      >
                        <p className="text-xs text-zinc-600 uppercase tracking-widest">{stat.label}</p>
                        <p
                          className="text-sm font-medium tabular-nums mt-0.5"
                          style={{ color: stat.color ?? "#f4f4f5" }}
                        >
                          {stat.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* TODO notice */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-5 py-4">
          <p className="text-xs text-zinc-500">
            <span className="font-semibold text-zinc-400">TODO:</span> Wire to{" "}
            <code className="text-emerald-400 text-[11px]">/api/ads</code> — pull live campaign
            data from Meta Business Manager, Google Ads, TikTok Ads, and LinkedIn Campaign Manager.
            Toggle/pause actions should POST back to respective platform APIs.
          </p>
        </div>
      </div>
    </div>
  );
}
