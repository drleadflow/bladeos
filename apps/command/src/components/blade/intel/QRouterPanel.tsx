import { useEffect, useMemo } from "react";
import { Panel } from "@/components/blade/Panel";
import { TickerNumber } from "@/components/blade/TickerNumber";
import { useBladeStore } from "@/stores/blade-store";
import { deptColor } from "@/lib/api";

function qColor(q: number) {
  if (q >= 0.7) return "#10B981";
  if (q >= 0.4) return "#D97706";
  return "#DC2626";
}

export function QRouterPanel() {
  const employees = useBladeStore((s) => s.employees);
  const routingStats = useBladeStore((s) => s.routingStats);
  const qValues = useBladeStore((s) => s.qValues);
  const episodes = useBladeStore((s) => s.routingEpisodes);
  const fetchRouting = useBladeStore((s) => s.fetchRouting);

  useEffect(() => {
    fetchRouting();
  }, [fetchRouting]);

  const taskTypes = useMemo(() => {
    const set = new Set<string>();
    qValues.forEach((q) => set.add(q.taskType));
    return Array.from(set);
  }, [qValues]);

  const empSlugs = useMemo(() => {
    const set = new Set<string>();
    qValues.forEach((q) => set.add(q.employeeSlug));
    employees.forEach((e) => set.add(e.slug));
    return Array.from(set);
  }, [qValues, employees]);

  const findQ = (taskType: string, employeeSlug: string) =>
    qValues.find((q) => q.taskType === taskType && q.employeeSlug === employeeSlug)?.qValue ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Panel className="p-3">
          <div className="font-mono text-[9px] uppercase tracking-wider text-white/40">task types</div>
          <div className="font-mono text-2xl text-white blade-text-glow">
            <TickerNumber value={routingStats?.taskTypes?.length ?? taskTypes.length} />
          </div>
        </Panel>
        <Panel className="p-3">
          <div className="font-mono text-[9px] uppercase tracking-wider text-white/40">decisions logged</div>
          <div className="font-mono text-2xl text-white blade-text-glow">
            <TickerNumber value={episodes.length} />
          </div>
        </Panel>
        <Panel className="p-3">
          <div className="font-mono text-[9px] uppercase tracking-wider text-white/40">avg reward</div>
          <div className="font-mono text-2xl text-white blade-text-glow">
            <TickerNumber
              value={
                episodes.length
                  ? episodes.reduce((s, e) => s + (e.reward ?? 0), 0) / episodes.length
                  : 0
              }
              decimals={2}
            />
          </div>
        </Panel>
      </div>

      <Panel className="p-4">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-white/50">
          q-value heatmap // task × employee
        </div>
        {taskTypes.length === 0 ? (
          <div className="font-mono text-xs text-white/40">— no Q-values learned yet —</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse font-mono text-[10px]">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-left text-white/40">task</th>
                  {empSlugs.map((slug) => (
                    <th key={slug} className="px-2 py-1 text-center text-white/40 uppercase">
                      {slug.slice(0, 6)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {taskTypes.map((tt) => (
                  <tr key={tt}>
                    <td className="px-2 py-1 text-white/70">{tt}</td>
                    {empSlugs.map((slug) => {
                      const q = findQ(tt, slug);
                      const c = qColor(q);
                      return (
                        <td key={slug} className="px-1 py-1 text-center">
                          <div
                            className="mx-auto flex h-6 w-12 items-center justify-center rounded-sm font-mono text-[10px]"
                            style={{
                              background: `${c}${Math.round(q * 60).toString(16).padStart(2, "0")}`,
                              border: `1px solid ${c}66`,
                              color: q > 0 ? "white" : "rgba(255,255,255,0.3)",
                            }}
                          >
                            {q > 0 ? q.toFixed(2) : "—"}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel className="p-4">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-white/50">
          recent decisions
        </div>
        {episodes.length === 0 ? (
          <div className="font-mono text-xs text-white/40">— no routing episodes —</div>
        ) : (
          <ul className="space-y-1.5">
            {episodes.slice(0, 8).map((e) => {
              const emp = employees.find((x) => x.slug === e.selectedEmployee);
              const c = emp ? deptColor(emp.department).color : "#DC2626";
              const reward = e.reward ?? 0;
              const rewardColor = reward >= 0.7 ? "#10B981" : reward >= 0.3 ? "#D97706" : "#DC2626";
              return (
                <li key={e.id} className="flex items-center justify-between font-mono text-[11px]">
                  <span className="text-white/70">
                    <span className="text-white/40">{e.taskType}</span>
                    {" → "}
                    <span style={{ color: c }}>{e.selectedEmployee}</span>
                    {e.selectionMethod && (
                      <span className="ml-1 text-[9px] uppercase text-white/30">
                        ({e.selectionMethod})
                      </span>
                    )}
                  </span>
                  <span
                    className="rounded-sm px-1.5 py-0.5 text-[9px]"
                    style={{ background: `${rewardColor}22`, color: rewardColor, border: `1px solid ${rewardColor}55` }}
                  >
                    R {reward.toFixed(2)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
