'use client'

import { useCallback } from 'react'
import { useChatStore, type TraceEvent } from './store'

function formatUsd(usd: number): string {
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`
}

function clip(text: string, max = 140): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function makeTraceEvent(event: Omit<TraceEvent, 'id' | 'timestamp'>): TraceEvent {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    ...event,
  }
}

export function useBladeChat() {
  const {
    messages,
    traceEvents,
    conversationId,
    isStreaming,
    totalCost,
    addMessage,
    updateLastAssistant,
    appendToolCall,
    prependTraceEvent,
    setStreaming,
    setConversationId,
    addCost,
    clearMessages,
    setTraceEvents,
  } = useChatStore()

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return

      addMessage({
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
      })

      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
      })

      prependTraceEvent(
        makeTraceEvent({
          type: 'status',
          title: 'Request queued',
          detail: 'Blade is preparing context, memory, and tools for this run.',
          tone: 'blue',
        })
      )
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

            if (!line.startsWith('data: ')) continue

            const rawData = line.slice(6)
            let data: Record<string, unknown>

            try {
              data = JSON.parse(rawData)
            } catch {
              continue
            }

            const eventType = currentEventType || ((data.type as string) ?? '')
            currentEventType = ''

            if (eventType === 'conversation_started') {
              if (data.conversationId) {
                setConversationId(data.conversationId as string)
              }
              prependTraceEvent(
                makeTraceEvent({
                  type: 'conversation_started',
                  title: 'Conversation live',
                  detail: 'The workspace is attached and ready for execution.',
                  tone: 'cyan',
                })
              )
              continue
            }

            if (eventType === 'text' || eventType === 'content_block_delta') {
              const token = (data.text as string) ?? (data.delta as string) ?? ''
              accumulatedContent += token
              updateLastAssistant(accumulatedContent)
              continue
            }

            if (eventType === 'tool_call') {
              const toolName =
                (data.name as string) ??
                (data.toolName as string) ??
                'unknown'
              const display =
                (data.display as string) ??
                (data.name as string) ??
                (data.toolName as string) ??
                'Tool call'
              const success = (data.success as boolean) ?? true
              const durationMs =
                typeof data.durationMs === 'number' ? data.durationMs : undefined

              appendToolCall({
                name: toolName,
                display,
                success,
              })
              prependTraceEvent(
                makeTraceEvent({
                  type: 'tool_call',
                  title: success ? `Tool succeeded: ${toolName}` : `Tool failed: ${toolName}`,
                  detail: clip(display),
                  tone: success ? 'emerald' : 'rose',
                  durationMs,
                  toolName,
                })
              )
              continue
            }

            if (eventType === 'turn') {
              const iteration =
                typeof data.iteration === 'number' ? data.iteration : undefined
              const costSoFar =
                typeof data.costSoFar === 'number' ? data.costSoFar : undefined
              const stopReason =
                typeof data.stopReason === 'string' ? data.stopReason : undefined

              prependTraceEvent(
                makeTraceEvent({
                  type: 'turn',
                  title: iteration
                    ? `Iteration ${iteration} complete`
                    : 'Reasoning step complete',
                  detail: [stopReason ? `Stop reason: ${stopReason}` : null, costSoFar != null ? `Cost so far: ${formatUsd(costSoFar)}` : null]
                    .filter(Boolean)
                    .join(' · '),
                  tone: stopReason === 'tool_use' ? 'amber' : 'cyan',
                  iteration,
                  costSoFar,
                  stopReason,
                })
              )
              continue
            }

            if (eventType === 'done') {
              const finalResponse = (data.finalResponse as string) ?? ''
              if (finalResponse && !accumulatedContent) {
                accumulatedContent = finalResponse
                updateLastAssistant(finalResponse)
              }

              if (data.conversationId) {
                setConversationId(data.conversationId as string)
              }

              const resolvedTotalCost =
                typeof data.totalCost === 'number'
                  ? data.totalCost
                  : typeof data.cost === 'number'
                    ? data.cost
                    : null

              if (typeof resolvedTotalCost === 'number') {
                addCost(resolvedTotalCost)
              }

              prependTraceEvent(
                makeTraceEvent({
                  type: 'done',
                  title: 'Run completed',
                  detail: [
                    typeof data.totalToolCalls === 'number'
                      ? `${data.totalToolCalls} tool call${data.totalToolCalls === 1 ? '' : 's'}`
                      : null,
                    typeof resolvedTotalCost === 'number'
                      ? `Total cost: ${formatUsd(resolvedTotalCost)}`
                      : null,
                    typeof data.stopReason === 'string'
                      ? `Stop reason: ${data.stopReason}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · '),
                  tone: 'emerald',
                  stopReason:
                    typeof data.stopReason === 'string'
                      ? data.stopReason
                      : undefined,
                })
              )
              continue
            }

            if (eventType === 'error') {
              const errorMessage =
                (data.error as string) ?? 'An unexpected error occurred'
              updateLastAssistant(`Error: ${errorMessage}`)
              prependTraceEvent(
                makeTraceEvent({
                  type: 'error',
                  title: 'Run failed',
                  detail: clip(errorMessage),
                  tone: 'rose',
                })
              )
            }
          }
        }
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : 'An unexpected error occurred'
        updateLastAssistant(`Error: ${errorMessage}`)
        prependTraceEvent(
          makeTraceEvent({
            type: 'error',
            title: 'Network or runtime failure',
            detail: clip(errorMessage),
            tone: 'rose',
          })
        )
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
      prependTraceEvent,
      setStreaming,
      setConversationId,
      addCost,
    ]
  )

  return {
    messages,
    traceEvents,
    conversationId,
    isStreaming,
    totalCost,
    sendMessage,
    clearMessages,
    setTraceEvents,
  }
}
