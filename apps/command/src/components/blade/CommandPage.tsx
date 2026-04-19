import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mic, MicOff, Square, Activity } from "lucide-react";
import { LiveKitRoom, RoomAudioRenderer, useVoiceAssistant } from "@livekit/components-react";
import "@livekit/components-styles";
import { VoiceVisualizer } from "@/components/blade/VoiceVisualizer";
import { Brackets } from "@/components/blade/Brackets";
import { TickerNumber } from "@/components/blade/TickerNumber";
import { useBladeStore } from "@/stores/blade-store";
import { type VoiceState } from "@/stores/blade-store";
import { useVoiceWS } from "@/hooks/use-voice-ws";
import { deptColor, type Employee } from "@/lib/api";

interface VoiceAgentUIProps {
  dispatchTo: { name: string; color: string } | null;
}

/**
 * Rendered inside a LiveKitRoom context.
 * Uses useVoiceAssistant to get agent state and transcriptions,
 * then maps them to Blade's VoiceState and transcript store.
 */
function VoiceAgentUI({ dispatchTo }: VoiceAgentUIProps) {
  const { state, agentTranscriptions } = useVoiceAssistant();
  const setVoiceState = useBladeStore((s) => s.setVoiceState);
  const pushTranscript = useBladeStore((s) => s.pushTranscript);
  const voiceState = useBladeStore((s) => s.voiceState);

  // Map LiveKit agent state to Blade VoiceState
  useEffect(() => {
    const stateMap: Partial<Record<typeof state, VoiceState>> = {
      listening: "listening",
      thinking: "thinking",
      speaking: "speaking",
      idle: "idle",
      disconnected: "idle",
      failed: "idle",
      initializing: "idle",
      connecting: "idle",
      "pre-connect-buffering": "listening",
    };
    const mapped = stateMap[state];
    if (mapped !== undefined) {
      setVoiceState(mapped);
    }
  }, [state, setVoiceState]);

  // Push final agent transcriptions to store
  useEffect(() => {
    if (agentTranscriptions.length === 0) return;
    const last = agentTranscriptions[agentTranscriptions.length - 1];
    if (last.final) {
      pushTranscript({ role: "agent", text: last.text });
    }
  }, [agentTranscriptions, pushTranscript]);

  return <VoiceVisualizer state={voiceState} dispatchTo={dispatchTo} size={340} />;
}

function OrbitWidget({
  position, children,
}: { position: "tl" | "tr" | "bl" | "br"; children: React.ReactNode }) {
  const pos = {
    tl: "top-4 left-4",
    tr: "top-4 right-4",
    bl: "bottom-4 left-4",
    br: "bottom-4 right-4",
  }[position];
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className={`absolute ${pos} blade-panel rounded-md p-3 w-56`}
    >
      <Brackets />
      {children}
    </motion.div>
  );
}

export function CommandPage() {
  const missions = useBladeStore((s) => s.missions);
  const memoryStats = useBladeStore((s) => s.memoryStats);
  const employees = useBladeStore((s) => s.employees);
  const timeline = useBladeStore((s) => s.timeline);
  const todayCost = useBladeStore((s) => s.todayCost);
  const transcript = useBladeStore((s) => s.transcript);
  const voiceState = useBladeStore((s) => s.voiceState);
  const isMuted = useBladeStore((s) => s.isMuted);
  const toggleMute = useBladeStore((s) => s.toggleMute);
  const activeEmployee = useBladeStore((s) => s.activeEmployee);
  const setVoiceState = useBladeStore((s) => s.setVoiceState);

  // Always-on voice — fetches a LiveKit token on mount
  const { token, roomName, livekitUrl } = useVoiceWS(true);

  const [sessionMs, setSessionMs] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    startRef.current = Date.now();
    const t = setInterval(() => {
      if (startRef.current) setSessionMs(Date.now() - startRef.current);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const sessionDuration = () => {
    const s = Math.floor(sessionMs / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };

  const activeMissions = missions.filter(
    (m) => m.status === "live" || m.status === "progress" || m.status === "in_progress",
  ).length;

  // Build "specialist" lanes from employees (skip leadership/Gemini)
  const specialists = useMemo(
    () =>
      employees
        .filter((e) => e.department !== "leadership")
        .slice(0, 4),
    [employees],
  );

  const dispatchEmp: Employee | undefined = activeEmployee
    ? employees.find((e) => e.slug === activeEmployee)
    : undefined;
  const dispatchTo = dispatchEmp
    ? { name: dispatchEmp.name, color: deptColor(dispatchEmp.department).color }
    : null;

  // Build feed: prefer real transcript, fall back to timeline
  const feedItems =
    transcript.length > 0
      ? transcript.slice(-8)
      : timeline.slice(0, 8).map((e, i) => ({
          id: i,
          role: (e.actorType === "employee" ? "agent" : "you") as "agent" | "you",
          text: e.summary,
          via: e.actorSlug,
        }));

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* Hero visualizer area */}
      <div className="relative flex flex-1 items-center justify-center">
        {/* Orbital widgets */}
        <OrbitWidget position="tl">
          <div className="font-mono text-[9px] uppercase tracking-wider text-white/40">active missions</div>
          <div className="mt-1 flex items-baseline gap-1">
            <TickerNumber value={activeMissions} className="font-mono text-2xl text-white blade-text-glow" />
            <span className="font-mono text-[10px] text-white/40">in flight</span>
          </div>
          <div className="mt-2 flex gap-1">
            {specialists.map((e) => {
              const c = deptColor(e.department).color;
              const count = missions.filter(
                (m) => m.assignedEmployee === e.slug && m.status !== "done" && m.status !== "completed",
              ).length;
              const pct = Math.min(100, count * 20);
              return (
                <div key={e.slug} className="flex-1">
                  <div className="h-1 rounded-full" style={{ background: `${c}33` }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c, boxShadow: `0 0 6px ${c}` }} />
                  </div>
                  <div className="mt-0.5 text-center font-mono text-[8px] uppercase" style={{ color: c }}>
                    {e.name.slice(0, 3)}
                  </div>
                </div>
              );
            })}
            {specialists.length === 0 && (
              <div className="font-mono text-[9px] uppercase text-white/30">— no agents online —</div>
            )}
          </div>
        </OrbitWidget>

        <OrbitWidget position="tr">
          <div className="font-mono text-[9px] uppercase tracking-wider text-white/40">memory</div>
          <div className="mt-1 flex items-baseline gap-1">
            <TickerNumber value={memoryStats?.total ?? 0} className="font-mono text-2xl text-white blade-text-glow" />
            <span className="font-mono text-[10px] text-white/40">stored</span>
          </div>
          <div className="mt-1 font-mono text-[10px] text-white/50">
            avg confidence ·{" "}
            <TickerNumber value={memoryStats?.avgConfidence ?? 0} decimals={2} />
          </div>
        </OrbitWidget>

        <OrbitWidget position="bl">
          <div className="font-mono text-[9px] uppercase tracking-wider text-white/40">delegation feed</div>
          <ul className="mt-1.5 space-y-0.5 max-h-32 overflow-hidden">
            {timeline.slice(0, 4).map((e, i) => {
              const emp = employees.find((x) => x.slug === e.actorSlug);
              const c = emp ? deptColor(emp.department).color : "#DC2626";
              return (
                <li key={`${e.id}-${i}`} className="flex items-center gap-1.5 font-mono text-[10px]">
                  <span className="h-1.5 w-1.5 rounded-full blade-pulse" style={{ background: c, boxShadow: `0 0 6px ${c}` }} />
                  {emp && <span style={{ color: c }}>{emp.name}:</span>}
                  <span className="truncate text-white/55">{e.summary}</span>
                </li>
              );
            })}
            {timeline.length === 0 && (
              <li className="font-mono text-[10px] text-white/30">— no activity —</li>
            )}
          </ul>
        </OrbitWidget>

        <OrbitWidget position="br">
          <div className="font-mono text-[9px] uppercase tracking-wider text-white/40">session</div>
          <div className="mt-1 font-mono text-2xl text-white blade-text-glow" suppressHydrationWarning>{sessionDuration()}</div>
          <div className="mt-1 font-mono text-[10px] text-white/50">
            cost · $<TickerNumber value={todayCost} decimals={2} />
          </div>
        </OrbitWidget>

        {/* Visualizer column */}
        <div className="relative z-10 flex flex-col items-center">
          {token && roomName ? (
            <LiveKitRoom
              serverUrl={livekitUrl}
              token={token}
              connect={true}
              audio={true}
              video={false}
              onConnected={() => setVoiceState("listening")}
              onDisconnected={() => setVoiceState("idle")}
              style={{ background: "transparent", display: "contents" }}
            >
              <RoomAudioRenderer />
              <VoiceAgentUI dispatchTo={dispatchTo} />
            </LiveKitRoom>
          ) : (
            <VoiceVisualizer
              state={voiceState}
              dispatchTo={dispatchTo}
              size={340}
            />
          )}

          <div className="mt-6 text-center">
            {(() => {
              const chief = employees.find((e) => e.department === "leadership") ?? employees.find((e) => e.slug === "chief-of-staff");
              const chiefName = chief?.name ?? "BLADE";
              const chiefTitle = chief?.title ?? "chief of staff";
              return (
                <>
                  <div className="blade-tracked blade-text-glow font-mono text-3xl font-bold text-white">{chiefName.toUpperCase()}</div>
                  <div className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.3em] text-white/50">{chiefTitle}</div>
                </>
              );
            })()}
            <div className="mx-auto mt-2 h-px w-16 bg-gradient-to-r from-transparent via-[var(--blade-red)] to-transparent" />
          </div>
        </div>
      </div>

      {/* Transcript + controls */}
      <div className="relative z-10 border-t border-[var(--blade-border)] bg-black/40 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl flex-col gap-2 px-4 py-4">
          <div className="flex max-h-32 flex-col-reverse gap-1.5 overflow-y-auto">
            {[...feedItems].reverse().map((m) => {
              const isYou = m.role === "you";
              return (
                <div key={m.id} className={`flex ${isYou ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] ${isYou ? "text-right" : "text-left"}`}>
                    <div className="mb-0.5 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider">
                      {isYou ? (
                        <span className="text-white/40">[YOU]</span>
                      ) : (
                        <>
                          <span className="text-[var(--blade-red)]">
                            {m.via
                              ? `[${m.via.toUpperCase()}]`
                              : `[${(employees.find((e) => e.department === "leadership")?.name ?? "BLADE").toUpperCase()}]`}
                          </span>
                          {m.via && (
                            <span className="rounded-sm border border-white/20 px-1.5 py-0.5 text-white/60">
                              via {m.via}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    <div className={`rounded-md px-3 py-1.5 text-sm ${isYou ? "bg-white/5 text-white/80" : "bg-[var(--blade-red)]/10 text-white/90 border border-[var(--blade-red)]/30"}`}>
                      {m.text}
                    </div>
                  </div>
                </div>
              );
            })}
            {feedItems.length === 0 && (
              <div className="text-center font-mono text-[10px] uppercase text-white/30">
                — awaiting voice or activity —
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <button className="flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-white/50 transition-colors hover:border-white/30 hover:text-white/80">
              <Activity size={12} />
              transcript
            </button>

            <button
              onClick={toggleMute}
              className="relative flex h-16 w-16 items-center justify-center rounded-full transition-all"
              style={{
                background: !isMuted ? "radial-gradient(circle, #DC2626 0%, #991B1B 100%)" : "rgba(255,255,255,0.04)",
                border: `2px solid ${!isMuted ? "#FF3333" : "rgba(220,38,38,0.4)"}`,
                boxShadow: !isMuted ? "0 0 32px rgba(220,38,38,0.7)" : "0 0 12px rgba(220,38,38,0.3)",
              }}
              title={isMuted ? "Unmute mic" : "Mute mic"}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={isMuted ? "muted" : "live"}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                >
                  {isMuted ? <MicOff size={24} color="#DC2626" /> : <Mic size={24} color="white" />}
                </motion.div>
              </AnimatePresence>
              {!isMuted && (
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-[var(--blade-ember)]"
                  initial={{ scale: 1, opacity: 0.6 }}
                  animate={{ scale: 1.6, opacity: 0 }}
                  transition={{ duration: 1.4, repeat: Infinity }}
                />
              )}
            </button>

            <button
              onClick={() => setVoiceState("idle")}
              className="flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-white/50 transition-colors hover:border-[var(--blade-red)] hover:text-white/80"
            >
              <Square size={12} />
              end session
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
