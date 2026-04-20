import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Check, XCircle, Send, ExternalLink } from "lucide-react";
import { useBladeStore } from "@/stores/blade-store";
import { ChannelBadge } from "./ChannelBadge";
import type { Mission } from "@/lib/api";

interface MissionResult {
  summary?: string;
  findings?: string;
  artifacts?: Array<{ name: string; url: string }>;
  confidence?: number;
  costUsd?: number;
  tokensUsed?: number;
  employeeModel?: string;
  durationMs?: number;
}

interface MissionDetailDrawerProps {
  mission: Mission | null;
  onClose: () => void;
}

function priorityLabel(p?: number) {
  if (p === undefined || p === null) return null;
  if (p >= 8) return { label: "CRITICAL", color: "#DC2626" };
  if (p >= 5) return { label: "HIGH", color: "#F59E0B" };
  if (p >= 3) return { label: "MEDIUM", color: "#3B82F6" };
  return { label: "LOW", color: "#6B7280" };
}

function statusColor(status: string) {
  switch (status) {
    case "done":
    case "completed":
      return "#10B981";
    case "live":
    case "progress":
      return "#3B82F6";
    case "failed":
      return "#DC2626";
    case "pending_review":
      return "#F59E0B";
    case "awaiting_input":
      return "#8B5CF6";
    default:
      return "#6B7280";
  }
}

function parseResult(mission: Mission): MissionResult | null {
  const raw = (mission as unknown as Record<string, unknown>).result;
  if (!raw) return null;
  if (typeof raw === "object") return raw as MissionResult;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as MissionResult;
    } catch {
      return { summary: raw };
    }
  }
  return null;
}

export function MissionDetailDrawer({ mission, onClose }: MissionDetailDrawerProps) {
  const { approveMission, rejectMission, respondToMission } = useBladeStore();
  const [rejectInput, setRejectInput] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [responseInput, setResponseInput] = useState("");
  const [busy, setBusy] = useState(false);

  const handleApprove = async () => {
    if (!mission || busy) return;
    setBusy(true);
    try {
      await approveMission(String(mission.id));
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (!mission || busy || !rejectInput.trim()) return;
    setBusy(true);
    try {
      await rejectMission(String(mission.id), rejectInput.trim());
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const handleRespond = async () => {
    if (!mission || busy || !responseInput.trim()) return;
    setBusy(true);
    try {
      await respondToMission(String(mission.id), responseInput.trim());
      setResponseInput("");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const result = mission ? parseResult(mission) : null;
  const prio = mission ? priorityLabel(mission.priority) : null;
  const missionAny = mission as unknown as Record<string, unknown>;
  const questions = mission ? missionAny.questions as string | undefined : undefined;
  const sourceChannel = mission ? missionAny.sourceChannel as string | undefined : undefined;
  const durationSec = result?.durationMs ? (result.durationMs / 1000).toFixed(1) : null;

  return (
    <AnimatePresence>
      {mission && (
        <motion.div
          initial={{ x: 480, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 480, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed right-0 top-0 z-50 flex h-screen w-[480px] flex-col border-l border-[var(--blade-border)] bg-[#0a0a0f]/95 backdrop-blur-xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--blade-border)] px-4 py-3">
            <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/60">
              mission detail
            </div>
            <button
              onClick={onClose}
              className="text-white/40 transition-colors hover:text-white/80"
            >
              <X size={16} />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {/* Title + meta row */}
            <div>
              <div className="font-mono text-sm text-white leading-snug mb-2">
                {mission.title}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {prio && (
                  <span
                    className="font-mono text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm"
                    style={{
                      color: prio.color,
                      background: `${prio.color}22`,
                      border: `1px solid ${prio.color}44`,
                    }}
                  >
                    P{mission.priority} {prio.label}
                  </span>
                )}
                {mission.assignedEmployee && (
                  <span className="font-mono text-[9px] text-white/50">
                    {mission.assignedEmployee}
                  </span>
                )}
                {durationSec && (
                  <span className="font-mono text-[9px] text-white/30">{durationSec}s</span>
                )}
                {sourceChannel && <ChannelBadge channel={sourceChannel} />}
              </div>
            </div>

            {/* Status badge */}
            <div className="flex items-center gap-2">
              <span
                className="font-mono text-[9px] uppercase tracking-wider px-2 py-1 rounded-sm"
                style={{
                  color: statusColor(mission.status),
                  background: `${statusColor(mission.status)}22`,
                  border: `1px solid ${statusColor(mission.status)}44`,
                }}
              >
                {mission.status.replace(/_/g, " ")}
              </span>
            </div>

            {/* Description */}
            {mission.description && (
              <div>
                <div className="font-mono text-[9px] uppercase tracking-wider text-white/30 mb-1">
                  Description
                </div>
                <p className="font-mono text-[11px] text-white/70 leading-relaxed">
                  {mission.description}
                </p>
              </div>
            )}

            {/* Result block */}
            {result && (
              <div className="space-y-3">
                {result.summary && (
                  <div>
                    <div className="font-mono text-[9px] uppercase tracking-wider text-white/30 mb-1">
                      Summary
                    </div>
                    <p className="font-mono text-[11px] text-white/80 leading-relaxed">
                      {result.summary}
                    </p>
                  </div>
                )}

                {result.findings && (
                  <div>
                    <div className="font-mono text-[9px] uppercase tracking-wider text-white/30 mb-1">
                      Full Findings
                    </div>
                    <div className="max-h-48 overflow-y-auto rounded border border-white/10 bg-white/5 p-3">
                      <pre className="font-mono text-[10px] text-white/70 whitespace-pre-wrap leading-relaxed">
                        {result.findings}
                      </pre>
                    </div>
                  </div>
                )}

                {result.artifacts && result.artifacts.length > 0 && (
                  <div>
                    <div className="font-mono text-[9px] uppercase tracking-wider text-white/30 mb-1">
                      Artifacts
                    </div>
                    <div className="space-y-1">
                      {result.artifacts.map((a, i) => (
                        <a
                          key={i}
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 font-mono text-[10px] text-[var(--blade-red)] hover:text-white/80 transition-colors"
                        >
                          <ExternalLink size={10} />
                          {a.name ?? a.url}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Stats row */}
                <div className="grid grid-cols-2 gap-2">
                  {result.confidence !== undefined && (
                    <div className="rounded border border-white/10 bg-white/5 p-2">
                      <div className="font-mono text-[8px] uppercase tracking-wider text-white/30">
                        Confidence
                      </div>
                      <div className="font-mono text-sm text-white/80 mt-0.5">
                        {Math.round(result.confidence * 100)}%
                      </div>
                    </div>
                  )}
                  {result.costUsd !== undefined && (
                    <div className="rounded border border-white/10 bg-white/5 p-2">
                      <div className="font-mono text-[8px] uppercase tracking-wider text-white/30">
                        Cost
                      </div>
                      <div className="font-mono text-sm text-white/80 mt-0.5">
                        ${result.costUsd.toFixed(4)}
                      </div>
                    </div>
                  )}
                  {result.tokensUsed !== undefined && (
                    <div className="rounded border border-white/10 bg-white/5 p-2">
                      <div className="font-mono text-[8px] uppercase tracking-wider text-white/30">
                        Tokens
                      </div>
                      <div className="font-mono text-sm text-white/80 mt-0.5">
                        {result.tokensUsed.toLocaleString()}
                      </div>
                    </div>
                  )}
                  {result.employeeModel && (
                    <div className="rounded border border-white/10 bg-white/5 p-2">
                      <div className="font-mono text-[8px] uppercase tracking-wider text-white/30">
                        Model
                      </div>
                      <div className="font-mono text-[10px] text-white/80 mt-0.5 truncate">
                        {result.employeeModel}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Awaiting input question box */}
            {mission.status === "awaiting_input" && questions && (
              <div className="rounded border border-[#F59E0B]/30 bg-[#F59E0B]/10 p-3">
                <div className="font-mono text-[9px] uppercase tracking-wider text-[#F59E0B]/80 mb-1">
                  Question
                </div>
                <p className="font-mono text-[11px] text-[#F59E0B] leading-relaxed mb-3">
                  {questions}
                </p>
                <div className="flex items-center gap-2 rounded border border-white/10 bg-white/5 px-3 py-2">
                  <input
                    value={responseInput}
                    onChange={(e) => setResponseInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleRespond();
                      }
                    }}
                    placeholder="Your response..."
                    className="flex-1 bg-transparent font-mono text-sm text-white outline-none placeholder:text-white/20"
                    disabled={busy}
                  />
                  <button
                    onClick={handleRespond}
                    disabled={busy || !responseInput.trim()}
                    className="text-white/40 transition-colors hover:text-[var(--blade-red)] disabled:opacity-30"
                  >
                    <Send size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Pending review actions */}
          {mission.status === "pending_review" && (
            <div className="border-t border-[var(--blade-border)] px-4 py-3 space-y-2">
              {showRejectInput ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 rounded border border-white/10 bg-white/5 px-3 py-2">
                    <input
                      value={rejectInput}
                      onChange={(e) => setRejectInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleReject();
                        }
                      }}
                      placeholder="Rejection reason..."
                      className="flex-1 bg-transparent font-mono text-sm text-white outline-none placeholder:text-white/20"
                      disabled={busy}
                      autoFocus
                    />
                    <button
                      onClick={handleReject}
                      disabled={busy || !rejectInput.trim()}
                      className="text-[#DC2626] transition-colors hover:text-white/80 disabled:opacity-30"
                    >
                      <Send size={14} />
                    </button>
                  </div>
                  <button
                    onClick={() => setShowRejectInput(false)}
                    className="w-full font-mono text-[10px] uppercase tracking-wider text-white/30 hover:text-white/60 transition-colors"
                  >
                    cancel
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={handleApprove}
                    disabled={busy}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded border border-[#10B981]/40 bg-[#10B981]/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-[#10B981] transition-colors hover:bg-[#10B981]/20 disabled:opacity-40"
                  >
                    <Check size={12} />
                    Approve
                  </button>
                  <button
                    onClick={() => setShowRejectInput(true)}
                    disabled={busy}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded border border-[#DC2626]/40 bg-[#DC2626]/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-[#DC2626] transition-colors hover:bg-[#DC2626]/20 disabled:opacity-40"
                  >
                    <XCircle size={12} />
                    Reject
                  </button>
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
