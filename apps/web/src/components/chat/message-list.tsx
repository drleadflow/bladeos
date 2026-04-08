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
      className={`mt-2 inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${
        tc.success
          ? 'border-green-700 bg-green-950/50 text-green-400'
          : 'border-red-700 bg-red-950/50 text-red-400'
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
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-zinc-300">Blade Super Agent</h2>
          <p className="mt-2 text-sm text-zinc-500">How can I help you today?</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-6">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white'
                : 'bg-zinc-800 text-zinc-100'
            }`}
          >
            <div>{formatContent(msg.content)}</div>
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-2">
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
