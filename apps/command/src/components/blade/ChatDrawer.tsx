import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Send } from "lucide-react";
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 200);
  }, [open]);

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
          <div className="flex items-center justify-between border-b border-[var(--blade-border)] px-4 py-3">
            <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/60">
              blade chat
            </div>
            <button onClick={onClose} className="text-white/40 transition-colors hover:text-white/80">
              <X size={16} />
            </button>
          </div>

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
