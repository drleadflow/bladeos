'use client'

import { create } from 'zustand'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls?: { name: string; display: string; success: boolean }[]
  cost?: number
}

export interface ChatStore {
  messages: Message[]
  conversationId: string | null
  isStreaming: boolean
  totalCost: number
  addMessage: (msg: Message) => void
  updateLastAssistant: (content: string) => void
  appendToolCall: (tc: { name: string; display: string; success: boolean }) => void
  setStreaming: (v: boolean) => void
  setConversationId: (id: string) => void
  addCost: (usd: number) => void
  clearMessages: () => void
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  conversationId: null,
  isStreaming: false,
  totalCost: 0,

  addMessage: (msg) =>
    set((state) => ({
      messages: [...state.messages, msg],
    })),

  updateLastAssistant: (content) =>
    set((state) => {
      const messages = [...state.messages]
      const lastIndex = messages.length - 1
      if (lastIndex >= 0 && messages[lastIndex].role === 'assistant') {
        messages[lastIndex] = { ...messages[lastIndex], content }
      }
      return { messages }
    }),

  appendToolCall: (tc) =>
    set((state) => {
      const messages = [...state.messages]
      const lastIndex = messages.length - 1
      if (lastIndex >= 0 && messages[lastIndex].role === 'assistant') {
        const existing = messages[lastIndex].toolCalls ?? []
        messages[lastIndex] = {
          ...messages[lastIndex],
          toolCalls: [...existing, tc],
        }
      }
      return { messages }
    }),

  setStreaming: (v) => set({ isStreaming: v }),

  setConversationId: (id) => set({ conversationId: id }),

  addCost: (usd) =>
    set((state) => ({
      totalCost: state.totalCost + usd,
    })),

  clearMessages: () =>
    set({
      messages: [],
      conversationId: null,
      totalCost: 0,
    }),
}))
