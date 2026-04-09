'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChatPanel } from '@/components/chat/chat-panel'
import { Sidebar } from '@/components/chat/sidebar'

export default function Home() {
  const router = useRouter()
  const [conversationId, setConversationId] = useState<string | undefined>()
  const [chatKey, setChatKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function checkEmployees() {
      try {
        const res = await fetch('/api/employees')
        if (!res.ok || cancelled) return

        const data = await res.json()
        if (cancelled || !data.success || !Array.isArray(data.data)) return

        const active = (data.data as { active: boolean }[]).filter((e) => e.active)
        if (active.length === 0) {
          router.replace('/onboarding')
        }
      } catch {
        // Non-critical. The chat should still render even if this check fails.
      }
    }

    checkEmployees()

    return () => {
      cancelled = true
    }
  }, [router])

  const handleNewChat = useCallback(() => {
    setConversationId(undefined)
    setChatKey((prev) => prev + 1)
  }, [])

  const handleSelectConversation = useCallback((id: string) => {
    setConversationId(id)
    setChatKey((prev) => prev + 1)
  }, [])

  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-[1600px]">
      <Sidebar
        currentConversationId={conversationId}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
      />
      <div className="min-w-0 flex-1">
        <ChatPanel key={chatKey} conversationId={conversationId} />
      </div>
    </div>
  )
}
