'use client'

import { useEffect, useRef } from 'react'
import { useBladeChat } from '@/lib/use-chat'
import { useChatStore } from '@/lib/store'
import { ActivityTrace } from './activity-trace'
import { MessageList } from './message-list'
import { MessageInput } from './message-input'

interface ChatPanelProps {
  conversationId?: string
}

export function ChatPanel({ conversationId: externalConversationId }: ChatPanelProps) {
  const {
    messages,
    traceEvents,
    isStreaming,
    totalCost,
    sendMessage,
    clearMessages,
    setTraceEvents,
  } =
    useBladeChat()
  const { addMessage, setConversationId, clearMessages: resetMessages } = useChatStore()
  const messageScrollRef = useRef<HTMLDivElement>(null)
  const loadedConvRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    async function loadHistory() {
      if (!externalConversationId) {
        loadedConvRef.current = undefined
        resetMessages()
        setTraceEvents([])
        return
      }

      if (externalConversationId === loadedConvRef.current) return
      loadedConvRef.current = externalConversationId

      try {
        resetMessages()
        const [messagesRes, timelineRes] = await Promise.all([
          fetch(`/api/chat?conversationId=${externalConversationId}`),
          fetch(`/api/timeline?targetType=conversation&targetId=${externalConversationId}&limit=30`),
        ])

        const data = await messagesRes.json()
        if (data.success && Array.isArray(data.data)) {
          setConversationId(externalConversationId)
          for (const msg of data.data) {
            addMessage({
              id: msg.id,
              role: msg.role as 'user' | 'assistant',
              content: msg.content,
            })
          }
        }

        const timelineData = await timelineRes.json()
        if (timelineData.success && Array.isArray(timelineData.data?.events)) {
          setTraceEvents(
            timelineData.data.events.map(
              (event: {
                id: number
                eventType: string
                summary: string
                detailJson: string | null
                costUsd: number
                createdAt: string
              }) => {
                let detail = ''
                if (event.detailJson) {
                  try {
                    const parsed = JSON.parse(event.detailJson) as Record<string, unknown>
                    detail = Object.entries(parsed)
                      .slice(0, 3)
                      .map(([key, value]) => `${key}: ${String(value)}`)
                      .join(' · ')
                  } catch {
                    detail = ''
                  }
                }

                return {
                  id: `timeline-${event.id}`,
                  type:
                    event.eventType === 'tool_call'
                      ? 'tool_call'
                      : event.eventType === 'error'
                        ? 'error'
                        : event.eventType === 'conversation_started'
                          ? 'conversation_started'
                          : event.eventType === 'conversation_reply'
                            ? 'done'
                            : 'status',
                  title: event.summary,
                  detail: detail || undefined,
                  tone:
                    event.eventType === 'error'
                      ? 'rose'
                      : event.eventType === 'tool_call'
                        ? 'cyan'
                        : event.eventType === 'conversation_reply'
                          ? 'emerald'
                          : 'blue',
                  timestamp: new Date(event.createdAt).getTime(),
                  costSoFar: event.costUsd > 0 ? event.costUsd : undefined,
                }
              }
            )
          )
        } else {
          setTraceEvents([])
        }
      } catch {
        setTraceEvents([])
      }
    }

    loadHistory()
  }, [externalConversationId, addMessage, setConversationId, resetMessages, setTraceEvents])

  useEffect(() => {
    const el = messageScrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  return (
    <section className="flex h-[calc(100vh-3.5rem)] flex-col">
      <header className="border-b border-white/10 bg-zinc-950/40 px-4 py-4 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-cyan-300">
                Live Workspace
              </span>
              {externalConversationId && (
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  Resumed
                </span>
              )}
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
              Blade Super Agent
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              A command deck for conversations, decisions, execution, and follow-through.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                Session Cost
              </p>
              <p className="mt-1 font-mono text-lg text-zinc-100">
                ${totalCost.toFixed(4)}
              </p>
            </div>

            {messages.length > 0 && (
              <button
                onClick={clearMessages}
                className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-zinc-300 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-zinc-100"
              >
                New chat
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-hidden px-4 py-6 sm:px-6">
        <div className="mx-auto grid h-full max-w-[1400px] gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div
            ref={messageScrollRef}
            className="min-h-0 overflow-y-auto rounded-[2rem] border border-white/10 bg-white/[0.03] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.22)] sm:p-5"
          >
            <MessageList messages={messages} />
          </div>

          <div className="min-h-0 overflow-y-auto">
            <ActivityTrace
              events={traceEvents}
              isStreaming={isStreaming}
              totalCost={totalCost}
            />
          </div>
        </div>
      </div>

      <div className="px-4 pb-5 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <MessageInput onSend={sendMessage} disabled={isStreaming} />
        </div>
      </div>
    </section>
  )
}
