'use client'

import { useState, useRef, useCallback, type KeyboardEvent } from 'react'

interface MessageInputProps {
  onSend: (text: string) => void
  disabled: boolean
}

export function MessageInput({ onSend, disabled }: MessageInputProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [value, disabled, onSend])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  const handleInput = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const lineHeight = 24
    const maxHeight = lineHeight * 5
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
  }, [])

  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.05] p-3 shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <div className="mb-2 flex items-center gap-2 px-2">
            <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-cyan-300">
              Prompt
            </span>
            <span className="text-xs text-zinc-500">
              Ask for action, context, decisions, or execution.
            </span>
          </div>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            handleInput()
          }}
          onKeyDown={handleKeyDown}
          placeholder="Tell Blade what matters, what changed, or what needs to get done..."
          disabled={disabled}
          rows={1}
          className="min-h-[72px] w-full resize-none rounded-[1.4rem] border border-white/10 bg-zinc-950/70 px-5 py-4 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-cyan-400/50 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ maxHeight: '120px' }}
        />
        </div>
        <button
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.2rem] bg-gradient-to-br from-cyan-300 via-sky-400 to-blue-600 text-zinc-950 transition-transform duration-200 hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Send message"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-5 w-5"
          >
            <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
