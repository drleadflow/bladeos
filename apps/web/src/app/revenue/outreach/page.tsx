"use client";

import { useState, useEffect } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type CampaignHealth = "strong" | "watch" | "at-risk";
type CampaignStatus = "active" | "paused" | "completed";

interface OutreachCampaign {
  id: string;
  name: string;
  status: CampaignStatus;
  channel: string;
  sent: number;
  opened: number;
  replied: number;
  positiveReplies: number;
  meetingsBooked: number;
  health: CampaignHealth;
  updatedAt: string;
}

interface OutreachSummary {
  activeCampaigns: number;
  totalSent: number;
  totalOpened: number;
  totalReplied: number;
  meetingsBooked: number;
  openRate: number;
  replyRate: number;
  positiveReplyRate: number;
}

// ─── Mock data (TODO: wire to /api/outreach → SmartLead / Instantly / Airtable) ─

const MOCK_CAMPAIGNS: OutreachCampaign[] = [
  {
    id: "c1", name: "Q2 Fitness Coaches — Cold Email",
    status: "active", channel: "Email",
    sent: 1240, opened: 496, replied: 87, positiveReplies: 31, meetingsBooked: 18,
    health: "strong", updatedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
  },
  {
    id: "c2", name: "Med Spa Owners — LinkedIn DM",
    status: "active", channel: "LinkedIn",
    sent: 380, opened: 190, replied: 52, positiveReplies: 19, meetingsBooked: 11,
    health: "strong", updatedAt: new Date(Date.now() - 5 * 3600000).toISOString(),
  },
  {
    id: "c3", name: "Personal Trainers — Cold Email V2",
    status: "active", channel: "Email",
    sent: 870, opened: 243, replied: 31, positiveReplies: 8, meetingsBooked: 4,
    health: "watch", updatedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
  {
    id: "c4", name: "Gym Owners — Instagram DM",
    status: "paused", channel: "Instagram",
    sent: 220, opened: 88, replied: 14, positiveReplies: 3, meetingsBooked: 2,
    health: "at-risk", updatedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
  {
    id: "c5", name: "Wellness Studios — Webinar Follow-up",
    status: "active", channel: "Email",
    sent: 540, opened: 297, replied: 62, positiveReplies: 28, meetingsBooked: 16,
    health: "strong", updatedAt: new Date(Date.now() - 0.5 * 86400000).toISOString(),
  },
  {
    id: "c6", name: "Chiro Offices — Cold Email",
    status: "paused", channel: "Email",
    sent: 460, opened: 92, replied: 11, positiveReplies: 2, meetingsBooked: 1,
    health: "at-risk", updatedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
  },
];

const MOCK_SUMMARY: OutreachSummary = {
  activeCampaigns: MOCK_CAMPAIGNS.filter((c) => c.status === "active").length,
  totalSent:       MOCK_CAMPAIGNS.reduce((s, c) => s + c.sent, 0),
  totalOpened:     MOCK_CAMPAIGNS.reduce((s, c) => s + c.opened, 0),
  totalReplied:    MOCK_CAMPAIGNS.reduce((s, c) => s + c.replied, 0),
  meetingsBooked:  MOCK_CAMPAIGNS.reduce((s, c) => s + c.meetingsBooked, 0),
  openRate:        Math.round((MOCK_CAMPAIGNS.reduce((s, c) => s + c.opened, 0) / MOCK_CAMPAIGNS.reduce((s, c) => s + c.sent, 0)) * 1000) / 10,
  replyRate:       Math.round((MOCK_CAMPAIGNS.reduce((s, c) => s + c.replied, 0) / MOCK_CAMPAIGNS.reduce((s, c) => s + c.sent, 0)) * 1000) / 10,
  positiveReplyRate: Math.round((MOCK_CAMPAIGNS.reduce((s, c) => s + c.positiveReplies, 0) / MOCK_CAMPAIGNS.reduce((s, c) => s + c.sent, 0)) * 1000) / 10,
};

const HEALTH_CONFIG: Record<CampaignHealth, { label: string; bg: string; color: string }> = {
  strong:   { label: "Strong",  bg: "rgba(52,211,153,0.12)",  color: "#34d399" },
  watch:    { label: "Watch",   bg: "rgba(251,191,36,0.12)",  color: "#fbbf24" },
  "at-risk":{ label: "At Risk", bg: "rgba(248,113,113,0.12)", color: "#f87171" },
};

const STATUS_CONFIG: Record<CampaignStatus, { label: string; bg: string; color: string }> = {
  active:    { label: "Active",    bg: "rgba(52,211,153,0.10)",  color: "#34d399" },
  paused:    { label: "Paused",    bg: "rgba(113,113,122,0.12)", color: "#a1a1aa" },
  completed: { label: "Completed", bg: "rgba(59,130,246,0.12)",  color: "#60a5fa" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(n: number, d: number): string {
  if (d === 0) return "0%";
  return ((n / d) * 100).toFixed(1) + "%";
}

function formatAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatNum(n: number): string {
  return n.toLocaleString("en-US");
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  hint: string;
  accent?: boolean;
}

function StatCard({ label, value, hint, accent }: StatCardProps) {
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

export default function OutreachPage() {
  const [campaigns, setCampaigns] = useState<OutreachCampaign[]>([]);
  const [summary, setSummary] = useState<OutreachSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | "all">("all");

  useEffect(() => {
    // TODO: fetch("/api/outreach") — pull from SmartLead, Instantly, or Airtable
    const timer = setTimeout(() => {
      setCampaigns(MOCK_CAMPAIGNS);
      setSummary(MOCK_SUMMARY);
      setLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  const filtered =
    statusFilter === "all" ? campaigns : campaigns.filter((c) => c.status === statusFilter);

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
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-2">
            Revenue
          </p>
          <h1 className="text-3xl font-light text-zinc-100">Outreach</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Cold-email and DM campaigns — sent, opened, replied, and meetings booked.
          </p>
        </div>

        {/* Summary stats */}
        {summary && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Meetings Booked"
              value={String(summary.meetingsBooked)}
              hint={`${summary.activeCampaigns} active campaigns`}
              accent
            />
            <StatCard
              label="Total Sent"
              value={formatNum(summary.totalSent)}
              hint={`${formatNum(summary.totalOpened)} opened`}
            />
            <StatCard
              label="Open Rate"
              value={summary.openRate + "%"}
              hint={`${summary.totalOpened.toLocaleString()} total opens`}
            />
            <StatCard
              label="Reply Rate"
              value={summary.replyRate + "%"}
              hint={`${summary.positiveReplyRate}% positive replies`}
            />
          </div>
        )}

        {/* Campaign list */}
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Campaigns
            </p>
            <div className="flex gap-1.5">
              {(["all", "active", "paused", "completed"] as const).map((s) => {
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

          <div className="space-y-3">
            {filtered.map((campaign) => {
              const hc = HEALTH_CONFIG[campaign.health];
              const sc = STATUS_CONFIG[campaign.status];
              return (
                <div
                  key={campaign.id}
                  className="rounded-xl border border-white/10 bg-white/[0.02] p-5 hover:border-white/20 transition-colors"
                >
                  {/* Campaign header */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="text-sm font-medium text-zinc-100">{campaign.name}</p>
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: hc.bg, color: hc.color }}
                        >
                          {hc.label}
                        </span>
                        <span
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: sc.bg, color: sc.color }}
                        >
                          {sc.label}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500">
                        {campaign.channel} · Updated {formatAgo(campaign.updatedAt)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-light tabular-nums" style={{ color: "#34d399" }}>
                        {campaign.meetingsBooked}
                      </p>
                      <p className="text-xs text-zinc-600">meetings</p>
                    </div>
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                    {[
                      { label: "Sent",     value: formatNum(campaign.sent) },
                      { label: "Opened",   value: `${formatNum(campaign.opened)} (${pct(campaign.opened, campaign.sent)})` },
                      { label: "Replied",  value: `${formatNum(campaign.replied)} (${pct(campaign.replied, campaign.sent)})` },
                      { label: "Positive", value: formatNum(campaign.positiveReplies) },
                      { label: "Booked",   value: String(campaign.meetingsBooked) },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="rounded-lg px-3 py-2.5 bg-white/[0.03] border border-white/[0.05]"
                      >
                        <p className="text-xs text-zinc-600 uppercase tracking-widest">{stat.label}</p>
                        <p className="text-sm text-zinc-200 tabular-nums mt-0.5">{stat.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* TODO notice */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-5 py-4">
          <p className="text-xs text-zinc-500">
            <span className="font-semibold text-zinc-400">TODO:</span> Wire to{" "}
            <code className="text-emerald-400 text-[11px]">/api/outreach</code> — connect SmartLead
            or Instantly via API for live campaign stats. Fall back to Airtable if upstream is
            unavailable.
          </p>
        </div>
      </div>
    </div>
  );
}
