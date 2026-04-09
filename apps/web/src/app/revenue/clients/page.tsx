"use client";

import { useState, useEffect, useMemo } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ClientStatus = "active" | "at-risk" | "churned" | "paused";
type ClientTier = "agency" | "coaching" | "retainer";

interface Client {
  id: string;
  name: string;
  company: string;
  tier: ClientTier;
  mrr: number;
  status: ClientStatus;
  healthScore: number; // 0–100
  startDate: string;
  lastActivity: string;
  notes: string;
}

// ─── Mock data (TODO: fetch("/api/revenue") and use clients array) ─────────────

const MOCK_CLIENTS: Client[] = [
  { id: "c1",  name: "Dana Lee",       company: "Lee Wellness",          tier: "agency",   mrr: 3500, status: "active",   healthScore: 91, startDate: "2023-06-01", lastActivity: new Date(Date.now() - 1  * 86400000).toISOString(), notes: "Expanding to second location." },
  { id: "c2",  name: "Priya Sharma",   company: "FitLife Studios",       tier: "coaching", mrr: 2800, status: "active",   healthScore: 87, startDate: "2023-09-15", lastActivity: new Date(Date.now() - 3  * 86400000).toISOString(), notes: "Strong content performance." },
  { id: "c3",  name: "Alex Kim",       company: "Kim Body Studio",       tier: "agency",   mrr: 5200, status: "active",   healthScore: 78, startDate: "2022-11-01", lastActivity: new Date(Date.now() - 2  * 86400000).toISOString(), notes: "Renewal coming up in 60 days." },
  { id: "c4",  name: "Morgan Blake",   company: "Blake Fitness",         tier: "retainer", mrr: 1800, status: "at-risk",  healthScore: 41, startDate: "2024-01-10", lastActivity: new Date(Date.now() - 12 * 86400000).toISOString(), notes: "Missed last two check-ins." },
  { id: "c5",  name: "Taylor Grant",   company: "Grant Method",          tier: "coaching", mrr: 3200, status: "active",   healthScore: 95, startDate: "2023-03-20", lastActivity: new Date(Date.now() - 1  * 86400000).toISOString(), notes: "Top performer. Upsell opportunity." },
  { id: "c6",  name: "Jordan Cole",    company: "Cole Performance",      tier: "agency",   mrr: 4100, status: "active",   healthScore: 82, startDate: "2023-07-05", lastActivity: new Date(Date.now() - 5  * 86400000).toISOString(), notes: "Satisfied with results." },
  { id: "c7",  name: "Sam Rivera",     company: "Rivera Health",         tier: "retainer", mrr: 2200, status: "at-risk",  healthScore: 35, startDate: "2023-12-01", lastActivity: new Date(Date.now() - 18 * 86400000).toISOString(), notes: "Hasn't responded in 2 weeks." },
  { id: "c8",  name: "Chris Patel",    company: "Patel Training",        tier: "coaching", mrr: 1500, status: "paused",   healthScore: 60, startDate: "2024-02-14", lastActivity: new Date(Date.now() - 30 * 86400000).toISOString(), notes: "Paused for 3 months." },
  { id: "c9",  name: "Riley Johnson",  company: "Johnson Athletics",     tier: "agency",   mrr: 6000, status: "active",   healthScore: 88, startDate: "2022-08-20", lastActivity: new Date(Date.now() - 2  * 86400000).toISOString(), notes: "Long-term client, very stable." },
  { id: "c10", name: "Avery Chen",     company: "Chen Performance",      tier: "retainer", mrr: 0,    status: "churned",  healthScore: 0,  startDate: "2023-04-01", lastActivity: new Date(Date.now() - 60 * 86400000).toISOString(), notes: "Churned — pricing objection." },
];

const STATUS_CONFIG: Record<ClientStatus, { label: string; bg: string; color: string; dot: string }> = {
  "active":   { label: "Active",   bg: "rgba(52,211,153,0.12)",  color: "#34d399", dot: "#34d399" },
  "at-risk":  { label: "At Risk",  bg: "rgba(251,191,36,0.12)",  color: "#fbbf24", dot: "#fbbf24" },
  "churned":  { label: "Churned",  bg: "rgba(248,113,113,0.12)", color: "#f87171", dot: "#f87171" },
  "paused":   { label: "Paused",   bg: "rgba(113,113,122,0.12)", color: "#a1a1aa", dot: "#a1a1aa" },
};

const TIER_CONFIG: Record<ClientTier, { label: string; bg: string; color: string }> = {
  agency:   { label: "Agency",   bg: "rgba(99,102,241,0.12)",  color: "#818cf8" },
  coaching: { label: "Coaching", bg: "rgba(59,130,246,0.12)",  color: "#60a5fa" },
  retainer: { label: "Retainer", bg: "rgba(139,92,246,0.12)",  color: "#a78bfa" },
};

const ALL_STATUSES: ClientStatus[] = ["active", "at-risk", "churned", "paused"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return "$" + n.toLocaleString("en-US");
}

function formatAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

function healthColor(score: number): string {
  if (score >= 75) return "#34d399";
  if (score >= 50) return "#fbbf24";
  return "#f87171";
}


function monthsActive(startDate: string): number {
  const start = new Date(startDate);
  const now = new Date();
  return Math.max(1, (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth());
}

// ─── Client Card ──────────────────────────────────────────────────────────────

function ClientCard({ client }: { client: Client }) {
  const sc = STATUS_CONFIG[client.status];
  const tc = TIER_CONFIG[client.tier];
  const ltv = client.mrr * monthsActive(client.startDate);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 flex flex-col gap-4 hover:border-white/20 transition-colors">
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-medium text-zinc-100 truncate">{client.name}</p>
          <p className="text-sm text-zinc-500 truncate">{client.company}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span
            className="text-xs font-medium px-2.5 py-1 rounded-full flex items-center gap-1.5"
            style={{ backgroundColor: sc.bg, color: sc.color }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sc.dot }} />
            {sc.label}
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ backgroundColor: tc.bg, color: tc.color }}
          >
            {tc.label}
          </span>
        </div>
      </div>

      {/* MRR + health */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <p className="text-xs text-zinc-600 uppercase tracking-widest">MRR</p>
          <p className="text-xl font-light text-zinc-100 tabular-nums mt-0.5">
            {client.mrr > 0 ? fmt(client.mrr) : "—"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-zinc-600 uppercase tracking-widest">Health</p>
          <div className="flex items-center gap-2 mt-0.5">
            <div className="w-20 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: `${client.healthScore}%`,
                  backgroundColor: healthColor(client.healthScore),
                }}
              />
            </div>
            <span
              className="text-sm font-semibold tabular-nums"
              style={{ color: healthColor(client.healthScore) }}
            >
              {client.healthScore}
            </span>
          </div>
        </div>
      </div>

      {/* LTV + last activity */}
      <div className="flex items-center justify-between text-xs text-zinc-500 border-t border-white/[0.06] pt-3">
        <span>LTV {fmt(ltv)}</span>
        <span>Last active {formatAgo(client.lastActivity)}</span>
      </div>

      {/* Notes */}
      {client.notes && (
        <p className="text-xs text-zinc-500 italic leading-5">{client.notes}</p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<ClientStatus | "all">("all");

  useEffect(() => {
    // TODO: fetch("/api/revenue") and use data.clients
    const timer = setTimeout(() => {
      setClients(MOCK_CLIENTS);
      setLoading(false);
    }, 350);
    return () => clearTimeout(timer);
  }, []);

  const filtered = useMemo(
    () => clients.filter((c) => statusFilter === "all" || c.status === statusFilter),
    [clients, statusFilter]
  );

  const totalMrr = clients
    .filter((c) => c.status === "active")
    .reduce((s, c) => s + c.mrr, 0);

  const atRiskMrr = clients
    .filter((c) => c.status === "at-risk")
    .reduce((s, c) => s + c.mrr, 0);

  if (loading) {
    return (
      <div className="min-h-screen p-6">
        <div className="mx-auto max-w-6xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-white/10 bg-white/[0.03] h-52 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-2">
              Revenue
            </p>
            <h1 className="text-3xl font-light text-zinc-100">Clients</h1>
            <p className="mt-1 text-sm text-zinc-400">
              {clients.filter((c) => c.status === "active").length} active —{" "}
              {clients.filter((c) => c.status === "at-risk").length} at risk
            </p>
          </div>
          <div className="flex gap-6 text-right">
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-widest">Active MRR</p>
              <p className="text-xl font-light tabular-nums mt-0.5" style={{ color: "#34d399" }}>
                {fmt(totalMrr)}
              </p>
            </div>
            {atRiskMrr > 0 && (
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-widest">At-Risk MRR</p>
                <p className="text-xl font-light tabular-nums mt-0.5" style={{ color: "#fbbf24" }}>
                  {fmt(atRiskMrr)}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Status filters */}
        <div className="flex gap-2 flex-wrap">
          {(["all", ...ALL_STATUSES] as const).map((s) => {
            const active = statusFilter === s;
            const cfg = s !== "all" ? STATUS_CONFIG[s] : null;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className="px-3 py-2 rounded-xl text-xs font-medium border transition-colors"
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

        {/* Client grid */}
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] py-16 text-center">
            <p className="text-zinc-500 text-sm">No clients in this view.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((client) => (
              <ClientCard key={client.id} client={client} />
            ))}
          </div>
        )}

        {/* TODO notice */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-5 py-4">
          <p className="text-xs text-zinc-500">
            <span className="font-semibold text-zinc-400">TODO:</span> Wire to{" "}
            <code className="text-emerald-400 text-[11px]">/api/revenue</code> — use the{" "}
            <code className="text-emerald-400 text-[11px]">clients</code> array. Health score
            should factor in last contact date, payment status, and engagement signals.
          </p>
        </div>
      </div>
    </div>
  );
}
