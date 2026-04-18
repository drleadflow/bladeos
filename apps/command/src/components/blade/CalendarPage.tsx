import { Panel } from "@/components/blade/Panel";
import { useBladeStore } from "@/stores/blade-store";
import { deptColor } from "@/lib/api";

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const HOURS = ["08", "10", "12", "14", "16", "18"];

export function CalendarPage() {
  const employees = useBladeStore((s) => s.employees);
  const hasEmployees = employees.length > 0;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="blade-tracked blade-text-glow font-mono text-2xl font-bold text-white">SCHEDULE</h1>
          <p className="mt-1 font-mono text-xs text-white/50">Recurring directives // automated dispatches</p>
        </div>
        <button className="rounded-md border border-[var(--blade-red)] bg-[var(--blade-red)]/10 px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-white hover:bg-[var(--blade-red)]/30 blade-glow">
          + new schedule
        </button>
      </div>

      <Panel className="overflow-hidden p-0" scanlines>
        {/* Header */}
        <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-white/10">
          <div />
          {DAYS.map((d) => (
            <div key={d} className="border-l border-white/5 p-2 text-center font-mono text-[10px] uppercase tracking-wider text-white/60">{d}</div>
          ))}
        </div>

        {!hasEmployees ? (
          /* Empty state when no employees/routines are loaded yet */
          <div className="flex h-48 items-center justify-center">
            <div className="text-center">
              <div className="font-mono text-[11px] uppercase tracking-wider text-white/30">— no schedules configured —</div>
              <div className="mt-1 font-mono text-[9px] text-white/20">routines will appear here once agents are active</div>
            </div>
          </div>
        ) : (
          /* Grid rows */
          HOURS.map((h, hourIdx) => (
            <div key={h} className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-white/5">
              <div className="p-2 text-right font-mono text-[10px] text-white/40">{h}:00</div>
              {DAYS.map((d, dayIdx) => {
                // Distribute employees across days/hours as a placeholder grid
                // When real routine data is available via API, replace this mapping.
                const empIdx = dayIdx + hourIdx * DAYS.length;
                const emp = empIdx < employees.length ? employees[empIdx] : undefined;
                const color = emp ? deptColor(emp.department).color : undefined;
                return (
                  <div key={`${d}-${hourIdx}`} className="relative h-16 border-l border-white/5 p-1">
                    {emp && color && (
                      <div
                        className="h-full cursor-pointer rounded-sm border p-1.5 transition-all hover:scale-[1.02]"
                        style={{
                          background: `${color}1A`,
                          borderColor: color,
                          boxShadow: `0 0 12px ${color}55`,
                        }}
                      >
                        <div className="truncate font-mono text-[10px] font-bold text-white">{emp.title ?? emp.name}</div>
                        <div className="font-mono text-[9px]" style={{ color }}>{emp.name}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </Panel>
    </div>
  );
}
