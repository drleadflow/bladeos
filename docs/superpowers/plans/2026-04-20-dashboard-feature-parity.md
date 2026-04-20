# Dashboard Feature Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add text chat (command bar + drawer), file upload, and shared cross-channel conversation to the Command Center dashboard.

**Architecture:** The backend already has `POST /api/chat` (SSE streaming) and `GET /api/chat?conversationId=` (history). We need frontend components: a persistent CommandBar on every page, a ChatDrawer that slides from the right, SSE streaming support, file upload, and Zustand store integration. The chat endpoint uses the existing `ConversationEngine` which handles memory, tools, and message persistence.

**Tech Stack:** React 19, TanStack Router, Zustand, Tailwind CSS, Framer Motion, lucide-react, SSE (EventSource)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/command/src/components/blade/ChannelBadge.tsx` | Create | Small badge showing message origin |
| `apps/command/src/components/blade/ToolCallCard.tsx` | Create | Collapsible tool usage display |
| `apps/command/src/components/blade/ChatMessage.tsx` | Create | Single message with badge + tool cards |
| `apps/command/src/components/blade/FileUploadZone.tsx` | Create | Drag-and-drop upload area |
| `apps/command/src/components/blade/ChatDrawer.tsx` | Create | Slide-out full chat panel |
| `apps/command/src/components/blade/CommandBar.tsx` | Create | Persistent input bar on every page |
| `apps/command/src/hooks/use-chat.ts` | Create | SSE streaming hook for chat |
| `apps/command/src/stores/blade-store.ts` | Modify | Add chat state and actions |
| `apps/command/src/components/blade/AppShell.tsx` | Modify | Mount CommandBar and ChatDrawer |
| `apps/web/src/app/api/upload/route.ts` | Create | File upload endpoint |

---

### Task 1: Chat SSE Hook

**Files:**
- Create: `apps/command/src/hooks/use-chat.ts`

- [ ] **Step 1: Create the SSE streaming hook**

```typescript
// apps/command/src/hooks/use-chat.ts
import { useCallback, useRef, useState } from "react";
import { API_URL } from "@/lib/api";

const AUTH_TOKEN = import.meta.env.VITE_BLADE_TOKEN as string | undefined;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  channel?: string;
  toolCalls?: Array<{ name: string; input: string; result: string }>;
  timestamp: string;
}

interface UseChatReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  conversationId: string | null;
  sendMessage: (text: string) => void;
  loadHistory: (convId: string) => Promise<void>;
  clearMessages: () => void;
}

let msgCounter = 0;

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadHistory = useCallback(async (convId: string) => {
    try {
      const headers: Record<string, string> = {};
      if (AUTH_TOKEN) headers["Authorization"] = `Bearer ${AUTH_TOKEN}`;

      const res = await fetch(
        `${API_URL}/api/chat?conversationId=${convId}`,
        { headers }
      );
      const json = await res.json();
      if (json.success && json.data) {
        const history: ChatMessage[] = json.data.map(
          (m: Record<string, unknown>) => ({
            id: String(m.id ?? ++msgCounter),
            role: m.role as "user" | "assistant",
            content: String(m.content ?? ""),
            channel: m.channel as string | undefined,
            timestamp: String(m.createdAt ?? new Date().toISOString()),
          })
        );
        setMessages(history);
        setConversationId(convId);
      }
    } catch (err) {
      console.error("[chat] loadHistory error", err);
    }
  }, []);

  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim() || isStreaming) return;

      // Add user message immediately
      const userMsg: ChatMessage = {
        id: String(++msgCounter),
        role: "user",
        content: text,
        channel: "dashboard",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);

      // Add placeholder for assistant
      const assistantId = String(++msgCounter);
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          channel: "dashboard",
          timestamp: new Date().toISOString(),
        },
      ]);

      // Stream via SSE
      const abort = new AbortController();
      abortRef.current = abort;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (AUTH_TOKEN) headers["Authorization"] = `Bearer ${AUTH_TOKEN}`;

      fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: text,
          conversationId,
        }),
        signal: abort.signal,
      })
        .then(async (res) => {
          if (!res.ok || !res.body) {
            setIsStreaming(false);
            return;
          }

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
                const type = event.type as string;

                if (type === "text_delta") {
                  fullText += String(event.text ?? "");
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId ? { ...m, content: fullText } : m
                    )
                  );
                } else if (type === "conversation_id") {
                  newConvId = String(event.conversationId);
                }
              } catch {
                // Skip malformed events
              }
            }
          }

          if (newConvId) setConversationId(newConvId);
          setIsStreaming(false);
        })
        .catch((err) => {
          if (err.name !== "AbortError") {
            console.error("[chat] stream error", err);
          }
          setIsStreaming(false);
        });
    },
    [conversationId, isStreaming]
  );

  const clearMessages = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setConversationId(null);
    setIsStreaming(false);
  }, []);

  return { messages, isStreaming, conversationId, sendMessage, loadHistory, clearMessages };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/command/src/hooks/use-chat.ts
git commit -m "feat(dashboard): add useChat SSE streaming hook"
```

---

### Task 2: Small UI Components — ChannelBadge, ToolCallCard, ChatMessage

**Files:**
- Create: `apps/command/src/components/blade/ChannelBadge.tsx`
- Create: `apps/command/src/components/blade/ToolCallCard.tsx`
- Create: `apps/command/src/components/blade/ChatMessage.tsx`

- [ ] **Step 1: Create ChannelBadge**

```tsx
// apps/command/src/components/blade/ChannelBadge.tsx
const channelConfig: Record<string, { label: string; color: string }> = {
  dashboard: { label: "DASH", color: "#3B82F6" },
  telegram: { label: "TG", color: "#229ED9" },
  voice: { label: "VOICE", color: "#DC2626" },
};

export function ChannelBadge({ channel }: { channel?: string }) {
  if (!channel) return null;
  const cfg = channelConfig[channel] ?? { label: channel.toUpperCase(), color: "#666" };
  return (
    <span
      className="inline-block rounded-sm px-1 py-0.5 font-mono text-[8px] uppercase tracking-wider"
      style={{ background: `${cfg.color}22`, color: cfg.color, border: `1px solid ${cfg.color}44` }}
    >
      {cfg.label}
    </span>
  );
}
```

- [ ] **Step 2: Create ToolCallCard**

```tsx
// apps/command/src/components/blade/ToolCallCard.tsx
import { useState } from "react";
import { ChevronDown, ChevronRight, Wrench } from "lucide-react";

interface ToolCall {
  name: string;
  input: string;
  result: string;
}

export function ToolCallCard({ tool }: { tool: ToolCall }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="my-1 rounded-sm border border-white/10 bg-white/5 font-mono text-[10px]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-white/50 hover:text-white/70"
      >
        <Wrench size={10} />
        <span className="text-white/70">{tool.name}</span>
        {open ? <ChevronDown size={10} className="ml-auto" /> : <ChevronRight size={10} className="ml-auto" />}
      </button>
      {open && (
        <div className="border-t border-white/10 px-2 py-1 text-white/40">
          <div className="mb-0.5 text-[9px] text-white/30">Result:</div>
          <div className="max-h-24 overflow-y-auto whitespace-pre-wrap">{tool.result.slice(0, 500)}</div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create ChatMessage**

```tsx
// apps/command/src/components/blade/ChatMessage.tsx
import { ChannelBadge } from "./ChannelBadge";
import { ToolCallCard } from "./ToolCallCard";
import type { ChatMessage as ChatMessageType } from "@/hooks/use-chat";

export function ChatMessage({ msg }: { msg: ChatMessageType }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] ${isUser ? "text-right" : "text-left"}`}>
        <div className="mb-0.5 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider">
          {isUser ? (
            <span className="text-white/40">[YOU]</span>
          ) : (
            <span className="text-[var(--blade-red)]">[BLADE]</span>
          )}
          <ChannelBadge channel={msg.channel} />
        </div>
        <div
          className={`rounded-md px-3 py-2 text-sm leading-relaxed ${
            isUser
              ? "bg-white/5 text-white/80"
              : "border border-[var(--blade-red)]/20 bg-[var(--blade-red)]/5 text-white/90"
          }`}
        >
          <div className="whitespace-pre-wrap">{msg.content}</div>
          {msg.toolCalls?.map((tc, i) => (
            <ToolCallCard key={i} tool={tc} />
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/command/src/components/blade/ChannelBadge.tsx apps/command/src/components/blade/ToolCallCard.tsx apps/command/src/components/blade/ChatMessage.tsx
git commit -m "feat(dashboard): add ChannelBadge, ToolCallCard, ChatMessage components"
```

---

### Task 3: ChatDrawer — Full Chat Panel

**Files:**
- Create: `apps/command/src/components/blade/ChatDrawer.tsx`

- [ ] **Step 1: Create the drawer component**

```tsx
// apps/command/src/components/blade/ChatDrawer.tsx
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Send, Paperclip } from "lucide-react";
import { ChatMessage } from "./ChatMessage";
import { useChat } from "@/hooks/use-chat";

interface ChatDrawerProps {
  open: boolean;
  onClose: () => void;
  initialMessage?: string;
}

export function ChatDrawer({ open, onClose, initialMessage }: ChatDrawerProps) {
  const { messages, isStreaming, sendMessage } = useChat();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sentInitial = useRef(false);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open]);

  // Send initial message if provided (from command bar expansion)
  useEffect(() => {
    if (open && initialMessage && !sentInitial.current) {
      sentInitial.current = true;
      sendMessage(initialMessage);
    }
  }, [open, initialMessage, sendMessage]);

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    sendMessage(input);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ x: 400, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 400, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed right-0 top-0 z-50 flex h-screen w-[400px] flex-col border-l border-[var(--blade-border)] bg-[#0a0a0f]/95 backdrop-blur-xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--blade-border)] px-4 py-3">
            <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/60">
              blade chat
            </div>
            <button
              onClick={onClose}
              className="text-white/40 transition-colors hover:text-white/80"
            >
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="py-12 text-center font-mono text-[10px] uppercase text-white/20">
                — start a conversation —
              </div>
            )}
            {messages.map((m) => (
              <ChatMessage key={m.id} msg={m} />
            ))}
            {isStreaming && messages[messages.length - 1]?.content === "" && (
              <div className="font-mono text-[10px] text-[var(--blade-red)] animate-pulse">
                thinking...
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-[var(--blade-border)] px-4 py-3">
            <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message Blade..."
                className="flex-1 bg-transparent font-mono text-sm text-white outline-none placeholder:text-white/20"
                disabled={isStreaming}
              />
              <button
                onClick={handleSend}
                disabled={isStreaming || !input.trim()}
                className="text-white/40 transition-colors hover:text-[var(--blade-red)] disabled:opacity-30"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/command/src/components/blade/ChatDrawer.tsx
git commit -m "feat(dashboard): add ChatDrawer slide-out panel with SSE streaming"
```

---

### Task 4: CommandBar — Persistent Input

**Files:**
- Create: `apps/command/src/components/blade/CommandBar.tsx`

- [ ] **Step 1: Create the command bar**

```tsx
// apps/command/src/components/blade/CommandBar.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Send, ChevronUp } from "lucide-react";
import { useChat } from "@/hooks/use-chat";
import { ChatMessage } from "./ChatMessage";

interface CommandBarProps {
  onExpandToDrawer: (message?: string) => void;
}

export function CommandBar({ onExpandToDrawer }: CommandBarProps) {
  const [input, setInput] = useState("");
  const [showInline, setShowInline] = useState(false);
  const { messages, isStreaming, sendMessage } = useChat();
  const inputRef = useRef<HTMLInputElement>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Auto-dismiss inline response after 10 seconds if single message
  useEffect(() => {
    if (showInline && !isStreaming && messages.length <= 2) {
      dismissTimer.current = setTimeout(() => setShowInline(false), 10_000);
      return () => {
        if (dismissTimer.current) clearTimeout(dismissTimer.current);
      };
    }
  }, [showInline, isStreaming, messages.length]);

  // If conversation goes multi-turn (>2 messages), expand to drawer
  useEffect(() => {
    if (messages.length > 2 && showInline) {
      setShowInline(false);
      onExpandToDrawer();
    }
  }, [messages.length, showInline, onExpandToDrawer]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isStreaming) return;
    sendMessage(input);
    setInput("");
    setShowInline(true);
  }, [input, isStreaming, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === "Escape") {
      setShowInline(false);
      inputRef.current?.blur();
    }
  };

  const lastAssistantMsg = messages.filter((m) => m.role === "assistant").slice(-1)[0];

  return (
    <div className="fixed bottom-0 left-16 right-0 z-40">
      {/* Inline response */}
      <AnimatePresence>
        {showInline && lastAssistantMsg && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            className="mx-auto mb-2 max-w-2xl px-4"
          >
            <div className="rounded-md border border-[var(--blade-border)] bg-[#0a0a0f]/95 p-3 backdrop-blur-xl">
              <ChatMessage msg={lastAssistantMsg} />
              <button
                onClick={() => { setShowInline(false); onExpandToDrawer(); }}
                className="mt-2 flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-white/30 hover:text-white/60"
              >
                <ChevronUp size={10} /> expand to chat
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input bar */}
      <div className="border-t border-[var(--blade-border)] bg-[#050508]/90 backdrop-blur-xl px-4 py-2">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <button
            onClick={() => onExpandToDrawer()}
            className="text-white/30 hover:text-white/60 transition-colors"
            title="Open chat"
          >
            <MessageSquare size={16} />
          </button>
          <div className="flex flex-1 items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Blade anything... (⌘K)"
              className="flex-1 bg-transparent font-mono text-sm text-white outline-none placeholder:text-white/20"
              disabled={isStreaming}
            />
            <button
              onClick={handleSend}
              disabled={isStreaming || !input.trim()}
              className="text-white/40 hover:text-[var(--blade-red)] disabled:opacity-30 transition-colors"
            >
              <Send size={14} />
            </button>
          </div>
          <span className="font-mono text-[9px] text-white/15">⌘K</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/command/src/components/blade/CommandBar.tsx
git commit -m "feat(dashboard): add CommandBar with Cmd+K shortcut and inline responses"
```

---

### Task 5: Mount CommandBar and ChatDrawer in AppShell

**Files:**
- Modify: `apps/command/src/components/blade/AppShell.tsx`

- [ ] **Step 1: Update AppShell to include CommandBar and ChatDrawer**

Read `apps/command/src/components/blade/AppShell.tsx`, then add the imports and components:

Add imports at the top:

```tsx
import { useState, useCallback } from "react";
import { CommandBar } from "./CommandBar";
import { ChatDrawer } from "./ChatDrawer";
```

Inside the `AppShell` function, add state and handlers before the return:

```tsx
  const [chatOpen, setChatOpen] = useState(false);
  const [initialChatMessage, setInitialChatMessage] = useState<string | undefined>();

  const handleExpandToDrawer = useCallback((message?: string) => {
    setInitialChatMessage(message);
    setChatOpen(true);
  }, []);
```

Add the components inside the root div, after the `<Toaster>`:

```tsx
      <CommandBar onExpandToDrawer={handleExpandToDrawer} />
      <ChatDrawer
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        initialMessage={initialChatMessage}
      />
```

Also update the `<main>` to add bottom padding so content isn't hidden behind the command bar:

```tsx
        <main className="relative flex-1 overflow-hidden pb-14">
```

- [ ] **Step 2: Verify it renders**

Run the Vite dev server and open http://localhost:5174. The command bar should appear at the bottom of every page.

- [ ] **Step 3: Commit**

```bash
git add apps/command/src/components/blade/AppShell.tsx
git commit -m "feat(dashboard): mount CommandBar and ChatDrawer in AppShell"
```

---

### Task 6: File Upload Endpoint

**Files:**
- Create: `apps/web/src/app/api/upload/route.ts`

- [ ] **Step 1: Create the upload route**

```typescript
// apps/web/src/app/api/upload/route.ts
import { NextRequest } from 'next/server'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import crypto from 'node:crypto'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'

export const runtime = 'nodejs'

const UPLOAD_DIR = join(process.cwd(), 'uploads')
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(req: NextRequest): Promise<Response> {
  const auth = requireAuth(req)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return Response.json({ success: false, error: 'No file provided' }, { status: 400 })
    }

    if (file.size > MAX_SIZE) {
      return Response.json({ success: false, error: 'File too large (max 10MB)' }, { status: 400 })
    }

    const fileId = crypto.randomUUID().slice(0, 12)
    const ext = file.name.split('.').pop() ?? 'bin'
    const filename = `${fileId}.${ext}`

    await mkdir(UPLOAD_DIR, { recursive: true })
    const buffer = Buffer.from(await file.arrayBuffer())
    const filePath = join(UPLOAD_DIR, filename)
    await writeFile(filePath, buffer)

    return Response.json({
      success: true,
      data: {
        fileId,
        filename,
        url: `/uploads/${filename}`,
        mimeType: file.type,
        size: file.size,
      },
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Upload failed'
    logger.error('Upload', `error: ${msg}`)
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/upload/route.ts
git commit -m "feat(api): add file upload endpoint with 10MB limit"
```

---

### Task 7: FileUploadZone Component

**Files:**
- Create: `apps/command/src/components/blade/FileUploadZone.tsx`

- [ ] **Step 1: Create the upload zone**

```tsx
// apps/command/src/components/blade/FileUploadZone.tsx
import { useCallback, useState } from "react";
import { Upload, Loader2, CheckCircle, XCircle } from "lucide-react";
import { API_URL } from "@/lib/api";

const AUTH_TOKEN = import.meta.env.VITE_BLADE_TOKEN as string | undefined;

interface FileUploadZoneProps {
  onUploadComplete?: (file: { fileId: string; url: string; mimeType: string }) => void;
  accept?: string;
  label?: string;
}

export function FileUploadZone({
  onUploadComplete,
  accept = "image/*,.pdf,.txt,.csv,.md",
  label = "Drop files here or click to upload",
}: FileUploadZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  const upload = useCallback(
    async (file: File) => {
      setUploading(true);
      setStatus("idle");

      const form = new FormData();
      form.append("file", file);

      try {
        const headers: Record<string, string> = {};
        if (AUTH_TOKEN) headers["Authorization"] = `Bearer ${AUTH_TOKEN}`;

        const res = await fetch(`${API_URL}/api/upload`, {
          method: "POST",
          headers,
          body: form,
        });
        const json = await res.json();

        if (json.success && json.data) {
          setStatus("success");
          onUploadComplete?.(json.data);
        } else {
          setStatus("error");
        }
      } catch {
        setStatus("error");
      } finally {
        setUploading(false);
        setTimeout(() => setStatus("idle"), 3000);
      }
    },
    [onUploadComplete]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) upload(file);
    },
    [upload]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) upload(file);
    },
    [upload]
  );

  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed p-8 transition-all ${
        dragging
          ? "border-[var(--blade-red)] bg-[var(--blade-red)]/10"
          : "border-white/10 bg-white/5 hover:border-white/20"
      }`}
    >
      <input type="file" accept={accept} onChange={handleFileSelect} className="hidden" />
      {uploading ? (
        <Loader2 size={24} className="animate-spin text-white/40" />
      ) : status === "success" ? (
        <CheckCircle size={24} className="text-green-500" />
      ) : status === "error" ? (
        <XCircle size={24} className="text-red-500" />
      ) : (
        <Upload size={24} className="text-white/30" />
      )}
      <div className="mt-2 font-mono text-[10px] uppercase tracking-wider text-white/30">
        {uploading ? "uploading..." : label}
      </div>
    </label>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/command/src/components/blade/FileUploadZone.tsx
git commit -m "feat(dashboard): add FileUploadZone drag-and-drop component"
```

---

### Task 8: Add Chat Nav Item to LeftNav

**Files:**
- Modify: `apps/command/src/components/blade/LeftNav.tsx`

- [ ] **Step 1: Add MessageSquare to the nav**

Read `apps/command/src/components/blade/LeftNav.tsx`. Find the nav items array or list. Add a new item for Chat that opens the drawer instead of navigating.

Add `MessageSquare` to the lucide-react imports. Add a chat button to the nav that dispatches a custom event to open the drawer:

```tsx
// Add to the nav items, between Command and Council:
{ icon: MessageSquare, label: "CHAT", onClick: () => window.dispatchEvent(new CustomEvent("blade:open-chat")) }
```

Then in `AppShell.tsx`, listen for this event:

```tsx
  useEffect(() => {
    const handler = () => setChatOpen(true);
    window.addEventListener("blade:open-chat", handler);
    return () => window.removeEventListener("blade:open-chat", handler);
  }, []);
```

- [ ] **Step 2: Commit**

```bash
git add apps/command/src/components/blade/LeftNav.tsx apps/command/src/components/blade/AppShell.tsx
git commit -m "feat(dashboard): add Chat nav item to LeftNav sidebar"
```
