"use client";

import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type DealStage = "new-lead" | "qualified" | "proposal" | "negotiation" | "won" | "lost";

interface Deal {
  id: string;
  contact: string;
  company: string;
  value: number;
  stage: DealStage;
  daysInStage: number;
  source: string;
  avatarInitials: string;
}

// ─── Mock data (TODO: wire to GHL pipeline API at /api/revenue/pipeline) ─────

const INITIAL_DEALS: Deal[] = [
  { id: "d1", contact: "Marcus Webb", company: "Webb Fitness Co.", value: 3500, stage: "new-lead", daysInStage: 2, source: "Cold Email", avatarInitials: "MW" },
  { id: "d2", contact: "Priya Sharma", company: "FitLife Studios", value: 5000, stage: "new-lead", daysInStage: 1, source: "Referral", avatarInitials: "PS" },
  { id: "d3", contact: "Jordan Cole", company: "Cole Performance", value: 2800, stage: "qualified", daysInStage: 4, source: "DM", avatarInitials: "JC" },
  { id: "d4", contact: "Nina Torres", company: "Torres Athletics", value: 4200, stage: "qualified", daysInStage: 7, source: "Cold Email", avatarInitials: "NT" },
  { id: "d5", contact: "Alex Kim", company: "Kim Body Studio", value: 6000, stage: "proposal", daysInStage: 3, source: "Webinar", avatarInitials: "AK" },
  { id: "d6", contact: "Sam Rivera", company: "Rivera Health", value: 3200, stage: "proposal", daysInStage: 9, source: "Cold Email", avatarInitials: "SR" },
  { id: "d7", contact: "Dana Lee", company: "Lee Wellness", value: 7500, stage: "negotiation", daysInStage: 5, source: "Referral", avatarInitials: "DL" },
  { id: "d8", contact: "Chris Patel", company: "Patel Training", value: 4800, stage: "negotiation", daysInStage: 12, source: "DM", avatarInitials: "CP" },
  { id: "d9", contact: "Morgan Blake", company: "Blake Fitness", value: 5500, stage: "won", daysInStage: 0, source: "Cold Email", avatarInitials: "MB" },
  { id: "d10", contact: "Taylor Grant", company: "Grant Method", value: 3000, stage: "lost", daysInStage: 0, source: "Referral", avatarInitials: "TG" },
];

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGES: { id: DealStage; label: string; color: string; accent: string }[] = [
  { id: "new-lead",    label: "New Lead",    color: "#6366f1", accent: "rgba(99,102,241,0.12)" },
  { id: "qualified",   label: "Qualified",   color: "#3b82f6", accent: "rgba(59,130,246,0.12)" },
  { id: "proposal",    label: "Proposal",    color: "#8b5cf6", accent: "rgba(139,92,246,0.12)" },
  { id: "negotiation", label: "Negotiation", color: "#f59e0b", accent: "rgba(245,158,11,0.12)" },
  { id: "won",         label: "Won",         color: "#34d399", accent: "rgba(52,211,153,0.12)" },
  { id: "lost",        label: "Lost",        color: "#f87171", accent: "rgba(248,113,113,0.12)" },
];

function fmt(n: number): string {
  return "$" + n.toLocaleString("en-US");
}

function stageLabel(daysInStage: number): { text: string; urgent: boolean } {
  if (daysInStage === 0) return { text: "Just moved", urgent: false };
  if (daysInStage <= 3) return { text: `${daysInStage}d in stage`, urgent: false };
  if (daysInStage <= 7) return { text: `${daysInStage}d in stage`, urgent: false };
  return { text: `${daysInStage}d — follow up`, urgent: true };
}

// ─── Deal Card ────────────────────────────────────────────────────────────────

interface DealCardProps {
  deal: Deal;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onMoveToStage: (id: string, stage: DealStage) => void;
}

function DealCard({ deal, onDragStart, onMoveToStage }: DealCardProps) {
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const { text: stageText, urgent } = stageLabel(deal.daysInStage);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, deal.id)}
      className="rounded-xl border border-white/10 bg-zinc-900 p-3 cursor-grab active:cursor-grabbing select-none hover:border-white/20 transition-colors relative"
    >
      <div className="flex items-start gap-2.5">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5"
          style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "#f4f4f5" }}
        >
          {deal.avatarInitials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-100 truncate">{deal.contact}</p>
          <p className="text-xs text-zinc-500 truncate">{deal.company}</p>
        </div>
      </div>

      <div className="flex items-center justify-between mt-3">
        <span className="text-sm font-semibold text-zinc-100 tabular-nums">{fmt(deal.value)}</span>
        <span
          className="text-xs px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: urgent ? "rgba(248,113,113,0.12)" : "rgba(255,255,255,0.06)",
            color: urgent ? "#f87171" : "#71717a",
          }}
        >
          {stageText}
        </span>
      </div>

      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-zinc-600">{deal.source}</span>
        <div className="relative">
          <button
            onClick={() => setShowMoveMenu(!showMoveMenu)}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-1.5 py-0.5 rounded"
          >
            Move →
          </button>
          {showMoveMenu && (
            <div className="absolute right-0 bottom-full mb-1 z-20 rounded-xl border border-white/10 bg-zinc-900 shadow-xl overflow-hidden min-w-[140px]">
              {STAGES.filter((s) => s.id !== deal.stage).map((s) => (
                <button
                  key={s.id}
                  onClick={() => { onMoveToStage(deal.id, s.id); setShowMoveMenu(false); }}
                  className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.06] flex items-center gap-2"
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PipelinePage() {
  const [deals, setDeals] = useState<Deal[]>(INITIAL_DEALS);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<DealStage | null>(null);

  function handleDragStart(e: React.DragEvent, id: string) {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent, stageId: DealStage) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverStage(stageId);
  }

  function handleDrop(e: React.DragEvent, stageId: DealStage) {
    e.preventDefault();
    if (!draggingId) return;
    moveToStage(draggingId, stageId);
    setDraggingId(null);
    setDragOverStage(null);
  }

  function moveToStage(dealId: string, stageId: DealStage) {
    setDeals((prev) =>
      prev.map((d) =>
        d.id === dealId ? { ...d, stage: stageId, daysInStage: 0 } : d
      )
    );
  }

  const totalPipelineValue = deals
    .filter((d) => d.stage !== "won" && d.stage !== "lost")
    .reduce((s, d) => s + d.value, 0);

  const wonValue = deals.filter((d) => d.stage === "won").reduce((s, d) => s + d.value, 0);

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-2">
              Revenue
            </p>
            <h1 className="text-3xl font-light text-zinc-100">Pipeline</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Drag cards between stages to move deals through the funnel.
            </p>
          </div>
          <div className="flex gap-6 text-right">
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-widest">Pipeline</p>
              <p className="text-xl font-light text-zinc-100 tabular-nums mt-0.5">
                {fmt(totalPipelineValue)}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-widest">Won</p>
              <p className="text-xl font-light tabular-nums mt-0.5" style={{ color: "#34d399" }}>
                {fmt(wonValue)}
              </p>
            </div>
          </div>
        </div>

        {/* Kanban board */}
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {STAGES.map((stage) => {
              const stageDeals = deals.filter((d) => d.stage === stage.id);
              const stageValue = stageDeals.reduce((s, d) => s + d.value, 0);
              const isOver = dragOverStage === stage.id;

              return (
                <div
                  key={stage.id}
                  onDragOver={(e) => handleDragOver(e, stage.id)}
                  onDrop={(e) => handleDrop(e, stage.id)}
                  onDragLeave={() => setDragOverStage(null)}
                  className="flex flex-col rounded-xl border transition-colors w-64 shrink-0"
                  style={{
                    borderColor: isOver ? stage.color : "rgba(255,255,255,0.08)",
                    backgroundColor: isOver ? stage.accent : "rgba(255,255,255,0.02)",
                  }}
                >
                  {/* Column header */}
                  <div className="px-3 pt-4 pb-3 border-b border-white/[0.06]">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: stage.color }}
                        />
                        <span className="text-sm font-medium text-zinc-200">{stage.label}</span>
                      </div>
                      <span
                        className="text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: stage.accent, color: stage.color }}
                      >
                        {stageDeals.length}
                      </span>
                    </div>
                    {stageValue > 0 && (
                      <p className="text-xs text-zinc-500 pl-4 tabular-nums">{fmt(stageValue)}</p>
                    )}
                  </div>

                  {/* Cards */}
                  <div className="flex flex-col gap-2 p-3 flex-1 min-h-[120px]">
                    {stageDeals.map((deal) => (
                      <DealCard
                        key={deal.id}
                        deal={deal}
                        onDragStart={handleDragStart}
                        onMoveToStage={moveToStage}
                      />
                    ))}
                    {stageDeals.length === 0 && (
                      <div
                        className="flex-1 rounded-xl border-2 border-dashed flex items-center justify-center min-h-[80px]"
                        style={{ borderColor: "rgba(255,255,255,0.06)" }}
                      >
                        <p className="text-xs text-zinc-700">Drop here</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* TODO notice */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-5 py-4">
          <p className="text-xs text-zinc-500">
            <span className="font-semibold text-zinc-400">TODO:</span> Wire to GHL pipeline via{" "}
            <code className="text-emerald-400 text-[11px]">/api/revenue/pipeline</code> — stage
            changes should sync back to GoHighLevel via the contacts/pipeline API.
          </p>
        </div>
      </div>
    </div>
  );
}
