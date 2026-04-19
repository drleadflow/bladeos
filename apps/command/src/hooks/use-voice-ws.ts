import { useEffect, useRef } from "react";
import { PipecatClient, RTVIEvent } from "@pipecat-ai/client-js";
import { WebSocketTransport, WavMediaManager } from "@pipecat-ai/websocket-transport";
import { VOICE_WS_URL } from "@/lib/api";
import { useBladeStore } from "@/stores/blade-store";

/**
 * Pipecat voice client using the RTVI protocol.
 * Connects to the Pipecat server via WebSocket transport,
 * captures mic audio, and plays agent responses.
 */
export function useVoiceWS(enabled: boolean) {
  const clientRef = useRef<PipecatClient | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const setVoiceState = useBladeStore((s) => s.setVoiceState);
  const setActiveEmployee = useBladeStore((s) => s.setActiveEmployee);
  const pushTranscript = useBladeStore((s) => s.pushTranscript);
  const isMuted = useBladeStore((s) => s.isMuted);
  const mutedRef = useRef(isMuted);

  useEffect(() => {
    mutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let cancelled = false;

    const start = async () => {
      try {
        const mediaManager = new WavMediaManager(4096, 16000);
        const transport = new WebSocketTransport({
          wsUrl: VOICE_WS_URL,
          mediaManager,
          recorderSampleRate: 16000,
          playerSampleRate: 24000,
        });

        const client = new PipecatClient({
          transport,
          enableMic: true,
          enableCam: false,
          callbacks: {
            onConnected: () => {
              if (!cancelled) setVoiceState("listening");
              // Resume any suspended AudioContexts (browser autoplay policy)
              document.querySelectorAll("audio").forEach((a) => a.play().catch(() => {}));
              if (audioCtxRef.current?.state === "suspended") {
                audioCtxRef.current.resume();
              }
            },
            onDisconnected: () => {
              if (!cancelled) setVoiceState("idle");
            },
          },
        });

        // Resume AudioContext on any user interaction (bypass autoplay policy)
        const resumeAudio = () => {
          if (audioCtxRef.current?.state === "suspended") {
            audioCtxRef.current.resume();
          }
          // Also resume the transport's internal AudioContext if it exists
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const mm = (transport as any)._mediaManager;
            if (mm?._audioContext?.state === "suspended") mm._audioContext.resume();
            if (mm?._playbackAudioContext?.state === "suspended") mm._playbackAudioContext.resume();
          } catch { /* ignore */ }
        };
        document.addEventListener("click", resumeAudio, { once: false });
        document.addEventListener("keydown", resumeAudio, { once: false });

        // Transcripts
        client.on(RTVIEvent.BotTranscript, (data: { text: string }) => {
          pushTranscript({ role: "agent", text: data.text });
          setVoiceState("speaking");
        });

        client.on(RTVIEvent.UserTranscript, (data: { text: string; final: boolean }) => {
          if (data.final) {
            pushTranscript({ role: "you", text: data.text });
          }
        });

        client.on(RTVIEvent.Error, (msg: unknown) => {
          console.error("[voice] RTVI error:", msg);
          setVoiceState("idle");
        });

        clientRef.current = client;
        await client.connect();

        if (cancelled) {
          client.disconnect();
          return;
        }

        // Direct mic capture — bypass WavMediaManager's recorder
        // and feed audio directly into the transport's audio handler
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
        });

        if (cancelled) {
          micStream.getTracks().forEach((t) => t.stop());
          client.disconnect();
          return;
        }

        micStreamRef.current = micStream;
        const audioCtx = new AudioContext({ sampleRate: 16000 });
        audioCtxRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(micStream);
        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (mutedRef.current) return;
          const float32 = e.inputBuffer.getChannelData(0);
          const int16 = new Int16Array(float32.length);
          for (let i = 0; i < float32.length; i++) {
            const s = Math.max(-1, Math.min(1, float32[i]));
            int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
          // Feed Int16Array directly (not .buffer) — matches working War Room pattern
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (transport as any).handleUserAudioStream(int16);
        };

        source.connect(processor);
        processor.connect(audioCtx.destination);

        setVoiceState("listening");
      } catch (err) {
        console.error("[voice] connection failed:", err);
        setVoiceState("idle");
      }
    };

    start();

    return () => {
      cancelled = true;
      processorRef.current?.disconnect();
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close().catch(() => {});
      clientRef.current?.disconnect();
      clientRef.current = null;
      micStreamRef.current = null;
      audioCtxRef.current = null;
      processorRef.current = null;
    };
  }, [enabled, setVoiceState, setActiveEmployee, pushTranscript]);
}
