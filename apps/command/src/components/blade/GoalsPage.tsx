import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Plus, X, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/blade/Panel";
import { TickerNumber } from "@/components/blade/TickerNumber";
import { useBladeStore } from "@/stores/blade-store";
import { api, type GoalProgress } from "@/lib/api";

function priorityColor(p?: string) {
  if (p === "critical") return "#DC2626";
  if (p === "high") return "#D97706";
  if (p === "medium") return "#EAB308";
  return "#6B7280";
}

function priorityLabel(p?: string) {
  return (p ?? "low").toUpperCase();
}

function progressPercent(g: GoalProgress) {
  if (!g.targetValue || g.targetValue === 0) return 0;
  return Math.min(100, Math.round(((g.currentValue ?? 0) / g.targetValue) * 100));
}

function GoalCard({ goal, onRefresh }: { goal: GoalProgress; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const pct = progressPercent(goal);
  const pc = priorityColor(goal.priority);
  const onTrack = goal.onTrack ?? true;

  return (
    <Panel className="p-4 cursor-pointer" onClick={() => setExpanded((v) => !v)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-mono text-sm font-bold text-white truncate">{goal.title}</div>
          {goal.category && (
            <span className="mt-1 inline-block font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-white/5 text-white/50">
              {goal.category}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm"
            style={{ background: `${pc}22`, color: pc, border: `1px solid ${pc}55` }}
          >
            {priorityLabel(goal.priority)}
          </span>
          <span
            className="h-2 w-2 rounded-full shrink-0"
            style={{ background: onTrack ? "#10B981" : "#DC2626", boxShadow: `0 0 6px ${onTrack ? "#10B981" : "#DC2626"}` }}
            title={onTrack ? "On track" : "Behind pace"}
          />
          {expanded ? <ChevronUp size={12} className="text-white/40" /> : <ChevronDown size={12} className="text-white/40" />}
        </div>
      </div>

      {/* progress bar */}
      <div className="mt-3">
        <div className="flex items-center justify-between mb-1">
          <span className="font-mono text-[9px] uppercase tracking-wider text-white/40">
            {goal.currentValue ?? 0} / {goal.targetValue ?? 0} {goal.metricUnit ?? goal.metricName ?? ""}
          </span>
          <span className="font-mono text-[10px] text-white/60">{pct}%</span>
        </div>
        <div className="h-1 w-full rounded-full bg-white/5 overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ background: pc, boxShadow: `0 0 8px ${pc}` }}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 1 }}
          />
        </div>
      </div>

      {goal.deadline && (
        <div className="mt-2 font-mono text-[9px] text-white/30">
          deadline: {new Date(goal.deadline).toLocaleDateString()}
        </div>
      )}

      {goal.assignedAgents && goal.assignedAgents.length > 0 && (
        <div className="mt-2 flex gap-1 flex-wrap">
          {goal.assignedAgents.map((a) => (
            <span key={a} className="font-mono text-[8px] uppercase tracking-wider px-1 py-0.5 rounded-sm bg-[var(--blade-red)]/10 text-[var(--blade-red)]/70 border border-[var(--blade-red)]/20">
              {a}
            </span>
          ))}
        </div>
      )}

      {expanded && goal.updates && goal.updates.length > 0 && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          className="mt-3 border-t border-white/10 pt-3 space-y-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="font-mono text-[9px] uppercase tracking-wider text-white/40 mb-2">recent updates</div>
          {goal.updates.map((u, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="font-mono text-[8px] text-white/30 shrink-0 mt-0.5">
                {new Date(u.createdAt).toLocaleDateString()}
              </span>
              <span className="font-mono text-[10px] text-white/60">{u.text}</span>
            </div>
          ))}
        </motion.div>
      )}
    </Panel>
  );
}

function NewGoalModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [metricName, setMetricName] = useState("");
  const [metricUnit, setMetricUnit] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [priority, setPriority] = useState("medium");
  const [deadline, setDeadline] = useState("");
  const [agents, setAgents] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!title.trim()) {
      toast.error("Title required");
      return;
    }
    setSubmitting(true);
    try {
      await api.createGoal({
        title: title.trim(),
        description: description.trim() || undefined,
        category: category.trim() || undefined,
        metricName: metricName.trim() || undefined,
        metricUnit: metricUnit.trim() || undefined,
        targetValue: targetValue ? Number(targetValue) : undefined,
        priority,
        deadline: deadline || undefined,
        assignedAgents: agents ? agents.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      });
      toast.success("Goal created", { description: title });
      onCreated();
      onClose();
    } catch (e) {
      toast.error("Failed to create goal", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = "mt-1 w-full border-0 border-b border-[var(--blade-red)]/50 bg-transparent py-1.5 font-mono text-sm text-white outline-none focus:border-[var(--blade-red)]";
  const labelCls = "font-mono text-[9px] uppercase tracking-wider text-white/40";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <Panel className="w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" scanlines>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="blade-tracked font-mono text-lg font-bold text-white">NEW STRATEGIC GOAL</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X size={16} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className={labelCls}>title *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="Goal objective..." />
          </div>
          <div>
            <label className={labelCls}>description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="mt-1 w-full rounded-sm border border-white/10 bg-black/30 p-2 font-mono text-xs text-white outline-none focus:border-[var(--blade-red)]" placeholder="Context and success criteria..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>category</label>
              <input value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls} placeholder="sales, ops..." />
            </div>
            <div>
              <label className={labelCls}>priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} className="mt-1 w-full border-0 border-b border-[var(--blade-red)]/50 bg-transparent py-1.5 font-mono text-sm text-white outline-none focus:border-[var(--blade-red)]">
                <option value="critical" className="bg-black">critical</option>
                <option value="high" className="bg-black">high</option>
                <option value="medium" className="bg-black">medium</option>
                <option value="low" className="bg-black">low</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>metric name</label>
              <input value={metricName} onChange={(e) => setMetricName(e.target.value)} className={inputCls} placeholder="leads..." />
            </div>
            <div>
              <label className={labelCls}>unit</label>
              <input value={metricUnit} onChange={(e) => setMetricUnit(e.target.value)} className={inputCls} placeholder="leads, $, %" />
            </div>
            <div>
              <label className={labelCls}>target</label>
              <input type="number" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} className={inputCls} placeholder="100" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>deadline</label>
              <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>agents (comma-separated)</label>
              <input value={agents} onChange={(e) => setAgents(e.target.value)} className={inputCls} placeholder="nova, echo..." />
            </div>
          </div>
          <button
            disabled={submitting}
            onClick={submit}
            className="w-full rounded-md border border-[var(--blade-red)] bg-[var(--blade-red)]/20 py-3 font-mono text-sm font-bold uppercase tracking-[0.2em] text-white transition-all hover:bg-[var(--blade-red)]/40 blade-glow disabled:opacity-50"
          >
            {submitting ? "▸ creating..." : "▸ create goal"}
          </button>
        </div>
      </Panel>
    </motion.div>
  );
}

export function GoalsPage() {
  const goals = useBladeStore((s) => s.goals);
  const fetchGoals = useBladeStore((s) => s.fetchGoals);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    void fetchGoals();
  }, [fetchGoals]);

  const active = goals.filter((g) => (g.currentValue ?? 0) < (g.targetValue ?? 1)).length;
  const completed = goals.filter((g) => (g.currentValue ?? 0) >= (g.targetValue ?? 1)).length;
  const onTrackCount = goals.filter((g) => g.onTrack !== false).length;
  const onTrackPct = goals.length ? Math.round((onTrackCount / goals.length) * 100) : 0;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="blade-tracked blade-text-glow font-mono text-2xl font-bold text-white">GOALS</h1>
          <p className="mt-1 font-mono text-xs text-white/50">Strategic objectives // business outcomes</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 rounded-md border border-[var(--blade-red)] bg-[var(--blade-red)]/10 px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-white transition-all hover:bg-[var(--blade-red)]/30 blade-glow"
        >
          <Plus size={14} /> new goal
        </button>
      </div>

      {/* Stats bar */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <Panel className="p-4">
          <div className="font-mono text-[9px] uppercase tracking-wider text-white/40">active goals</div>
          <div className="font-mono text-3xl text-white blade-text-glow"><TickerNumber value={active} /></div>
        </Panel>
        <Panel className="p-4">
          <div className="font-mono text-[9px] uppercase tracking-wider text-white/40">completed</div>
          <div className="font-mono text-3xl text-white blade-text-glow"><TickerNumber value={completed} /></div>
        </Panel>
        <Panel className="p-4">
          <div className="font-mono text-[9px] uppercase tracking-wider text-white/40">on track</div>
          <div className="font-mono text-3xl text-white blade-text-glow"><TickerNumber value={onTrackPct} suffix="%" /></div>
        </Panel>
      </div>

      {/* Goals grid */}
      {goals.length === 0 ? (
        <Panel className="p-8 text-center">
          <div className="font-mono text-xs text-white/40">— no goals defined yet —</div>
          <div className="mt-2 font-mono text-[10px] text-white/25">create your first strategic objective above</div>
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {goals.map((g) => (
            <GoalCard key={g.id} goal={g} onRefresh={() => void fetchGoals()} />
          ))}
        </div>
      )}

      {showNew && (
        <NewGoalModal
          onClose={() => setShowNew(false)}
          onCreated={() => void fetchGoals()}
        />
      )}
    </div>
  );
}
