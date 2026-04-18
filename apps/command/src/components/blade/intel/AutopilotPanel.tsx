import { useEffect, useState } from "react";
import { Plus, X, Square, Ban } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/blade/Panel";
import { TickerNumber } from "@/components/blade/TickerNumber";
import { useBladeStore } from "@/stores/blade-store";
import { api } from "@/lib/api";

const STATUS_COLORS: Record<string, string> = {
  running: "#10B981",
  paused: "#D97706",
  completed: "#6B7280",
  failed: "#DC2626",
  budget_exceeded: "#DC2626",
};

export function AutopilotPanel() {
  const batches = useBladeStore((s) => s.batchRuns);
  const fetchBatches = useBladeStore((s) => s.fetchBatches);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    fetchBatches();
    const t = setInterval(fetchBatches, 5000);
    return () => clearInterval(t);
  }, [fetchBatches]);

  const action = async (id: string, a: "stop" | "cancel") => {
    try {
      await api.batchAction(id, a);
      toast.success(`Batch ${a}`);
      fetchBatches();
    } catch (e) {
      toast.error(`Failed to ${a}`, {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="blade-tracked font-mono text-sm font-bold text-white/80">AUTOPILOT BATCHES</h2>
          <p className="font-mono text-[10px] text-white/40">parallel job orchestration with budget caps</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 rounded-md border border-[var(--blade-red)] bg-[var(--blade-red)]/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-white hover:bg-[var(--blade-red)]/30"
        >
          <Plus size={12} /> new batch
        </button>
      </div>

      {batches.length === 0 ? (
        <Panel className="p-6 text-center font-mono text-xs text-white/40">— no batches running —</Panel>
      ) : (
        <div className="space-y-3">
          {batches.map((b) => {
            const sc = STATUS_COLORS[b.status] ?? "#6B7280";
            const pct = b.totalJobs > 0 ? (b.completedJobs / b.totalJobs) * 100 : 0;
            const costPct = b.maxCostUsd ? Math.min(100, (b.totalCostUsd / b.maxCostUsd) * 100) : 0;
            const canStop = b.status === "running" || b.status === "paused";
            return (
              <Panel key={b.id} className="p-4" bracketColor={sc}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-mono text-sm font-bold text-white">{b.name}</div>
                      <span
                        className="rounded-sm px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider"
                        style={{ background: `${sc}22`, color: sc, border: `1px solid ${sc}66` }}
                      >
                        {b.status}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-3 font-mono text-[10px]">
                      <div>
                        <div className="text-white/40 uppercase">progress</div>
                        <div className="text-white">
                          <TickerNumber value={b.completedJobs} /> / {b.totalJobs}
                        </div>
                      </div>
                      <div>
                        <div className="text-white/40 uppercase">cost</div>
                        <div className="text-white">
                          $<TickerNumber value={b.totalCostUsd} decimals={2} />
                          {b.maxCostUsd ? <span className="text-white/40"> / ${b.maxCostUsd.toFixed(2)}</span> : null}
                        </div>
                      </div>
                      <div>
                        <div className="text-white/40 uppercase">running</div>
                        <div className="text-white">{b.runningJobs ?? 0}</div>
                      </div>
                    </div>
                    <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/5">
                      <div className="h-full" style={{ width: `${pct}%`, background: sc, boxShadow: `0 0 6px ${sc}` }} />
                    </div>
                    {b.maxCostUsd && (
                      <div className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-white/5">
                        <div
                          className="h-full"
                          style={{
                            width: `${costPct}%`,
                            background: costPct > 80 ? "#DC2626" : "#D97706",
                          }}
                        />
                      </div>
                    )}
                  </div>
                  {canStop && (
                    <div className="flex flex-col gap-1.5">
                      <button
                        onClick={() => action(b.id, "stop")}
                        className="flex items-center gap-1 rounded-sm border border-white/10 px-2 py-1 font-mono text-[9px] uppercase text-white/60 hover:border-[var(--blade-red)] hover:text-white"
                      >
                        <Square size={10} /> stop
                      </button>
                      <button
                        onClick={() => action(b.id, "cancel")}
                        className="flex items-center gap-1 rounded-sm border border-white/10 px-2 py-1 font-mono text-[9px] uppercase text-white/60 hover:border-[var(--blade-red)] hover:text-white"
                      >
                        <Ban size={10} /> cancel
                      </button>
                    </div>
                  )}
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      {showNew && <NewBatchModal onClose={() => setShowNew(false)} onCreated={fetchBatches} />}
    </div>
  );
}

function NewBatchModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [maxConcurrent, setMaxConcurrent] = useState(2);
  const [maxCostUsd, setMaxCostUsd] = useState(5);
  const [jobsText, setJobsText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!name.trim()) return toast.error("Name required");
    const jobs = jobsText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const [title, ...rest] = line.split(" — ");
        return { title: title.trim(), description: rest.join(" — ").trim() };
      });
    if (jobs.length === 0) return toast.error("Add at least one job");
    setSubmitting(true);
    try {
      await api.createBatch({ name, maxConcurrent, maxCostUsd, jobs });
      toast.success("Batch deployed", { description: `${jobs.length} jobs queued` });
      onCreated();
      onClose();
    } catch (e) {
      toast.error("Failed to create batch", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <Panel className="w-full max-w-lg p-6" scanlines>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="blade-tracked font-mono text-lg font-bold text-white">DEPLOY BATCH</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X size={16} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="font-mono text-[9px] uppercase tracking-wider text-white/40">name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full border-0 border-b border-[var(--blade-red)]/50 bg-transparent py-1.5 font-mono text-sm text-white outline-none focus:border-[var(--blade-red)]"
              placeholder="Auth refactor batch"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-mono text-[9px] uppercase tracking-wider text-white/40">max concurrent</label>
              <input
                type="number"
                value={maxConcurrent}
                onChange={(e) => setMaxConcurrent(+e.target.value)}
                className="mt-1 w-full rounded-sm border border-white/10 bg-black/30 p-2 font-mono text-xs text-white outline-none focus:border-[var(--blade-red)]"
              />
            </div>
            <div>
              <label className="font-mono text-[9px] uppercase tracking-wider text-white/40">max cost (usd)</label>
              <input
                type="number"
                step="0.5"
                value={maxCostUsd}
                onChange={(e) => setMaxCostUsd(+e.target.value)}
                className="mt-1 w-full rounded-sm border border-white/10 bg-black/30 p-2 font-mono text-xs text-white outline-none focus:border-[var(--blade-red)]"
              />
            </div>
          </div>
          <div>
            <label className="font-mono text-[9px] uppercase tracking-wider text-white/40">
              jobs (one per line — "title — description")
            </label>
            <textarea
              value={jobsText}
              onChange={(e) => setJobsText(e.target.value)}
              rows={6}
              className="mt-1 w-full rounded-sm border border-white/10 bg-black/30 p-2 font-mono text-xs text-white outline-none focus:border-[var(--blade-red)]"
              placeholder={"Refactor login — Move to OAuth2\nAdd MFA — TOTP support"}
            />
          </div>
          <button
            disabled={submitting}
            onClick={submit}
            className="w-full rounded-md border border-[var(--blade-red)] bg-[var(--blade-red)]/20 py-3 font-mono text-sm font-bold uppercase tracking-[0.2em] text-white hover:bg-[var(--blade-red)]/40 disabled:opacity-50"
          >
            {submitting ? "▸ deploying..." : "▸ deploy batch"}
          </button>
        </div>
      </Panel>
    </div>
  );
}
