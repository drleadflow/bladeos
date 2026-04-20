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
