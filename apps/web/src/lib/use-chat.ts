'use client'

import { useCallback } from 'react'
import { useChatStore } from './store'

export function useBladeChat() {
  const {
    messages,
    conversationId,
    isStreaming,
    totalCost,
    addMessage,
    updateLastAssistant,
    appendToolCall,
    setStreaming,
    setConversationId,
    addCost,
    clearMessages,
  } = useChatStore()

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return

      const userMessage = {
        id: crypto.randomUUID(),
        role: 'user' as const,
        content: text,
      }
      addMessage(userMessage)

      const assistantMessage = {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content: '',
      }
      addMessage(assistantMessage)
      setStreaming(true)

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            conversationId,
          }),
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const reader = response.body?.getReader()
        if (!reader) {
          throw new Error('No response body')
        }

        const decoder = new TextDecoder()
        let buffer = ''
        let accumulatedContent = ''
        let currentEventType = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEventType = line.slice(7).trim()
              continue
            }

            if (line.startsWith('data: ')) {
              const rawData = line.slice(6)
              let data: Record<string, unknown>

              try {
                data = JSON.parse(rawData)
              } catch {
                continue
              }

              const eventType = currentEventType || ((data.type as string) ?? '')
              currentEventType = ''

              if (eventType === 'text' || eventType === 'content_block_delta') {
                const token = (data.text as string) ?? (data.delta as string) ?? ''
                accumulatedContent += token
                updateLastAssistant(accumulatedContent)
              } else if (eventType === 'tool_call') {
                appendToolCall({
                  name:
                    (data.name as string) ??
                    (data.toolName as string) ??
                    'unknown',
                  display:
                    (data.display as string) ??
                    (data.name as string) ??
                    (data.toolName as string) ??
                    'Tool call',
                  success: (data.success as boolean) ?? true,
                })
              } else if (eventType === 'done') {
                const finalResponse = (data.finalResponse as string) ?? ''
                if (finalResponse && !accumulatedContent) {
                  accumulatedContent = finalResponse
                  updateLastAssistant(finalResponse)
                }

                if (data.conversationId) {
                  setConversationId(data.conversationId as string)
                }
                const totalCost =
                  typeof data.totalCost === 'number'
                    ? data.totalCost
                    : typeof data.cost === 'number'
                      ? data.cost
                      : null
                if (typeof totalCost === 'number') {
                  addCost(totalCost)
                }
              } else if (eventType === 'error') {
                const errorMessage =
                  (data.error as string) ?? 'An unexpected error occurred'
                updateLastAssistant(`Error: ${errorMessage}`)
              }
            }
          }
        }
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'An unexpected error occurred'
        updateLastAssistant(`Error: ${errorMessage}`)
      } finally {
        setStreaming(false)
      }
    },
    [
      isStreaming,
      conversationId,
      addMessage,
      updateLastAssistant,
      appendToolCall,
      setStreaming,
      setConversationId,
      addCost,
    ]
  )

  return {
    messages,
    conversationId,
    isStreaming,
    totalCost,
    sendMessage,
    clearMessages,
  }
}
