import { QRouterPanel } from "@/components/blade/intel/QRouterPanel";
import { AutopilotPanel } from "@/components/blade/intel/AutopilotPanel";
import { SecurityPanel } from "@/components/blade/intel/SecurityPanel";
import { ReasoningPanel } from "@/components/blade/intel/ReasoningPanel";

export function IntelPage() {
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6">
        <h1 className="blade-tracked blade-text-glow font-mono text-2xl font-bold text-white">INTELLIGENCE</h1>
        <p className="mt-1 font-mono text-xs text-white/50">
          Q-router · Autopilot · Security · ReasoningBank — the system thinking out loud.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section>
          <h2 className="mb-3 blade-tracked font-mono text-sm font-bold text-white/80">Q-ROUTER BRAIN</h2>
          <QRouterPanel />
        </section>
        <section>
          <h2 className="mb-3 blade-tracked font-mono text-sm font-bold text-white/80">SECURITY FEED</h2>
          <SecurityPanel />
        </section>
        <section className="xl:col-span-2">
          <h2 className="mb-3 blade-tracked font-mono text-sm font-bold text-white/80">AUTOPILOT</h2>
          <AutopilotPanel />
        </section>
        <section className="xl:col-span-2">
          <h2 className="mb-3 blade-tracked font-mono text-sm font-bold text-white/80">REASONINGBANK</h2>
          <ReasoningPanel />
        </section>
      </div>
    </div>
  );
}
