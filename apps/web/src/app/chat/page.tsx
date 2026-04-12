'use client'

import { useState } from 'react'
import { ChatPanel } from '@/components/chat/chat-panel'
import { Sidebar } from '@/components/chat/sidebar'

export default function ChatPage() {
  const [conversationId, setConversationId] = useState<string | undefined>()

  return (
    <div className="flex h-[calc(100vh-64px)] bg-zinc-950">
      <Sidebar
        currentConversationId={conversationId}
        onSelectConversation={(id) => setConversationId(id)}
        onNewChat={() => setConversationId(undefined)}
      />
      <div className="flex-1 overflow-hidden">
        <ChatPanel conversationId={conversationId} />
      </div>
    </div>
  )
}
