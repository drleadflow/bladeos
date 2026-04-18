import { useEffect, useState } from "react";
import { Panel } from "@/components/blade/Panel";
import { TickerNumber } from "@/components/blade/TickerNumber";
import { useBladeStore } from "@/stores/blade-store";
import { ReasoningPanel } from "@/components/blade/intel/ReasoningPanel";

export function MemoryPage() {
  const memories = useBladeStore((s) => s.memories);
  const memoryStats = useBladeStore((s) => s.memoryStats);
  const searchMemory = useBladeStore((s) => s.searchMemory);
  const [q, setQ] = useState("");

  useEffect(() => {
    searchMemory("");
  }, [searchMemory]);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => searchMemory(q), 300);
    return () => clearTimeout(t);
  }, [q, searchMemory]);

  const formatDate = (s?: string) => {
    if (!s) return "";
    try {
      const d = new Date(s);
      return d.toLocaleDateString("en-US", { day: "2-digit", month: "short" }).toUpperCase();
    } catch {
      return s;
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6">
        <h1 className="blade-tracked blade-text-glow font-mono text-2xl font-bold text-white">MEMORY</h1>
        <p className="mt-1 font-mono text-xs text-white/50">Neural recall // hybrid FTS5 + vector search across all stored context</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Panel className="p-3">
          <div className="font-mono text-[9px] uppercase tracking-wider text-white/40">total memories</div>
          <div className="font-mono text-2xl text-white blade-text-glow">
            <TickerNumber value={memoryStats?.total ?? 0} />
          </div>
        </Panel>
        <Panel className="p-3">
          <div className="font-mono text-[9px] uppercase tracking-wider text-white/40">avg confidence</div>
          <div className="font-mono text-2xl text-white blade-text-glow">
            <TickerNumber value={memoryStats?.avgConfidence ?? 0} decimals={2} />
          </div>
        </Panel>
        <Panel className="p-3">
          <div className="font-mono text-[9px] uppercase tracking-wider text-white/40">pinned</div>
          <div className="font-mono text-2xl text-white blade-text-glow">
            <TickerNumber value={(memoryStats as { pinnedCount?: number } | null)?.pinnedCount ?? 0} />
          </div>
        </Panel>
        <Panel className="p-3">
          <div className="font-mono text-[9px] uppercase tracking-wider text-white/40">results</div>
          <div className="font-mono text-2xl text-white blade-text-glow">
            <TickerNumber value={memories.length} />
          </div>
        </Panel>
      </div>

      <Panel className="mb-6 p-3">
        <div className="flex items-center gap-2 font-mono text-sm">
          <span className="text-[var(--blade-red)]">›</span>
          <span className="text-white/50">SEARCH MEMORY_</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="flex-1 border-0 bg-transparent text-white outline-none placeholder:text-white/20"
            placeholder="query..."
          />
          <span className="h-4 w-1.5 animate-pulse bg-[var(--blade-red)]" />
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {memories.length === 0 && (
          <div className="col-span-full font-mono text-xs text-white/40">— no memories match —</div>
        )}
        {memories.map((m) => {
          const importance = m.importance ?? m.confidence ?? 0.5;
          return (
            <Panel
              key={m.id}
              className="cursor-pointer p-4 transition-all hover:scale-[1.02] hover:border-[var(--blade-red)]"
            >
              <p className="font-mono text-xs leading-relaxed text-white/80">{m.text}</p>
              <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2">
                <div className="flex flex-wrap gap-1.5">
                  {m.domain && (
                    <span className="rounded-sm bg-[var(--blade-red)]/10 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-[var(--blade-red)]">
                      {m.domain}
                    </span>
                  )}
                  {m.source && (
                    <span className="rounded-sm bg-white/5 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-white/50">
                      {m.source}
                    </span>
                  )}
                  {typeof m.accessCount === "number" && (
                    <span className="rounded-sm bg-white/5 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-white/50">
                      ×{m.accessCount}
                    </span>
                  )}
                </div>
                <span className="font-mono text-[9px] text-white/40">
                  {m.date ?? formatDate(m.createdAt)}
                </span>
              </div>
              <div className="mt-2">
                <div className="h-0.5 w-full overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full bg-gradient-to-r from-[var(--blade-scarlet)] to-[var(--blade-red)]"
                    style={{ width: `${importance * 100}%`, boxShadow: "0 0 6px #DC2626" }}
                  />
                </div>
              </div>
            </Panel>
          );
        })}
      </div>

      <div className="mt-8">
        <h2 className="blade-tracked font-mono text-sm font-bold text-white/80 mb-3">REASONINGBANK PATTERNS</h2>
        <ReasoningPanel />
      </div>
    </div>
  );
}
