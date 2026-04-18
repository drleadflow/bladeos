import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Panel } from "@/components/blade/Panel";
import { TickerNumber } from "@/components/blade/TickerNumber";
import { useBladeStore } from "@/stores/blade-store";
import { deptColor, type Employee } from "@/lib/api";

function HexAvatar({
  name, color, size = 80, active,
}: { name: string; color: string; size?: number; active?: boolean }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0" style={{ filter: `drop-shadow(0 0 12px ${color}99)` }}>
        <polygon points="50,4 92,27 92,73 50,96 8,73 8,27" fill={`${color}1A`} stroke={color} strokeWidth="2" />
      </svg>
      {active && (
        <svg viewBox="0 0 100 100" className="absolute inset-0 blade-spin-slow">
          <circle cx="50" cy="50" r="44" fill="none" stroke={color} strokeWidth="1.2" strokeDasharray="8 280" strokeLinecap="round" />
        </svg>
      )}
      <div className="absolute inset-0 flex items-center justify-center font-mono font-bold" style={{ color, fontSize: size * 0.32 }}>
        {name[0]}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: "online" | "working" | "idle" | "offline" }) {
  const map = { online: "#10B981", working: "#DC2626", idle: "#6B7280", offline: "#374151" } as const;
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider">
      <span className="h-1.5 w-1.5 rounded-full blade-pulse" style={{ background: map[status], boxShadow: `0 0 8px ${map[status]}` }} />
      <span style={{ color: map[status] }}>{status}</span>
    </span>
  );
}

export function CouncilPage() {
  const employees = useBladeStore((s) => s.employees);
  const missions = useBladeStore((s) => s.missions);
  const todayCost = useBladeStore((s) => s.todayCost);
  const fetchEmployees = useBladeStore((s) => s.fetchEmployees);

  const [selected, setSelected] = useState<Employee | null>(null);

  useEffect(() => {
    if (employees.length === 0) fetchEmployees();
  }, [employees.length, fetchEmployees]);

  const chief =
    employees.find((e) => e.department === "leadership") ?? {
      slug: "chief-of-staff",
      name: "Blade",
      title: "Chief of Staff",
      description: "Your single point of contact. Everything flows through Blade.",
      department: "leadership",
    };
  const specialists = employees.filter((e) => e.slug !== chief.slug);

  const chiefColor = deptColor(chief.department).color;

  const completed = missions.filter((m) => m.status === "done" || m.status === "completed").length;
  const active = missions.filter(
    (m) => m.status === "live" || m.status === "progress" || m.status === "in_progress",
  ).length;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6">
        <h1 className="blade-tracked blade-text-glow font-mono text-2xl font-bold text-white">GEMINI'S COUNCIL</h1>
        <p className="mt-1 font-mono text-xs text-white/50">The specialists powering your chief of staff.</p>
      </div>

      {/* Chief hero card */}
      <Panel className="mb-8 p-6" scanlines glow>
        <div className="flex items-center gap-6">
          <HexAvatar name={chief.name} color={chiefColor} size={100} active />
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h2 className="blade-tracked font-mono text-xl font-bold text-white">{chief.name.toUpperCase()}</h2>
              <span className="font-mono text-xs text-white/40">— {chief.title ?? "Chief of Staff"}</span>
              <StatusDot status="online" />
            </div>
            <p className="mt-1 max-w-xl font-mono text-xs text-white/60">
              {chief.description ?? "Your single point of contact. Everything flows through Gemini."}
            </p>
            <div className="mt-3 grid grid-cols-3 gap-4">
              <div>
                <div className="font-mono text-[9px] uppercase tracking-wider text-white/40">missions // active</div>
                <div className="font-mono text-2xl text-white blade-text-glow">
                  <TickerNumber value={active} />
                </div>
              </div>
              <div>
                <div className="font-mono text-[9px] uppercase tracking-wider text-white/40">completed</div>
                <div className="font-mono text-2xl text-white blade-text-glow">
                  <TickerNumber value={completed} />
                </div>
              </div>
              <div>
                <div className="font-mono text-[9px] uppercase tracking-wider text-white/40">spend // today</div>
                <div className="font-mono text-2xl text-white blade-text-glow">
                  $<TickerNumber value={todayCost} decimals={2} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </Panel>

      {/* Connecting lines */}
      <div className="relative">
        <svg className="pointer-events-none absolute -top-8 left-0 h-8 w-full" viewBox="0 0 100 10" preserveAspectRatio="none">
          {[12.5, 37.5, 62.5, 87.5].map((x, i) => (
            <motion.line
              key={i}
              x1="50" y1="0" x2={x} y2="10"
              stroke="#DC2626" strokeOpacity="0.3" strokeWidth="0.3" strokeDasharray="0.5 1"
              animate={{ strokeDashoffset: [0, -3] }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear", delay: i * 0.3 }}
            />
          ))}
        </svg>
      </div>

      {/* Specialist row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {specialists.length === 0 && (
          <div className="col-span-full font-mono text-xs text-white/40">— no specialists registered —</div>
        )}
        {specialists.map((agent) => {
          const c = deptColor(agent.department).color;
          const empMissions = missions.filter((m) => m.assignedEmployee === agent.slug);
          const working = empMissions.some(
            (m) => m.status === "progress" || m.status === "live" || m.status === "in_progress",
          );
          const success = empMissions.length
            ? Math.round(
                (empMissions.filter((m) => m.status === "done" || m.status === "completed").length /
                  empMissions.length) *
                  100,
              )
            : 0;
          const current = empMissions.find(
            (m) => m.status === "progress" || m.status === "live" || m.status === "in_progress",
          );
          return (
            <Panel
              key={agent.slug}
              bracketColor={c}
              className="cursor-pointer p-4 transition-all hover:scale-[1.02]"
              onClick={() => setSelected(agent)}
            >
              <div className="flex flex-col items-center text-center">
                <HexAvatar name={agent.name} color={c} size={70} active={working} />
                <div className="mt-3 blade-tracked font-mono text-sm font-bold text-white">{agent.name.toUpperCase()}</div>
                <div className="font-mono text-[10px] uppercase tracking-wider" style={{ color: c }}>
                  {agent.title ?? agent.department ?? "specialist"}
                </div>
                <div className="mt-2"><StatusDot status={working ? "working" : "idle"} /></div>
                {current && (
                  <div className="mt-2 w-full overflow-hidden rounded-sm border border-white/5 bg-black/30 px-2 py-1">
                    <div className="truncate font-mono text-[9px] text-white/60">› {current.title}</div>
                  </div>
                )}
                <div className="mt-3 grid w-full grid-cols-3 gap-2 border-t border-white/5 pt-3">
                  <div>
                    <div className="font-mono text-[8px] uppercase text-white/30">missions</div>
                    <div className="font-mono text-xs text-white"><TickerNumber value={empMissions.length} /></div>
                  </div>
                  <div>
                    <div className="font-mono text-[8px] uppercase text-white/30">success</div>
                    <div className="font-mono text-xs text-white"><TickerNumber value={success} suffix="%" /></div>
                  </div>
                  <div>
                    <div className="font-mono text-[8px] uppercase text-white/30">dept</div>
                    <div className="font-mono text-[10px] text-white truncate">{agent.department ?? "—"}</div>
                  </div>
                </div>
              </div>
            </Panel>
          );
        })}
      </div>

      {selected && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
          <Panel className="p-5" bracketColor={deptColor(selected.department).color}>
            <div className="flex items-center gap-4">
              <HexAvatar name={selected.name} color={deptColor(selected.department).color} size={56} />
              <div className="flex-1">
                <div className="blade-tracked font-mono text-lg font-bold text-white">{selected.name.toUpperCase()}</div>
                <p className="mt-1 font-mono text-xs text-white/60">
                  {selected.description ?? selected.title ?? "—"}
                </p>
                {selected.department && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span
                      className="rounded-sm px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider"
                      style={{
                        background: `${deptColor(selected.department).color}22`,
                        color: deptColor(selected.department).color,
                        border: `1px solid ${deptColor(selected.department).color}44`,
                      }}
                    >
                      {selected.department}
                    </span>
                  </div>
                )}
              </div>
              <button onClick={() => setSelected(null)} className="font-mono text-[10px] uppercase text-white/40 hover:text-white">close ×</button>
            </div>
          </Panel>
        </motion.div>
      )}
    </div>
  );
}
