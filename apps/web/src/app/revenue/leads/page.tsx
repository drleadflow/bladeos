"use client";

import { useState, useEffect, useMemo } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type LeadStatus = "new" | "contacted" | "qualified" | "booked" | "won" | "lost";
type LeadSource = "Cold Email" | "DM" | "Referral" | "Webinar" | "Organic" | "Paid Ad";

interface Lead {
  id: string;
  name: string;
  company: string;
  email: string;
  source: LeadSource;
  status: LeadStatus;
  value: number;
  lastContact: string;
  assignedTo: string;
}

// ─── Mock data (TODO: fetch("/api/revenue/leads") → GHL contacts with tag-mapped status) ─

const MOCK_LEADS: Lead[] = [
  { id: "l1",  name: "Marcus Webb",    company: "Webb Fitness Co.",      email: "marcus@webbfitness.com",      source: "Cold Email", status: "new",       value: 3500, lastContact: new Date(Date.now() - 1     * 86400000).toISOString(), assignedTo: "Closer AI" },
  { id: "l2",  name: "Priya Sharma",   company: "FitLife Studios",       email: "priya@fitlife.com",           source: "Referral",   status: "qualified",  value: 5000, lastContact: new Date(Date.now() - 2     * 86400000).toISOString(), assignedTo: "Closer AI" },
  { id: "l3",  name: "Jordan Cole",    company: "Cole Performance",      email: "jcole@coleperf.com",          source: "DM",         status: "contacted",  value: 2800, lastContact: new Date(Date.now() - 3     * 86400000).toISOString(), assignedTo: "Closer AI" },
  { id: "l4",  name: "Nina Torres",    company: "Torres Athletics",      email: "nina@torresathletics.com",    source: "Cold Email", status: "booked",     value: 4200, lastContact: new Date(Date.now() - 1     * 86400000).toISOString(), assignedTo: "Closer AI" },
  { id: "l5",  name: "Alex Kim",       company: "Kim Body Studio",       email: "alex@kimbody.com",            source: "Webinar",    status: "qualified",  value: 6000, lastContact: new Date(Date.now() - 5     * 86400000).toISOString(), assignedTo: "Closer AI" },
  { id: "l6",  name: "Sam Rivera",     company: "Rivera Health",         email: "sam@riverahealth.com",        source: "Cold Email", status: "contacted",  value: 3200, lastContact: new Date(Date.now() - 7     * 86400000).toISOString(), assignedTo: "Closer AI" },
  { id: "l7",  name: "Dana Lee",       company: "Lee Wellness",          email: "dana@leewellness.com",        source: "Referral",   status: "won",        value: 7500, lastContact: new Date(Date.now() - 10    * 86400000).toISOString(), assignedTo: "Closer AI" },
  { id: "l8",  name: "Chris Patel",    company: "Patel Training",        email: "chris@pateltraining.com",     source: "DM",         status: "new",        value: 4800, lastContact: new Date(Date.now() - 0.5   * 86400000).toISOString(), assignedTo: "Closer AI" },
  { id: "l9",  name: "Morgan Blake",   company: "Blake Fitness",         email: "morgan@blakefitness.com",     source: "Paid Ad",    status: "lost",       value: 3000, lastContact: new Date(Date.now() - 14    * 86400000).toISOString(), assignedTo: "Closer AI" },
  { id: "l10", name: "Taylor Grant",   company: "Grant Method",          email: "taylor@grantmethod.com",      source: "Organic",    status: "qualified",  value: 5500, lastContact: new Date(Date.now() - 4     * 86400000).toISOString(), assignedTo: "Closer AI" },
  { id: "l11", name: "Riley Johnson",  company: "Johnson Athletics",     email: "riley@johnsonathletics.com",  source: "Cold Email", status: "new",        value: 2500, lastContact: new Date(Date.now() - 0.2   * 86400000).toISOString(), assignedTo: "Closer AI" },
  { id: "l12", name: "Avery Chen",     company: "Chen Performance",      email: "avery@chenperf.com",          source: "Webinar",    status: "booked",     value: 6800, lastContact: new Date(Date.now() - 1.5   * 86400000).toISOString(), assignedTo: "Closer AI" },
];

const STATUS_CONFIG: Record<LeadStatus, { label: string; bg: string; color: string }> = {
  new:       { label: "New",       bg: "rgba(99,102,241,0.12)",  color: "#818cf8" },
  contacted: { label: "Contacted", bg: "rgba(59,130,246,0.12)",  color: "#60a5fa" },
  qualified: { label: "Qualified", bg: "rgba(139,92,246,0.12)",  color: "#a78bfa" },
  booked:    { label: "Booked",    bg: "rgba(245,158,11,0.12)",  color: "#fbbf24" },
  won:       { label: "Won",       bg: "rgba(52,211,153,0.12)",  color: "#34d399" },
  lost:      { label: "Lost",      bg: "rgba(248,113,113,0.12)", color: "#f87171" },
};

const ALL_STATUSES: LeadStatus[] = ["new", "contacted", "qualified", "booked", "won", "lost"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return "$" + n.toLocaleString("en-US");
}

function formatAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

function isStale(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() > 5 * 86400000;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  useEffect(() => {
    // TODO: Replace with real fetch("/api/revenue/leads") pulling GHL contacts
    const timer = setTimeout(() => {
      setLeads(MOCK_LEADS);
      setLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  const sources = useMemo(
    () => Array.from(new Set(leads.map((l) => l.source))),
    [leads]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return leads.filter((l) => {
      const matchSearch =
        !q ||
        l.name.toLowerCase().includes(q) ||
        l.company.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q);
      const matchStatus = statusFilter === "all" || l.status === statusFilter;
      const matchSource = sourceFilter === "all" || l.source === sourceFilter;
      return matchSearch && matchStatus && matchSource;
    });
  }, [leads, search, statusFilter, sourceFilter]);

  const totalValue = filtered.reduce((s, l) => s + l.value, 0);

  if (loading) {
    return (
      <div className="min-h-screen p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <div className="h-10 w-48 rounded-xl bg-white/[0.04] animate-pulse" />
          <div className="h-12 rounded-xl bg-white/[0.04] animate-pulse" />
          <div className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 border-b border-white/[0.05] animate-pulse bg-white/[0.02]" />
            ))}
          </div>
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
            <h1 className="text-3xl font-light text-zinc-100">Leads OS</h1>
            <p className="mt-1 text-sm text-zinc-400">
              {leads.length} total leads — search, filter, and take action.
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-zinc-500 uppercase tracking-widest">Filtered Value</p>
            <p className="text-xl font-light text-zinc-100 tabular-nums mt-0.5">{fmt(totalValue)}</p>
            <p className="text-xs text-zinc-600 mt-0.5">{filtered.length} leads shown</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="Search name, company, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50 min-w-[220px]"
          />

          <div className="flex gap-1.5 flex-wrap">
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

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-emerald-500/50"
          >
            <option value="all">All sources</option>
            {sources.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1.6fr_120px_110px_90px_100px_70px] px-4 py-3 border-b border-white/[0.06]">
            {["Lead", "Source", "Status", "Value", "Last Contact", ""].map((h) => (
              <p key={h} className="text-xs font-semibold uppercase tracking-widest text-zinc-600">{h}</p>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-zinc-500 text-sm">No leads match your filters.</p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {filtered.map((lead) => {
                const sc = STATUS_CONFIG[lead.status];
                const stale = isStale(lead.lastContact);
                return (
                  <div
                    key={lead.id}
                    className="grid grid-cols-[1.6fr_120px_110px_90px_100px_70px] px-4 py-3.5 items-center hover:bg-white/[0.03] transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-100 truncate">{lead.name}</p>
                      <p className="text-xs text-zinc-500 truncate">{lead.company}</p>
                    </div>

                    <p className="text-xs text-zinc-400">{lead.source}</p>

                    <div>
                      <span
                        className="text-xs font-medium px-2.5 py-1 rounded-full"
                        style={{ backgroundColor: sc.bg, color: sc.color }}
                      >
                        {sc.label}
                      </span>
                    </div>

                    <p className="text-sm text-zinc-200 tabular-nums font-medium">{fmt(lead.value)}</p>

                    <p className="text-xs" style={{ color: stale ? "#f87171" : "#71717a" }}>
                      {formatAgo(lead.lastContact)}
                    </p>

                    <button
                      className="text-xs px-2.5 py-1 rounded-lg border border-white/10 text-zinc-400 hover:text-zinc-100 hover:border-white/20 transition-colors"
                      title="View in GHL"
                    >
                      View
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* TODO notice */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-5 py-4">
          <p className="text-xs text-zinc-500">
            <span className="font-semibold text-zinc-400">TODO:</span> Fetch from{" "}
            <code className="text-emerald-400 text-[11px]">/api/revenue/leads</code> — pull GHL
            contacts and map tags to lead status. View action should open the GHL contact detail.
          </p>
        </div>
      </div>
    </div>
  );
}
