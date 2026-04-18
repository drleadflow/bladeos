import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Panel } from "@/components/blade/Panel";
import { TickerNumber } from "@/components/blade/TickerNumber";
import { useBladeStore } from "@/stores/blade-store";
import { type ReportingEmployee } from "@/lib/api";

type SortKey = keyof Pick<ReportingEmployee, "missionsCompleted" | "successRate" | "totalCostUsd" | "costPerMission">;
type SortDir = "asc" | "desc";

const PERIODS = [
  { label: "Today", value: 1 },
  { label: "This Week", value: 7 },
  { label: "Last 30 Days", value: 30 },
] as const;

function successColor(rate: number) {
  if (rate >= 80) return "#10B981";
  if (rate >= 50) return "#EAB308";
  return "#DC2626";
}

function MetricCard({ label, value, suffix = "", prefix = "", decimals = 0 }: { label: string; value: number; suffix?: string; prefix?: string; decimals?: number }) {
  return (
    <Panel className="p-4">
      <div className="font-mono text-[9px] uppercase tracking-wider text-white/40">{label}</div>
      <div className="mt-1 font-mono text-2xl font-bold text-white blade-text-glow">
        <TickerNumber value={value} prefix={prefix} suffix={suffix} decimals={decimals} />
      </div>
    </Panel>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="text-white/20">↕</span>;
  return <span className="text-[var(--blade-red)]">{dir === "asc" ? "↑" : "↓"}</span>;
}

export function ReportingPage() {
  const metrics = useBladeStore((s) => s.reportingMetrics);
  const employees = useBladeStore((s) => s.reportingEmployees);
  const period = useBladeStore((s) => s.reportingPeriod);
  const fetchReporting = useBladeStore((s) => s.fetchReporting);

  const [sortKey, setSortKey] = useState<SortKey>("missionsCompleted");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    void fetchReporting(period);
  }, [fetchReporting]);

  const handlePeriod = (p: number) => {
    void fetchReporting(p);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = [...employees].sort((a, b) => {
    const aVal = a[sortKey] ?? 0;
    const bVal = b[sortKey] ?? 0;
    return sortDir === "asc" ? aVal - bVal : bVal - aVal;
  });

  const thCls = "px-3 py-2 text-left font-mono text-[9px] uppercase tracking-wider text-white/40 cursor-pointer hover:text-white/70 select-none";

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="blade-tracked blade-text-glow font-mono text-2xl font-bold text-white">REPORTING</h1>
          <p className="mt-1 font-mono text-xs text-white/50">Business outcomes // agent performance</p>
        </div>
        {/* Period selector */}
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => handlePeriod(p.value)}
              className={`font-mono text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-sm border transition-colors ${period === p.value ? "border-[var(--blade-red)] bg-[var(--blade-red)]/20 text-white" : "border-white/10 bg-transparent text-white/40 hover:text-white/70 hover:border-white/20"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Top metrics */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="missions completed" value={metrics?.missionsCompleted ?? 0} />
        <MetricCard label="success rate" value={metrics?.missionsSuccessRate ?? 0} suffix="%" />
        <MetricCard label="prs opened" value={metrics?.prsOpened ?? 0} />
        <MetricCard label="total cost" value={metrics?.totalCostUsd ?? 0} prefix="$" decimals={2} />
        <MetricCard label="cost / mission" value={metrics?.costPerMission ?? 0} prefix="$" decimals={2} />
        <Panel className="p-4">
          <div className="font-mono text-[9px] uppercase tracking-wider text-white/40">security</div>
          <div className="mt-1 font-mono text-sm font-bold" style={{ color: metrics?.securityStatus === "All Clear" ? "#10B981" : "#DC2626" }}>
            {metrics?.securityStatus ?? "All Clear"}
          </div>
        </Panel>
      </div>

      {/* Employee breakdown table */}
      <Panel className="overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5">
          <div className="font-mono text-[9px] uppercase tracking-wider text-white/40">employee breakdown</div>
        </div>
        {sorted.length === 0 ? (
          <div className="p-8 text-center font-mono text-xs text-white/40">— no employee data for this period —</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className={`${thCls} cursor-default`}>employee</th>
                  <th className={thCls} onClick={() => handleSort("missionsCompleted")}>
                    <span className="flex items-center gap-1">missions <SortIcon active={sortKey === "missionsCompleted"} dir={sortDir} /></span>
                  </th>
                  <th className={thCls} onClick={() => handleSort("successRate")}>
                    <span className="flex items-center gap-1">success % <SortIcon active={sortKey === "successRate"} dir={sortDir} /></span>
                  </th>
                  <th className={thCls} onClick={() => handleSort("totalCostUsd")}>
                    <span className="flex items-center gap-1">cost <SortIcon active={sortKey === "totalCostUsd"} dir={sortDir} /></span>
                  </th>
                  <th className={thCls} onClick={() => handleSort("costPerMission")}>
                    <span className="flex items-center gap-1">$/mission <SortIcon active={sortKey === "costPerMission"} dir={sortDir} /></span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((emp, i) => (
                  <motion.tr
                    key={emp.slug}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="border-b border-white/5 hover:bg-white/3 transition-colors"
                  >
                    <td className="px-3 py-3">
                      <div className="font-mono text-sm font-bold text-white">{emp.name}</div>
                      <div className="font-mono text-[9px] uppercase text-white/30">{emp.slug}</div>
                    </td>
                    <td className="px-3 py-3 font-mono text-sm text-white">{emp.missionsCompleted}</td>
                    <td className="px-3 py-3">
                      <span className="font-mono text-sm font-bold" style={{ color: successColor(emp.successRate) }}>
                        {emp.successRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-3 py-3 font-mono text-sm text-white">${emp.totalCostUsd.toFixed(2)}</td>
                    <td className="px-3 py-3 font-mono text-sm text-white/70">${emp.costPerMission.toFixed(2)}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
