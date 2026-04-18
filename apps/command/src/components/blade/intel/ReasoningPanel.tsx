import { useEffect, useMemo, useState } from "react";
import { Panel } from "@/components/blade/Panel";
import { TickerNumber } from "@/components/blade/TickerNumber";
import { useBladeStore } from "@/stores/blade-store";

function confColor(c: number) {
  if (c >= 0.7) return "#10B981";
  if (c >= 0.4) return "#D97706";
  return "#DC2626";
}

export function ReasoningPanel() {
  const patterns = useBladeStore((s) => s.reasoningPatterns);
  const stats = useBladeStore((s) => s.reasoningStats);
  const fetchReasoning = useBladeStore((s) => s.fetchReasoning);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    fetchReasoning();
  }, [fetchReasoning]);

  const taskTypes = useMemo(() => {
    const set = new Set<string>();
    patterns.forEach((p) => set.add(p.taskType));
    return Array.from(set);
  }, [patterns]);

  const filtered = filter === "all" ? patterns : patterns.filter((p) => p.taskType === filter);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Panel className="px-3 py-1.5">
            <span className="font-mono text-[9px] uppercase tracking-wider text-white/40">total · </span>
            <span className="font-mono text-sm text-white blade-text-glow">
              <TickerNumber value={stats?.total ?? 0} />
            </span>
          </Panel>
          <Panel className="px-3 py-1.5">
            <span className="font-mono text-[9px] uppercase tracking-wider text-white/40">types · </span>
            <span className="font-mono text-sm text-white blade-text-glow">
              <TickerNumber value={taskTypes.length} />
            </span>
          </Panel>
        </div>
        {taskTypes.length > 0 && (
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-sm border border-white/10 bg-black/40 px-2 py-1 font-mono text-[10px] uppercase text-white"
          >
            <option value="all">all task types</option>
            {taskTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        <Panel className="p-6 text-center font-mono text-xs text-white/40">— no patterns learned yet —</Panel>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filtered.map((p) => {
            const c = confColor(p.confidence);
            const successRate = p.useCount > 0 ? p.successCount / p.useCount : 0;
            return (
              <Panel key={p.id} className="p-4" bracketColor={c}>
                <div className="flex items-center justify-between">
                  <span
                    className="rounded-sm px-1.5 py-0.5 font-mono text-[9px] uppercase"
                    style={{ background: `${c}22`, color: c, border: `1px solid ${c}55` }}
                  >
                    {p.taskType}
                  </span>
                  <div className="font-mono text-[10px] text-white/40">
                    used {p.useCount}× · {Math.round(successRate * 100)}% success
                  </div>
                </div>
                <p className="mt-2 font-mono text-xs leading-relaxed text-white/80">{p.approach}</p>
                <div className="mt-3">
                  <div className="flex items-center justify-between font-mono text-[9px] uppercase text-white/40">
                    <span>confidence</span>
                    <span style={{ color: c }}>{p.confidence.toFixed(2)}</span>
                  </div>
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full"
                      style={{
                        width: `${p.confidence * 100}%`,
                        background: c,
                        boxShadow: `0 0 6px ${c}`,
                      }}
                    />
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
