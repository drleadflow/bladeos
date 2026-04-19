import { useCallback, useEffect, useState } from "react";
import { useBladeStore } from "@/stores/blade-store";

const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  "https://blade-web-production.up.railway.app";
const AUTH_TOKEN = import.meta.env.VITE_BLADE_TOKEN as string | undefined;
const LIVEKIT_URL =
  (import.meta.env.VITE_LIVEKIT_URL as string | undefined) ??
  "wss://superagent-9p7whlmp.livekit.cloud";

export interface VoiceWsReturn {
  token: string | null;
  roomName: string | null;
  livekitUrl: string;
}

/**
 * LiveKit voice agent hook.
 * Fetches a short-lived token from the backend which lets the browser
 * join a LiveKit room. The Blade voice agent auto-joins the same room
 * on the server side and handles all audio.
 *
 * Returns the token and room URL needed by the LiveKitRoom component.
 * All AudioContext / WebSocket management is handled by livekit-client.
 */
export function useVoiceWS(enabled: boolean): VoiceWsReturn {
  const [token, setToken] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);
  const setVoiceState = useBladeStore((s) => s.setVoiceState);

  const fetchToken = useCallback(async () => {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (AUTH_TOKEN) {
        headers["Authorization"] = `Bearer ${AUTH_TOKEN}`;
      }

      const res = await fetch(`${API_URL}/api/voice/token`, {
        method: "POST",
        headers,
        body: JSON.stringify({ roomName: `blade-voice-${Date.now()}` }),
      });

      const json = (await res.json()) as {
        success: boolean;
        data?: { token: string; roomName: string };
        error?: string;
      };

      if (json.success && json.data) {
        setToken(json.data.token);
        setRoomName(json.data.roomName);
        setVoiceState("listening");
      } else {
        console.error("[voice] token error:", json.error);
        setVoiceState("idle");
      }
    } catch (err: unknown) {
      console.error("[voice] failed to get token:", err);
      setVoiceState("idle");
    }
  }, [setVoiceState]);

  useEffect(() => {
    if (!enabled) return;

    fetchToken();

    return () => {
      setToken(null);
      setRoomName(null);
    };
  }, [enabled, fetchToken]);

  return { token, roomName, livekitUrl: LIVEKIT_URL };
}
