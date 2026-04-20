import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/blade/Panel";
import { TickerNumber } from "@/components/blade/TickerNumber";
import { useBladeStore } from "@/stores/blade-store";
import { deptColor, type Mission } from "@/lib/api";
import { MissionDetailDrawer } from "./MissionDetailDrawer";

function priorityColor(p: number) {
  if (p >= 8) return "#DC2626";
  if (p >= 6) return "#D97706";
  if (p >= 4) return "#EAB308";
  return "#10B981";
}

function statusKey(m: Mission): "queued" | "progress" | "review" | "input" | "done" | "failed" {
  const s = m.status?.toLowerCase() ?? "queued";
  if (s === "done" || s === "completed") return "done";
  if (s === "failed" || s === "error" || s === "rejected") return "failed";
  if (s === "pending_review") return "review";
  if (s === "awaiting_input") return "input";
  if (s === "queued" || s === "pending") return "queued";
  return "progress";
}

function MissionBlock({
  m, color, onClick,
}: { m: Mission; color: string; onClick: () => void }) {
  const status = statusKey(m);
  const c = color;
  const base = "relative w-44 shrink-0 cursor-pointer rounded-sm border p-2 transition-all hover:scale-[1.03]";
  const styleByStatus: Record<string, React.CSSProperties> = {
    queued:   { background: "transparent", borderColor: `${c}66`, borderStyle: "dashed" },
    progress: { background: `${c}22`, borderColor: c, boxShadow: `0 0 12px ${c}55` },
    review:   { background: "#22C55E22", borderColor: "#22C55E", boxShadow: "0 0 12px #22C55E55" },
    input:    { background: "#F59E0B22", borderColor: "#F59E0B", boxShadow: "0 0 12px #F59E0B55" },
    done:     { background: `${c}11`, borderColor: `${c}55`, opacity: 0.7 },
    failed:   { background: "rgba(0,0,0,0.4)", borderColor: "#7F1D1D" },
  };
  const priority = m.priority ?? 5;
  const progress = m.progress ?? (status === "progress" ? 50 : 0);
  return (
    <motion.div
      onClick={onClick}
      className={base}
      style={styleByStatus[status]}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="truncate font-mono text-[11px] text-white">{m.title}</div>
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: priorityColor(priority), boxShadow: `0 0 4px ${priorityColor(priority)}` }} />
      </div>
      <div className="mt-1 flex items-center justify-between font-mono text-[9px] uppercase tracking-wider text-white/50">
        <span>{m.domain ?? m.assignedEmployee ?? "—"}</span>
        <span>{status === "done" ? "✓" : status === "failed" ? "✗" : status === "progress" ? `${progress}%` : "queued"}</span>
      </div>
      {status === "progress" && progress > 0 && (
        <div className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-white/5">
          <motion.div className="h-full" style={{ background: c, boxShadow: `0 0 6px ${c}` }} initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 1 }} />
        </div>
      )}
    </motion.div>
  );
}

function CircularGauge({ value, label }: { value: number; label: string }) {
  const C = 2 * Math.PI * 22;
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-14 w-14">
        <svg viewBox="0 0 50 50" className="h-full w-full -rotate-90">
          <circle cx="25" cy="25" r="22" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
          <circle cx="25" cy="25" r="22" fill="none" stroke="#DC2626" strokeWidth="3" strokeDasharray={`${(C * value) / 100} ${C}`} strokeLinecap="round" style={{ filter: "drop-shadow(0 0 4px #DC2626)" }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center font-mono text-xs font-bold text-white">
          <TickerNumber value={value} suffix="%" />
        </div>
      </div>
      <div>
        <div className="font-mono text-[9px] uppercase tracking-wider text-white/40">{label}</div>
      </div>
    </div>
  );
}

export function MissionsPage() {
  const missions = useBladeStore((s) => s.missions);
  const employees = useBladeStore((s) => s.employees);
  const [open, setOpen] = useState<Mission | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null);
  const fetchMissions = useBladeStore((s) => s.fetchMissions);

  const lanes = useMemo(() => {
    const byEmp = new Map<string, Mission[]>();
    const unassigned: Mission[] = [];
    missions.forEach((m) => {
      if (m.assignedEmployee) {
        const arr = byEmp.get(m.assignedEmployee) ?? [];
        arr.push(m);
        byEmp.set(m.assignedEmployee, arr);
      } else {
        unassigned.push(m);
      }
    });
    const empLanes = employees.map((e) => ({
      slug: e.slug,
      name: e.name,
      title: e.title ?? e.department ?? "specialist",
      color: deptColor(e.department).color,
      missions: byEmp.get(e.slug) ?? [],
    }));
    if (unassigned.length > 0) {
      empLanes.push({
        slug: "unassigned",
        name: "Unassigned",
        title: "queue",
        color: "#6B7280",
        missions: unassigned,
      });
    }
    return empLanes;
  }, [missions, employees]);

  const active = missions.filter((m) => statusKey(m) === "progress").length;
  const total = missions.length;
  const completion = total ? Math.round((missions.filter((m) => statusKey(m) === "done").length / total) * 100) : 0;
  const queueDepth = missions.filter((m) => statusKey(m) === "queued").length;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="blade-tracked blade-text-glow font-mono text-2xl font-bold text-white">MISSIONS</h1>
          <p className="mt-1 font-mono text-xs text-white/50">Tactical operations display // active dispatches</p>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-2 rounded-md border border-[var(--blade-red)] bg-[var(--blade-red)]/10 px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-white transition-all hover:bg-[var(--blade-red)]/30 blade-glow">
          <Plus size={14} /> new mission
        </button>
      </div>

      {/* HUD gauges */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Panel className="p-4">
          <div className="font-mono text-[9px] uppercase tracking-wider text-white/40">total active</div>
          <div className="font-mono text-3xl text-white blade-text-glow"><TickerNumber value={active} /></div>
        </Panel>
        <Panel className="p-4"><CircularGauge value={completion} label="completion rate" /></Panel>
        <Panel className="p-4">
          <div className="font-mono text-[9px] uppercase tracking-wider text-white/40">total missions</div>
          <div className="font-mono text-3xl text-white blade-text-glow"><TickerNumber value={total} /></div>
        </Panel>
        <Panel className="p-4">
          <div className="font-mono text-[9px] uppercase tracking-wider text-white/40">queue depth</div>
          <div className="font-mono text-3xl text-white blade-text-glow"><TickerNumber value={queueDepth} /></div>
        </Panel>
      </div>

      {/* Lanes */}
      <Panel className="p-4">
        <div className="space-y-4">
          {lanes.length === 0 && <div className="font-mono text-xs text-white/40">— no missions yet —</div>}
          {lanes.map((lane) => (
            <div key={lane.slug} className="flex items-center gap-4">
              <div className="w-28 shrink-0 border-r border-white/10 pr-3">
                <div className="font-mono text-xs font-bold uppercase tracking-wider" style={{ color: lane.color }}>{lane.name}</div>
                <div className="font-mono text-[9px] uppercase text-white/40">{lane.title}</div>
                <div className="mt-1 font-mono text-[10px] text-white/50">{lane.missions.length} missions</div>
              </div>
              <div className="flex flex-1 gap-2 overflow-x-auto pb-1">
                {lane.missions.length === 0 ? (
                  <div className="font-mono text-[10px] uppercase text-white/20">— no active missions —</div>
                ) : (
                  lane.missions.map((m) => (
                    <MissionBlock key={m.id} m={m} color={lane.color} onClick={() => setSelectedMission(m)} />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {/* Detail slide-over */}
      {open && (
        <motion.div
          initial={{ x: 400, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 400, opacity: 0 }}
          className="fixed right-4 top-20 bottom-4 z-40 w-96"
        >
          <Panel className="h-full p-5" bracketColor="#DC2626">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-mono text-[9px] uppercase tracking-wider text-white/40">mission // #{String(open.id).padStart(4, "0")}</div>
                <h3 className="mt-1 font-mono text-lg text-white">{open.title}</h3>
              </div>
              <button onClick={() => setOpen(null)} className="text-white/40 hover:text-white"><X size={16} /></button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <div className="font-mono text-[9px] uppercase text-white/40">assignee</div>
                <div className="font-mono text-sm text-white">{open.assignedEmployee ?? "auto"}</div>
              </div>
              <div>
                <div className="font-mono text-[9px] uppercase text-white/40">priority</div>
                <div className="font-mono text-sm" style={{ color: priorityColor(open.priority ?? 5) }}>{open.priority ?? 5}/10</div>
              </div>
              <div>
                <div className="font-mono text-[9px] uppercase text-white/40">status</div>
                <div className="font-mono text-sm uppercase text-white">{open.status}</div>
              </div>
              <div>
                <div className="font-mono text-[9px] uppercase text-white/40">domain</div>
                <div className="font-mono text-sm text-white">{open.domain ?? "—"}</div>
              </div>
            </div>
            {open.description && (
              <div className="mt-5">
                <div className="font-mono text-[9px] uppercase text-white/40">briefing</div>
                <p className="mt-1 font-mono text-xs leading-relaxed text-white/70">{open.description}</p>
              </div>
            )}
          </Panel>
        </motion.div>
      )}

      <MissionDetailDrawer
        mission={selectedMission}
        onClose={() => { setSelectedMission(null); fetchMissions(); }}
      />
      {showNew && <NewMissionModal onClose={() => setShowNew(false)} />}
    </div>
  );
}

function NewMissionModal({ onClose }: { onClose: () => void }) {
  const createMission = useBladeStore((s) => s.createMission);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState(5);
  const [submitting, setSubmitting] = useState(false);

  // Refresh employees in case the user wants to see them later (no-op here).
  useEffect(() => {}, []);

  const submit = async () => {
    if (!title.trim()) {
      toast.error("Title required");
      return;
    }
    setSubmitting(true);
    try {
      await createMission(title, description, priority);
      toast.success("Mission deployed", { description: title });
      onClose();
    } catch (e) {
      toast.error("Failed to deploy mission", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <Panel className="w-full max-w-lg p-6" scanlines>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="blade-tracked font-mono text-lg font-bold text-white">DEPLOY NEW MISSION</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X size={16} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="font-mono text-[9px] uppercase tracking-wider text-white/40">title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full border-0 border-b border-[var(--blade-red)]/50 bg-transparent py-1.5 font-mono text-sm text-white outline-none focus:border-[var(--blade-red)]"
              placeholder="Mission objective..."
            />
          </div>
          <div>
            <label className="font-mono text-[9px] uppercase tracking-wider text-white/40">briefing</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-sm border border-white/10 bg-black/30 p-2 font-mono text-xs text-white outline-none focus:border-[var(--blade-red)]"
              placeholder="Context, constraints, success criteria..."
            />
          </div>
          <div>
            <label className="flex items-center justify-between font-mono text-[9px] uppercase tracking-wider text-white/40">
              <span>priority</span>
              <span className="font-mono text-sm" style={{ color: priorityColor(priority) }}>{priority}/10</span>
            </label>
            <input type="range" min={1} max={10} value={priority} onChange={(e) => setPriority(+e.target.value)} className="mt-2 w-full accent-[var(--blade-red)]" />
          </div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-white/40">
            assignee · auto-routed by Q-learning router
          </div>
          <button
            disabled={submitting}
            onClick={submit}
            className="w-full rounded-md border border-[var(--blade-red)] bg-[var(--blade-red)]/20 py-3 font-mono text-sm font-bold uppercase tracking-[0.2em] text-white transition-all hover:bg-[var(--blade-red)]/40 blade-glow disabled:opacity-50"
          >
            {submitting ? "▸ deploying..." : "▸ deploy"}
          </button>
        </div>
      </Panel>
    </motion.div>
  );
}
