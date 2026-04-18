import { useEffect, useRef } from "react";
import { VOICE_WS_URL } from "@/lib/api";
import { useBladeStore } from "@/stores/blade-store";

/**
 * Always-on Pipecat voice WebSocket.
 * - Captures mic at 16kHz, streams int16 PCM frames upstream.
 * - Plays binary audio frames returned from the backend.
 * - Reflects agent state (listening/thinking/speaking) into the store.
 *
 * Mic is gated by `isMuted`. The socket itself stays open.
 */
export function useVoiceWS(enabled: boolean) {
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mutedRef = useRef(true);

  const setVoiceState = useBladeStore((s) => s.setVoiceState);
  const setActiveEmployee = useBladeStore((s) => s.setActiveEmployee);
  const pushTranscript = useBladeStore((s) => s.pushTranscript);
  const isMuted = useBladeStore((s) => s.isMuted);

  useEffect(() => {
    mutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let cancelled = false;
    let processor: ScriptProcessorNode | null = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const start = async () => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(VOICE_WS_URL);
      } catch (e) {
        console.warn("[voice] cannot open WS", e);
        return;
      }
      wsRef.current = ws;
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        if (!mutedRef.current) setVoiceState("listening");
      };

      ws.onmessage = async (event) => {
        if (typeof event.data === "string") {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "transcript") {
              pushTranscript({
                role: msg.role === "user" ? "you" : "agent",
                text: msg.text,
                via: msg.agent,
              });
            } else if (msg.type === "agent_speaking") {
              setVoiceState("speaking");
            } else if (msg.type === "agent_thinking") {
              setVoiceState("thinking");
              if (msg.agent) setActiveEmployee(msg.agent);
            } else if (msg.type === "agent_done") {
              setVoiceState(mutedRef.current ? "idle" : "listening");
              setActiveEmployee(null);
            }
          } catch {
            /* ignore */
          }
        } else {
          // Binary audio playback (assume int16 PCM mono 24kHz from Gemini).
          try {
            const ctx = audioCtxRef.current;
            if (!ctx) return;
            const buf = new Int16Array(event.data as ArrayBuffer);
            const float = new Float32Array(buf.length);
            for (let i = 0; i < buf.length; i++) float[i] = buf[i] / 32768;
            const audioBuf = ctx.createBuffer(1, float.length, 24000);
            audioBuf.getChannelData(0).set(float);
            const src = ctx.createBufferSource();
            src.buffer = audioBuf;
            src.connect(ctx.destination);
            src.start();
          } catch {
            /* ignore */
          }
        }
      };

      ws.onerror = () => {
        /* swallow; UI will reflect via store */
      };
      ws.onclose = () => {
        setVoiceState("idle");
        if (!cancelled && reconnectAttempts < maxReconnectAttempts) {
          const delay = Math.min(1000 * 2 ** reconnectAttempts, 30000);
          reconnectAttempts++;
          reconnectTimer = setTimeout(() => {
            if (!cancelled) start();
          }, delay);
        }
      };

      // Mic capture
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { sampleRate: 16000, echoCancellation: true, noiseSuppression: true },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const ctx = new AudioContext({ sampleRate: 16000 });
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        processor = ctx.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (e) => {
          if (mutedRef.current) return;
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
          const f32 = e.inputBuffer.getChannelData(0);
          const i16 = new Int16Array(f32.length);
          for (let i = 0; i < f32.length; i++) {
            i16[i] = Math.max(-32768, Math.min(32767, Math.round(f32[i] * 32767)));
          }
          wsRef.current.send(i16.buffer);
        };
        source.connect(processor);
        processor.connect(ctx.destination);
      } catch (e) {
        console.warn("[voice] mic permission denied", e);
      }
    };

    start();

    return () => {
      cancelled = true;
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      processor?.disconnect();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close().catch(() => {});
      wsRef.current?.close();
      wsRef.current = null;
      audioCtxRef.current = null;
      streamRef.current = null;
    };
  }, [enabled, setVoiceState, setActiveEmployee, pushTranscript]);
}
