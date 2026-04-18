import { useMemo } from "react";
import { Panel } from "@/components/blade/Panel";
import { Rocket } from "lucide-react";
import { useBladeStore } from "@/stores/blade-store";
import type { Job } from "@/lib/api";

const STAGES = ["queued", "cloning", "branching", "coding", "testing", "pr_creating", "completed"] as const;
type Stage = (typeof STAGES)[number];

const sevColor: Record<string, string> = {
  MINOR: "#10B981",
  minor: "#10B981",
  MAJOR: "#D97706",
  major: "#D97706",
  CRITICAL: "#DC2626",
  critical: "#DC2626",
};

function normalizeStage(status: string): Stage {
  const s = (status ?? "").toLowerCase();
  if ((STAGES as readonly string[]).includes(s)) return s as Stage;
  if (s === "failed" || s === "error") return "completed";
  return "queued";
}

function Pipeline({ current }: { current: Stage }) {
  const idx = STAGES.indexOf(current);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {STAGES.map((s, i) => (
        <div key={s} className="flex items-center gap-1">
          <div className="flex flex-col items-center">
            <div
              className="h-2.5 w-2.5 rounded-full transition-all"
              style={{
                background: i <= idx ? "#DC2626" : "rgba(255,255,255,0.1)",
                boxShadow: i === idx ? "0 0 10px #DC2626" : undefined,
              }}
            />
            <div
              className="mt-0.5 font-mono text-[8px] uppercase tracking-wider"
              style={{ color: i === idx ? "#DC2626" : "rgba(255,255,255,0.4)" }}
            >
              {s}
            </div>
          </div>
          {i < STAGES.length - 1 && (
            <div className="h-px w-6" style={{ background: i < idx ? "#DC2626" : "rgba(255,255,255,0.1)" }} />
          )}
        </div>
      ))}
    </div>
  );
}

export function DispatchPage() {
  const jobs = useBladeStore((s) => s.jobs);

  const list = useMemo<Job[]>(() => jobs ?? [], [jobs]);

  return (
    <div className="relative h-full overflow-y-auto p-6">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="blade-tracked blade-text-glow font-mono text-2xl font-bold text-white">DISPATCH</h1>
          <p className="mt-1 font-mono text-xs text-white/50">Automated code operations // Forge's queue</p>
        </div>
      </div>

      {list.length === 0 && (
        <Panel className="p-6 text-center font-mono text-xs text-white/40">— no jobs in queue —</Panel>
      )}

      <div className="space-y-4">
        {list.map((d) => {
          const sev = d.severity ?? "MINOR";
          const color = sevColor[sev] ?? "#6B7280";
          const stage = normalizeStage(d.status);
          return (
            <Panel key={d.id} className="p-4 transition-all hover:scale-[1.005]" bracketColor={color}>
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="font-mono text-sm font-bold text-white">{d.title}</div>
                    <span
                      className="rounded-sm px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider"
                      style={{ background: `${color}22`, color, border: `1px solid ${color}66` }}
                    >
                      {sev}
                    </span>
                    {d.branch && <code className="font-mono text-[10px] text-white/50">{d.branch}</code>}
                    {typeof d.files === "number" && (
                      <span className="font-mono text-[10px] text-white/40">{d.files} files</span>
                    )}
                    {d.prUrl && (
                      <a
                        href={d.prUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-[10px] text-[var(--blade-red)] hover:underline"
                      >
                        view PR →
                      </a>
                    )}
                  </div>
                  {d.description && <p className="mt-1 font-mono text-xs text-white/70">{d.description}</p>}
                </div>
              </div>
              <div className="mt-4 border-t border-white/5 pt-3">
                <Pipeline current={stage} />
              </div>
            </Panel>
          );
        })}
      </div>

      <button className="fixed bottom-6 right-6 flex items-center gap-2 rounded-full border border-[var(--blade-red)] bg-[var(--blade-red)]/20 px-5 py-3 font-mono text-xs uppercase tracking-wider text-white blade-glow hover:bg-[var(--blade-red)]/40">
        <Rocket size={14} /> quick dispatch
      </button>
    </div>
  );
}
