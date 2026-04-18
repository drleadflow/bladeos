import { Settings } from "lucide-react";
import { TickerNumber } from "./TickerNumber";
import { useBladeStore } from "@/stores/blade-store";
import { useMountedClock } from "@/hooks/use-mounted-clock";

type GaugeStatus = "ok" | "warn" | "down";

function ArcGauge({ label, status }: { label: string; status: GaugeStatus }) {
  const color = status === "ok" ? "#DC2626" : status === "warn" ? "#D97706" : "#4B5563";
  const fill = status === "ok" ? 1 : status === "warn" ? 0.5 : 0.1;
  const C = 2 * Math.PI * 14;
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-8 w-8">
        <svg viewBox="0 0 32 32" className="h-full w-full -rotate-90">
          <circle cx="16" cy="16" r="14" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
          <circle
            cx="16" cy="16" r="14" fill="none" stroke={color} strokeWidth="2"
            strokeDasharray={`${C * fill} ${C}`} strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 4px ${color})` }}
          />
        </svg>
      </div>
      <div className="leading-tight">
        <div className="font-mono text-[9px] uppercase tracking-wider text-white/40">{label}</div>
        <div className="font-mono text-[10px] uppercase" style={{ color }}>{status}</div>
      </div>
    </div>
  );
}

function formatMilTime(d: Date) {
  const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())} ${months[d.getMonth()]} ${d.getFullYear()} | ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function TopBar() {
  const now = useMountedClock(1000);
  const health = useBladeStore((s) => s.health);
  const securityStats = useBladeStore((s) => s.securityStats);
  const todayCost = useBladeStore((s) => s.todayCost);
  const voiceState = useBladeStore((s) => s.voiceState);

  const apiStatus: GaugeStatus = health?.dbConnected ? "ok" : health ? "warn" : "down";
  const voiceStatus: GaugeStatus = voiceState === "idle" ? "down" : "ok";
  const commsSeverity = securityStats?.severity ?? "clear";
  const commsStatus: GaugeStatus =
    commsSeverity === "critical" ? "down" : commsSeverity === "elevated" ? "warn" : "ok";

  return (
    <header className="relative z-30 flex h-14 items-center justify-between border-b border-[var(--blade-border)] bg-black/40 px-4 backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[var(--blade-red)]/50 to-transparent" />

      {/* Left: Brand */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="h-7 w-7 rotate-45 border border-[var(--blade-red)] bg-[var(--blade-red)]/10" style={{ boxShadow: "0 0 12px rgba(220,38,38,0.5)" }} />
          <div className="absolute inset-1 rotate-45 border border-[var(--blade-red)]/60" />
        </div>
        <div className="leading-tight">
          <div className="blade-tracked blade-text-glow font-mono text-sm font-bold text-white">BLADE COMMAND</div>
          <div className="font-mono text-[9px] uppercase tracking-widest text-white/40">v1.0.0 // build 2604</div>
        </div>
      </div>

      {/* Center: Status arcs */}
      <div className="hidden items-center gap-6 md:flex">
        <ArcGauge label="API" status={apiStatus} />
        <ArcGauge label="VOICE" status={voiceStatus} />
        <ArcGauge label="COMMS" status={commsStatus} />
      </div>

      {/* Right: Cost + time */}
      <div className="flex items-center gap-4">
        <div className="hidden text-right leading-tight sm:block">
          <div className="font-mono text-[9px] uppercase tracking-wider text-white/40">spend // today</div>
          <div className="blade-text-glow font-mono text-sm text-white">
            $<TickerNumber value={todayCost} decimals={2} duration={400} />
          </div>
        </div>
        <div className="hidden text-right leading-tight md:block">
          <div className="font-mono text-[9px] uppercase tracking-wider text-white/40">timestamp</div>
          <div suppressHydrationWarning className="font-mono text-[11px] text-white/80">
            {now ? formatMilTime(now) : "— — —"}
          </div>
        </div>
        <button className="rounded-md border border-[var(--blade-border)] p-2 text-white/60 transition-colors hover:border-[var(--blade-red)] hover:text-white">
          <Settings size={16} />
        </button>
      </div>
    </header>
  );
}
