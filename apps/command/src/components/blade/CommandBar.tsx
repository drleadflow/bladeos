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

  useEffect(() => {
    if (showInline && !isStreaming && messages.length <= 2) {
      dismissTimer.current = setTimeout(() => setShowInline(false), 10_000);
      return () => { if (dismissTimer.current) clearTimeout(dismissTimer.current); };
    }
  }, [showInline, isStreaming, messages.length]);

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
