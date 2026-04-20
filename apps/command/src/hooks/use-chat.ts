import { useCallback, useRef, useState } from "react";

const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  "https://blade-web-production.up.railway.app";
const AUTH_TOKEN = import.meta.env.VITE_BLADE_TOKEN as string | undefined;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  channel?: string;
  toolCalls?: Array<{ name: string; input: string; result: string }>;
  timestamp: string;
}

let msgCounter = 0;

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadHistory = useCallback(async (convId: string) => {
    try {
      const headers: Record<string, string> = {};
      if (AUTH_TOKEN) headers["Authorization"] = `Bearer ${AUTH_TOKEN}`;
      const res = await fetch(`${API_URL}/api/chat?conversationId=${convId}`, { headers });
      const json = await res.json();
      if (json.success && json.data) {
        const history: ChatMessage[] = json.data.map((m: Record<string, unknown>) => ({
          id: String(m.id ?? ++msgCounter),
          role: m.role as "user" | "assistant",
          content: String(m.content ?? ""),
          channel: m.channel as string | undefined,
          timestamp: String(m.createdAt ?? new Date().toISOString()),
        }));
        setMessages(history);
        setConversationId(convId);
      }
    } catch (err) {
      console.error("[chat] loadHistory error", err);
    }
  }, []);

  const sendMessage = useCallback((text: string) => {
    if (!text.trim() || isStreaming) return;

    const userMsg: ChatMessage = {
      id: String(++msgCounter),
      role: "user",
      content: text,
      channel: "dashboard",
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);

    const assistantId = String(++msgCounter);
    setMessages((prev) => [...prev, {
      id: assistantId,
      role: "assistant",
      content: "",
      channel: "dashboard",
      timestamp: new Date().toISOString(),
    }]);

    const abort = new AbortController();
    abortRef.current = abort;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (AUTH_TOKEN) headers["Authorization"] = `Bearer ${AUTH_TOKEN}`;

    fetch(`${API_URL}/api/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message: text, conversationId }),
      signal: abort.signal,
    }).then(async (res) => {
      if (!res.ok || !res.body) { setIsStreaming(false); return; }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      let newConvId: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;
          try {
            const event = JSON.parse(data) as Record<string, unknown>;
            if (event.type === "text_delta") {
              fullText += String(event.text ?? "");
              setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: fullText } : m));
            } else if (event.type === "conversation_id") {
              newConvId = String(event.conversationId);
            }
          } catch { /* skip malformed */ }
        }
      }
      if (newConvId) setConversationId(newConvId);
      setIsStreaming(false);
    }).catch((err: unknown) => {
      if (err instanceof Error && err.name !== "AbortError") console.error("[chat] stream error", err);
      setIsStreaming(false);
    });
  }, [conversationId, isStreaming]);

  const clearMessages = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setConversationId(null);
    setIsStreaming(false);
  }, []);

  return { messages, isStreaming, conversationId, sendMessage, loadHistory, clearMessages };
}
