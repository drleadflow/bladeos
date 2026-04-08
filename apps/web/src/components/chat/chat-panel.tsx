'use client'

import { useEffect, useRef } from 'react'
import { useBladeChat } from '@/lib/use-chat'
import { useChatStore } from '@/lib/store'
import { MessageList } from './message-list'
import { MessageInput } from './message-input'

interface ChatPanelProps {
  conversationId?: string
}

export function ChatPanel({ conversationId: externalConversationId }: ChatPanelProps) {
  const { messages, isStreaming, totalCost, sendMessage, clearMessages } =
    useBladeChat()
  const { addMessage, setConversationId, clearMessages: resetMessages } = useChatStore()
  const scrollRef = useRef<HTMLDivElement>(null)
  const loadedConvRef = useRef<string | undefined>(undefined)

  // Load conversation history when conversationId prop changes
  useEffect(() => {
    if (!externalConversationId || externalConversationId === loadedConvRef.current) return
    loadedConvRef.current = externalConversationId

    async function loadHistory() {
      try {
        resetMessages()
        const res = await fetch(`/api/chat?conversationId=${externalConversationId}`)
        const data = await res.json()
        if (data.success && Array.isArray(data.data)) {
          setConversationId(externalConversationId!)
          for (const msg of data.data) {
            addMessage({
              id: msg.id,
              role: msg.role as 'user' | 'assistant',
              content: msg.content,
            })
          }
        }
      } catch {
        // Non-critical — start with empty chat
      }
    }

    loadHistory()
  }, [externalConversationId, addMessage, setConversationId, resetMessages])

  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  return (
    <div className="flex h-screen flex-col bg-zinc-950">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900 px-6 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-zinc-100">
            Blade Super Agent
          </h1>
          {messages.length > 0 && (
            <button
              onClick={clearMessages}
              className="rounded-md px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
            >
              New chat
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <span>Cost:</span>
          <span className="font-mono text-zinc-300">
            ${totalCost.toFixed(4)}
          </span>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl">
          <MessageList messages={messages} />
        </div>
      </div>

      {/* Input */}
      <MessageInput onSend={sendMessage} disabled={isStreaming} />
    </div>
  )
}
