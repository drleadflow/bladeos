import { useEffect } from "react";
import { Shield, AlertTriangle } from "lucide-react";
import { Panel } from "@/components/blade/Panel";
import { TickerNumber } from "@/components/blade/TickerNumber";
import { useBladeStore } from "@/stores/blade-store";

const SEV_COLOR: Record<string, string> = {
  clear: "#10B981",
  low: "#10B981",
  elevated: "#D97706",
  medium: "#D97706",
  high: "#DC2626",
  critical: "#DC2626",
};

export function SecurityPanel() {
  const stats = useBladeStore((s) => s.securityStats);
  const events = useBladeStore((s) => s.securityEvents);
  const fetchSecurity = useBladeStore((s) => s.fetchSecurity);

  useEffect(() => {
    fetchSecurity();
  }, [fetchSecurity]);

  const sev = stats?.severity ?? "clear";
  const sevColor = SEV_COLOR[sev] ?? "#10B981";

  return (
    <div className="space-y-3">
      <Panel className="p-4" bracketColor={sevColor} glow={sev === "critical" || sev === "high"}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full"
              style={{
                background: `${sevColor}22`,
                border: `1px solid ${sevColor}`,
                boxShadow: `0 0 16px ${sevColor}66`,
              }}
            >
              <Shield size={18} style={{ color: sevColor }} />
            </div>
            <div>
              <div className="font-mono text-[9px] uppercase tracking-wider text-white/40">security posture</div>
              <div className="font-mono text-lg font-bold uppercase" style={{ color: sevColor }}>
                {sev}
              </div>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="text-right">
              <div className="font-mono text-[9px] uppercase tracking-wider text-white/40">injections // today</div>
              <div className="font-mono text-2xl text-white blade-text-glow">
                <TickerNumber value={stats?.injectionsToday ?? 0} />
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-[9px] uppercase tracking-wider text-white/40">exfil // today</div>
              <div className="font-mono text-2xl text-white blade-text-glow">
                <TickerNumber value={stats?.exfiltrationsToday ?? 0} />
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <Panel className="p-4">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-white/50">event feed</div>
        {events.length === 0 ? (
          <div className="font-mono text-xs text-white/40">— no security events —</div>
        ) : (
          <ul className="space-y-1.5 max-h-72 overflow-y-auto">
            {events.map((e) => {
              const c = SEV_COLOR[e.severity] ?? "#6B7280";
              return (
                <li
                  key={e.id}
                  className="flex items-start gap-2 rounded-sm border border-white/5 bg-black/20 p-2 font-mono text-[11px]"
                >
                  <AlertTriangle size={12} style={{ color: c, marginTop: 2 }} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="rounded-sm px-1.5 py-0.5 text-[9px] uppercase"
                        style={{ background: `${c}22`, color: c, border: `1px solid ${c}55` }}
                      >
                        {e.type}
                      </span>
                      <span className="text-[9px] text-white/30">
                        {e.createdAt ? new Date(e.createdAt).toLocaleTimeString() : ""}
                      </span>
                    </div>
                    <div className="mt-1 text-white/80">{e.summary}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
