import { useEffect } from "react";
import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/blade/Panel";
import { useBladeStore } from "@/stores/blade-store";
import { api, type Plugin } from "@/lib/api";

function typeColor(type?: string) {
  if (type === "hook") return "#7C3AED";
  if (type === "tool") return "#2563EB";
  if (type === "provider") return "#10B981";
  if (type === "worker") return "#D97706";
  return "#6B7280";
}

function PluginCard({ plugin, onRefresh }: { plugin: Plugin; onRefresh: () => void }) {
  const tc = typeColor(plugin.type);
  const hasCrashes = (plugin.crashCount ?? 0) > 0;

  const handleToggle = async () => {
    try {
      await api.togglePlugin(plugin.name, plugin.enabled ? "disable" : "enable");
      toast.success(`Plugin ${plugin.enabled ? "disabled" : "enabled"}: ${plugin.name}`);
      onRefresh();
    } catch (e) {
      toast.error("Failed to toggle plugin", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const handleReset = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.togglePlugin(plugin.name, "reset");
      toast.success(`Crash count reset: ${plugin.name}`);
      onRefresh();
    } catch (err) {
      toast.error("Failed to reset crashes", { description: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <Panel className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-mono text-sm font-bold text-white truncate">{plugin.name}</div>
            {plugin.version && (
              <span className="font-mono text-[8px] text-white/30">v{plugin.version}</span>
            )}
            {hasCrashes && (
              <span className="font-mono text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[var(--blade-red)]/20 text-[var(--blade-red)] border border-[var(--blade-red)]/40">
                {plugin.crashCount} crash{plugin.crashCount !== 1 ? "es" : ""}
              </span>
            )}
          </div>
          {plugin.type && (
            <span
              className="mt-1 inline-block font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm"
              style={{ background: `${tc}22`, color: tc, border: `1px solid ${tc}44` }}
            >
              {plugin.type}
            </span>
          )}
          {plugin.description && (
            <p className="mt-2 font-mono text-[10px] text-white/50 leading-relaxed">{plugin.description}</p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <button
            onClick={handleToggle}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${plugin.enabled ? "bg-[var(--blade-red)]/60" : "bg-white/10"}`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${plugin.enabled ? "translate-x-4" : "translate-x-0.5"}`}
            />
          </button>
          <span className={`font-mono text-[8px] uppercase tracking-wider ${plugin.enabled ? "text-[var(--blade-red)]" : "text-white/25"}`}>
            {plugin.enabled ? "enabled" : "disabled"}
          </span>
        </div>
      </div>

      {hasCrashes && (
        <div className="mt-3 flex items-center justify-between border-t border-[var(--blade-red)]/20 pt-3">
          <span className="font-mono text-[9px] text-white/30">plugin has crash history</span>
          <button
            onClick={handleReset}
            className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider px-2 py-1 rounded-sm border border-white/20 text-white/50 hover:text-white hover:border-white/40 transition-colors"
          >
            <RefreshCw size={10} /> reset crashes
          </button>
        </div>
      )}
    </Panel>
  );
}

export function PluginsPage() {
  const plugins = useBladeStore((s) => s.plugins);
  const fetchPlugins = useBladeStore((s) => s.fetchPlugins);

  useEffect(() => {
    void fetchPlugins();
  }, [fetchPlugins]);

  const enabled = plugins.filter((p) => p.enabled).length;
  const crashed = plugins.filter((p) => (p.crashCount ?? 0) > 0).length;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="blade-tracked blade-text-glow font-mono text-2xl font-bold text-white">PLUGINS</h1>
          <p className="mt-1 font-mono text-xs text-white/50">Installed extensions // system hooks</p>
        </div>
        <button
          onClick={() => void fetchPlugins()}
          className="flex items-center gap-2 rounded-md border border-white/20 bg-white/5 px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-white/70 transition-all hover:bg-white/10"
        >
          <RefreshCw size={12} /> refresh
        </button>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <Panel className="p-4">
          <div className="font-mono text-[9px] uppercase tracking-wider text-white/40">installed</div>
          <div className="font-mono text-3xl text-white blade-text-glow">{plugins.length}</div>
        </Panel>
        <Panel className="p-4">
          <div className="font-mono text-[9px] uppercase tracking-wider text-white/40">enabled</div>
          <div className="font-mono text-3xl blade-text-glow" style={{ color: "#10B981" }}>{enabled}</div>
        </Panel>
        <Panel className="p-4">
          <div className="font-mono text-[9px] uppercase tracking-wider text-white/40">with crashes</div>
          <div className="font-mono text-3xl blade-text-glow" style={{ color: crashed > 0 ? "#DC2626" : "#10B981" }}>{crashed}</div>
        </Panel>
      </div>

      {plugins.length === 0 ? (
        <Panel className="p-8 text-center">
          <div className="font-mono text-xs text-white/40">— no plugins installed —</div>
          <div className="mt-2 font-mono text-[10px] text-white/25">plugins are loaded from the backend plugin registry</div>
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {plugins.map((p, i) => (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <PluginCard plugin={p} onRefresh={() => void fetchPlugins()} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
