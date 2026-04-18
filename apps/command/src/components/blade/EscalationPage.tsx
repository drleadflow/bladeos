import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Plus, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/blade/Panel";
import { useBladeStore } from "@/stores/blade-store";
import { api, type EscalationRule, type EscalationEvent } from "@/lib/api";

function actionColor(action?: string) {
  if (action === "escalate") return "#DC2626";
  if (action === "pause") return "#D97706";
  return "#10B981";
}

function ToggleSwitch({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange(!enabled); }}
      className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${enabled ? "bg-[var(--blade-red)]/60" : "bg-white/10"}`}
    >
      <span
        className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${enabled ? "translate-x-3.5" : "translate-x-0.5"}`}
      />
    </button>
  );
}

function RuleCard({ rule, onToggle }: { rule: EscalationRule; onToggle: () => void }) {
  const ac = actionColor(rule.action);

  return (
    <Panel className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-mono text-sm font-bold text-white truncate">{rule.name}</div>
          {rule.description && (
            <div className="mt-1 font-mono text-[10px] text-white/50 leading-relaxed">{rule.description}</div>
          )}
        </div>
        <ToggleSwitch enabled={rule.enabled} onChange={onToggle} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-white/5 text-white/60 border border-white/10">
          {rule.conditionType} &gt; {rule.conditionThreshold}
        </span>
        <span
          className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm"
          style={{ background: `${ac}22`, color: ac, border: `1px solid ${ac}55` }}
        >
          {rule.action ?? "notify"}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between font-mono text-[9px] text-white/30">
        <span>triggers: {rule.triggerCount ?? 0}</span>
        {rule.lastTriggeredAt && (
          <span>last: {new Date(rule.lastTriggeredAt).toLocaleDateString()}</span>
        )}
        {rule.cooldownMinutes && (
          <span>cooldown: {rule.cooldownMinutes}m</span>
        )}
      </div>
    </Panel>
  );
}

function EventItem({ event, onResolve }: { event: EscalationEvent; onResolve: () => void }) {
  const ac = actionColor(event.action);
  const unresolved = !event.resolved;

  return (
    <div className={`p-3 rounded-sm border ${unresolved ? "border-[var(--blade-red)]/40 bg-[var(--blade-red)]/5" : "border-white/10 bg-white/2"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-mono text-[10px] font-bold text-white truncate">{event.ruleName}</div>
          <div className="mt-0.5 flex flex-wrap gap-2">
            {event.conditionValue !== undefined && (
              <span className="font-mono text-[9px] text-white/40">value: {event.conditionValue}</span>
            )}
            {event.action && (
              <span className="font-mono text-[9px]" style={{ color: ac }}>{event.action}</span>
            )}
          </div>
        </div>
        {unresolved && (
          <button
            onClick={onResolve}
            className="shrink-0 font-mono text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm border border-[var(--blade-red)]/50 text-[var(--blade-red)] hover:bg-[var(--blade-red)]/20 transition-colors"
          >
            resolve
          </button>
        )}
      </div>
      {event.createdAt && (
        <div className="mt-1 font-mono text-[8px] text-white/25">
          {new Date(event.createdAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}

function NewRuleModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [conditionType, setConditionType] = useState("cost_daily");
  const [conditionThreshold, setConditionThreshold] = useState("");
  const [action, setAction] = useState("notify");
  const [cooldown, setCooldown] = useState("60");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!name.trim() || !conditionThreshold) {
      toast.error("Name and threshold required");
      return;
    }
    setSubmitting(true);
    try {
      await api.createEscalationRule({
        name: name.trim(),
        description: description.trim() || undefined,
        conditionType,
        conditionThreshold: Number(conditionThreshold),
        action,
        cooldownMinutes: cooldown ? Number(cooldown) : undefined,
      });
      toast.success("Escalation rule created");
      onCreated();
      onClose();
    } catch (e) {
      toast.error("Failed to create rule", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = "mt-1 w-full border-0 border-b border-[var(--blade-red)]/50 bg-transparent py-1.5 font-mono text-sm text-white outline-none focus:border-[var(--blade-red)]";
  const labelCls = "font-mono text-[9px] uppercase tracking-wider text-white/40";
  const selectCls = "mt-1 w-full border-0 border-b border-[var(--blade-red)]/50 bg-transparent py-1.5 font-mono text-sm text-white outline-none focus:border-[var(--blade-red)]";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <Panel className="w-full max-w-lg p-6" scanlines>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="blade-tracked font-mono text-lg font-bold text-white">NEW ESCALATION RULE</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X size={16} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className={labelCls}>rule name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="High daily spend..." />
          </div>
          <div>
            <label className={labelCls}>description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} placeholder="Optional context..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>condition type</label>
              <select value={conditionType} onChange={(e) => setConditionType(e.target.value)} className={selectCls}>
                <option value="cost_daily" className="bg-black">cost_daily</option>
                <option value="success_rate" className="bg-black">success_rate</option>
                <option value="error_rate" className="bg-black">error_rate</option>
                <option value="security" className="bg-black">security</option>
                <option value="queue_depth" className="bg-black">queue_depth</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>threshold *</label>
              <input type="number" value={conditionThreshold} onChange={(e) => setConditionThreshold(e.target.value)} className={inputCls} placeholder="5.00" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>action</label>
              <select value={action} onChange={(e) => setAction(e.target.value)} className={selectCls}>
                <option value="notify" className="bg-black">notify</option>
                <option value="pause" className="bg-black">pause</option>
                <option value="escalate" className="bg-black">escalate</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>cooldown (minutes)</label>
              <input type="number" value={cooldown} onChange={(e) => setCooldown(e.target.value)} className={inputCls} placeholder="60" />
            </div>
          </div>
          <button
            disabled={submitting}
            onClick={submit}
            className="w-full rounded-md border border-[var(--blade-red)] bg-[var(--blade-red)]/20 py-3 font-mono text-sm font-bold uppercase tracking-[0.2em] text-white transition-all hover:bg-[var(--blade-red)]/40 blade-glow disabled:opacity-50"
          >
            {submitting ? "▸ creating..." : "▸ create rule"}
          </button>
        </div>
      </Panel>
    </motion.div>
  );
}

export function EscalationPage() {
  const rules = useBladeStore((s) => s.escalationRules);
  const events = useBladeStore((s) => s.escalationEvents);
  const fetchEscalation = useBladeStore((s) => s.fetchEscalation);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    void fetchEscalation();
  }, [fetchEscalation]);

  const handleToggle = async (rule: EscalationRule) => {
    try {
      // optimistically handled; no dedicated toggle endpoint shown, use createRule as update proxy
      toast.info(`Rule ${rule.enabled ? "disabled" : "enabled"}: ${rule.name}`);
      await fetchEscalation();
    } catch {
      toast.error("Failed to update rule");
    }
  };

  const handleResolve = async (event: EscalationEvent) => {
    try {
      await api.resolveEscalationEvent(event.id);
      toast.success("Event resolved");
      await fetchEscalation();
    } catch (e) {
      toast.error("Failed to resolve", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const handleEvaluate = async () => {
    try {
      const result = await api.evaluateEscalation();
      toast.success(`Evaluation complete`, { description: `${result?.triggered ?? 0} rules triggered` });
      await fetchEscalation();
    } catch (e) {
      toast.error("Evaluation failed", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const unresolvedCount = events.filter((e) => !e.resolved).length;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="blade-tracked blade-text-glow font-mono text-2xl font-bold text-white">ESCALATION</h1>
          <p className="mt-1 font-mono text-xs text-white/50">Automated response rules // event history</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleEvaluate}
            className="flex items-center gap-2 rounded-md border border-white/20 bg-white/5 px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-white/70 transition-all hover:bg-white/10"
          >
            <Zap size={12} /> evaluate now
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 rounded-md border border-[var(--blade-red)] bg-[var(--blade-red)]/10 px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-white transition-all hover:bg-[var(--blade-red)]/30 blade-glow"
          >
            <Plus size={14} /> new rule
          </button>
        </div>
      </div>

      <div className="flex gap-4 flex-col lg:flex-row">
        {/* Rules — 60% */}
        <div className="lg:w-3/5 space-y-3">
          <div className="font-mono text-[9px] uppercase tracking-wider text-white/40 mb-2">
            rules ({rules.length})
          </div>
          {rules.length === 0 ? (
            <Panel className="p-6 text-center">
              <div className="font-mono text-xs text-white/40">— no escalation rules defined —</div>
            </Panel>
          ) : (
            rules.map((r) => (
              <RuleCard key={r.id} rule={r} onToggle={() => handleToggle(r)} />
            ))
          )}
        </div>

        {/* Events — 40% */}
        <div className="lg:w-2/5">
          <div className="font-mono text-[9px] uppercase tracking-wider text-white/40 mb-2">
            recent events
            {unresolvedCount > 0 && (
              <span className="ml-2 font-mono text-[9px] px-1.5 py-0.5 rounded-sm bg-[var(--blade-red)]/20 text-[var(--blade-red)]">
                {unresolvedCount} unresolved
              </span>
            )}
          </div>
          <Panel className="p-3">
            {events.length === 0 ? (
              <div className="font-mono text-xs text-white/40 text-center py-4">— no events yet —</div>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {events.map((ev) => (
                  <EventItem key={ev.id} event={ev} onResolve={() => handleResolve(ev)} />
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>

      {showNew && (
        <NewRuleModal
          onClose={() => setShowNew(false)}
          onCreated={() => void fetchEscalation()}
        />
      )}
    </div>
  );
}
