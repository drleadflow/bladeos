'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChatPanel } from '@/components/chat/chat-panel'
import { Sidebar } from '@/components/chat/sidebar'

export default function Home() {
  const router = useRouter()
  const [conversationId, setConversationId] = useState<string | undefined>()
  const [chatKey, setChatKey] = useState(0)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function checkEmployees() {
      try {
        const res = await fetch('/api/employees')
        const data = await res.json()

        if (data.success) {
          const active = (data.data as { active: boolean }[]).filter((e) => e.active)
          if (active.length === 0) {
            router.replace('/onboarding')
            return
          }
        }
      } catch {
        // If the API fails, show the chat anyway
      }
      setReady(true)
    }

    checkEmployees()
  }, [router])

  const handleNewChat = useCallback(() => {
    setConversationId(undefined)
    setChatKey((prev) => prev + 1)
  }, [])

  const handleSelectConversation = useCallback((id: string) => {
    setConversationId(id)
    setChatKey((prev) => prev + 1)
  }, [])

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex h-screen">
      <Sidebar
        currentConversationId={conversationId}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
      />
      <div className="flex-1">
        <ChatPanel key={chatKey} conversationId={conversationId} />
      </div>
    </div>
  )
}
