import React from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Radar, Users, Crosshair, Brain, Clock, Rocket, Cpu, Target, AlertTriangle, BarChart3, Puzzle, MessageSquare } from "lucide-react";
import { HexIcon } from "./HexIcon";

const coreItems = [
  { to: "/", icon: Radar, label: "Command" },
  { to: "/council", icon: Users, label: "Council" },
  { to: "/missions", icon: Crosshair, label: "Missions" },
  { to: "/memory", icon: Brain, label: "Memory" },
  { to: "/calendar", icon: Clock, label: "Calendar" },
  { to: "/dispatch", icon: Rocket, label: "Dispatch" },
  { to: "/intel", icon: Cpu, label: "Intel" },
] as const;

const strategyItems = [
  { to: "/goals", icon: Target, label: "Goals" },
  { to: "/escalation", icon: AlertTriangle, label: "Escal" },
  { to: "/reporting", icon: BarChart3, label: "Report" },
  { to: "/plugins", icon: Puzzle, label: "Plugins" },
] as const;

export function LeftNav() {
  const { pathname } = useLocation();
  return (
    <aside className="relative z-20 flex w-16 shrink-0 flex-col items-center justify-between border-r border-[var(--blade-border)] bg-black/30 py-4 backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-[var(--blade-red)]/40 to-transparent" />

      <nav className="flex flex-col items-center gap-2">
        {coreItems.map((it, idx) => {
          const active = pathname === it.to;
          return (
            <React.Fragment key={it.to}>
              <Link
                to={it.to}
                className="group relative flex flex-col items-center"
                title={it.label}
              >
                <HexIcon Icon={it.icon} active={active} />
                <span className={`mt-0.5 font-mono text-[8px] uppercase tracking-wider transition-colors ${active ? "text-[var(--blade-red)]" : "text-white/30 group-hover:text-white/60"}`}>
                  {it.label.slice(0, 4)}
                </span>
              </Link>
              {idx === 0 && (
                <button
                  key="chat"
                  className="group relative flex flex-col items-center"
                  title="Chat"
                  onClick={() => window.dispatchEvent(new CustomEvent("blade:open-chat"))}
                >
                  <HexIcon Icon={MessageSquare} active={false} />
                  <span className="mt-0.5 font-mono text-[8px] uppercase tracking-wider transition-colors text-white/30 group-hover:text-white/60">
                    Chat
                  </span>
                </button>
              )}
            </React.Fragment>
          );
        })}

        {/* Strategy section divider */}
        <div className="my-1 w-8 border-t border-white/10" />
        <div className="font-mono text-[7px] uppercase tracking-widest text-white/20">strat</div>

        {strategyItems.map((it) => {
          const active = pathname === it.to;
          return (
            <Link
              key={it.to}
              to={it.to}
              className="group relative flex flex-col items-center"
              title={it.label}
            >
              <HexIcon Icon={it.icon} active={active} />
              <span className={`mt-0.5 font-mono text-[8px] uppercase tracking-wider transition-colors ${active ? "text-[var(--blade-red)]" : "text-white/30 group-hover:text-white/60"}`}>
                {it.label.slice(0, 4)}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Gemini status */}
      <div className="flex flex-col items-center gap-1.5">
        <div className="relative">
          <div className="h-2.5 w-2.5 rounded-full bg-[var(--blade-red)] blade-pulse" />
        </div>
        <div className="font-mono text-[8px] uppercase tracking-wider text-white/50">online</div>
      </div>
    </aside>
  );
}
