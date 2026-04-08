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
      <div className="flex w-10 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
        <button
          onClick={() => setCollapsed(false)}
          className="p-2 text-zinc-500 transition-colors hover:text-zinc-300"
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
    <div className="flex w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <button
          onClick={onNewChat}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500"
        >
          New Chat
        </button>
        <button
          onClick={() => setCollapsed(true)}
          className="p-1 text-zinc-500 transition-colors hover:text-zinc-300"
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

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <p className="px-3 py-4 text-xs text-zinc-600">
            No conversations yet
          </p>
        ) : (
          <ul className="py-1">
            {conversations.map((conv) => (
              <li key={conv.id}>
                <button
                  onClick={() => onSelectConversation(conv.id)}
                  className={`flex w-full flex-col px-3 py-2 text-left transition-colors ${
                    currentConversationId === conv.id
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                  }`}
                >
                  <span className="truncate text-sm">
                    {conv.title || 'New conversation'}
                  </span>
                  <span className="mt-0.5 text-xs text-zinc-600">
                    {formatTimestamp(conv.updatedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
