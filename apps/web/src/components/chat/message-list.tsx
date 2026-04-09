'use client'

import type { Message } from '@/lib/store'

interface MessageListProps {
  messages: Message[]
}

function formatContent(content: string): React.ReactNode {
  const parts = content.split(/(```[\s\S]*?```)/g)

  return parts.map((part, i) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const inner = part.slice(3, -3)
      const newlineIndex = inner.indexOf('\n')
      const code = newlineIndex >= 0 ? inner.slice(newlineIndex + 1) : inner
      return (
        <pre
          key={i}
          className="my-2 overflow-x-auto rounded-lg bg-zinc-950 p-3 text-sm text-zinc-300"
        >
          <code>{code}</code>
        </pre>
      )
    }

    return (
      <span key={i} className="whitespace-pre-wrap">
        {part}
      </span>
    )
  })
}

function ToolCallCard({
  tc,
}: {
  tc: { name: string; display: string; success: boolean }
}) {
  return (
    <div
      className={`mt-2 inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs ${
        tc.success
          ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
          : 'border-red-400/20 bg-red-400/10 text-red-300'
      }`}
    >
      <span className="font-mono font-medium">{tc.name}</span>
      <span className="text-zinc-500">|</span>
      <span>{tc.display}</span>
      {tc.success ? (
        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
            clipRule="evenodd"
          />
        </svg>
      ) : (
        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
        </svg>
      )}
    </div>
  )
}

export function MessageList({ messages }: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="grid min-h-[52vh] place-items-center">
        <div className="w-full max-w-4xl rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 shadow-[0_30px_80px_rgba(0,0,0,0.35)] sm:p-10">
          <div className="flex flex-wrap items-start justify-between gap-8">
            <div className="max-w-2xl">
              <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-cyan-300/80">
                Ready for work
              </p>
              <h2 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-50">
                Run your company from one conversation.
              </h2>
              <p className="mt-4 text-base leading-7 text-zinc-400">
                Ask Blade to investigate, coordinate, remember, summarize, or ship. It should feel like briefing a sharp operator, not babysitting a chatbot.
              </p>
            </div>

            <div className="grid min-w-[240px] gap-3 sm:w-[280px]">
              <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                  Best prompts
                </p>
                <p className="mt-2 text-sm text-zinc-300">
                  “Review what changed today and tell me what needs attention.”
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                  Strongest use
                </p>
                <p className="mt-2 text-sm text-zinc-300">
                  Hand off a task, ask for the next move, or have Blade coordinate the work across agents.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 py-2">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-[85%] rounded-[1.6rem] border px-5 py-4 text-sm leading-7 shadow-[0_24px_60px_rgba(0,0,0,0.2)] ${
              msg.role === 'user'
                ? 'border-cyan-300/20 bg-gradient-to-br from-cyan-400 via-sky-500 to-blue-600 text-white'
                : 'border-white/10 bg-white/[0.05] text-zinc-100 backdrop-blur-sm'
            }`}
          >
            <div className="mb-3 flex items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] ${
                  msg.role === 'user'
                    ? 'bg-white/15 text-white/90'
                    : 'bg-cyan-400/10 text-cyan-300'
                }`}
              >
                {msg.role === 'user' ? 'You' : 'Blade'}
              </span>
            </div>
            <div>{formatContent(msg.content)}</div>
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {msg.toolCalls.map((tc, i) => (
                  <ToolCallCard key={i} tc={tc} />
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
