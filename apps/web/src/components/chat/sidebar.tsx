'use client'

import { useEffect, useState, useCallback } from 'react'

interface ConversationItem {
  id: string
  title?: string
  createdAt: string
  updatedAt: string
}

interface SidebarProps {
  currentConversationId?: string
  onSelectConversation: (id: string) => void
  onNewChat: () => void
}

export function Sidebar({
  currentConversationId,
  onSelectConversation,
  onNewChat,
}: SidebarProps) {
  const [conversations, setConversations] = useState<ConversationItem[]>([])
  const [collapsed, setCollapsed] = useState(false)

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations')
      const data = await res.json()
      if (data.success) {
        setConversations(data.data)
      }
    } catch {
      // Silently fail - sidebar is non-critical
    }
  }, [])

  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  function formatTimestamp(ts: string): string {
    const date = new Date(ts)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffDays === 0) {
      return date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    }
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  if (collapsed) {
    return (
      <div className="hidden border-r border-white/10 bg-zinc-950/70 lg:flex lg:w-[72px] lg:shrink-0 lg:flex-col">
        <button
          onClick={() => setCollapsed(false)}
          className="m-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-zinc-400 transition-colors hover:border-cyan-400/30 hover:bg-white/10 hover:text-zinc-100"
          aria-label="Expand sidebar"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <aside className="hidden w-[320px] shrink-0 border-r border-white/10 bg-zinc-950/60 lg:flex lg:flex-col">
      <div className="border-b border-white/10 px-4 py-4">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 shadow-[0_10px_40px_rgba(0,0,0,0.25)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-cyan-300/80">
                Workspace
              </p>
              <h2 className="mt-2 text-lg font-semibold text-zinc-100">
                Conversations
              </h2>
            </div>
            <button
              onClick={() => setCollapsed(true)}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-zinc-500 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-zinc-200"
              aria-label="Collapse sidebar"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          </div>

          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Keep context close, jump between threads, and spin up fresh work without losing the thread.
          </p>

          <button
            onClick={onNewChat}
            className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-cyan-400 via-sky-500 to-blue-600 px-4 py-3 text-sm font-semibold text-zinc-950 transition-transform duration-200 hover:scale-[1.01]"
          >
            New Conversation
          </button>
        </div>
      </div>

      <div className="border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-zinc-500">
          <span>Recent</span>
          <span>{conversations.length}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {conversations.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] p-5 text-sm text-zinc-500">
            No conversations yet. Start a new thread and Blade will keep the context here.
          </div>
        ) : (
          <ul className="space-y-2">
            {conversations.map((conv) => (
              <li key={conv.id}>
                <button
                  onClick={() => onSelectConversation(conv.id)}
                  className={`group w-full rounded-2xl border px-4 py-3 text-left transition-all ${
                    currentConversationId === conv.id
                      ? 'border-cyan-400/30 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(34,211,238,0.1)]'
                      : 'border-transparent bg-white/[0.03] hover:border-white/10 hover:bg-white/[0.06]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="line-clamp-2 text-sm font-medium text-zinc-100">
                      {conv.title || 'New conversation'}
                    </span>
                    <span className="whitespace-nowrap text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                      {formatTimestamp(conv.updatedAt)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-400/70" />
                    <span className="group-hover:text-zinc-300">Ready to resume</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-white/10 px-4 py-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
            Focus
          </p>
          <p className="mt-2 text-sm text-zinc-300">
            One pane for memory, one pane for action, one system for follow-through.
          </p>
        </div>
      </div>
    </aside>
  )
}
