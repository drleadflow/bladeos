'use client'

import { useState, useCallback } from 'react'

interface VoiceTokenResponse {
  success: boolean
  data?: {
    token: string
    roomName: string
    livekitUrl: string
  }
  error?: string
}

type VoiceStatus = 'idle' | 'connecting' | 'connected' | 'error'

export function VoiceButton() {
  const [status, setStatus] = useState<VoiceStatus>('idle')
  const [roomName, setRoomName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const toggleVoice = useCallback(async () => {
    if (status === 'connected' || status === 'connecting') {
      // Disconnect
      setStatus('idle')
      setRoomName(null)
      setError(null)
      return
    }

    setStatus('connecting')
    setError(null)

    try {
      const res = await fetch('/api/voice/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      const data: VoiceTokenResponse = await res.json()

      if (!data.success || !data.data) {
        throw new Error(data.error ?? 'Failed to get voice token')
      }

      // Token received — connection verified
      setRoomName(data.data.roomName)
      setStatus('connected')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Voice connection failed'
      setError(message)
      setStatus('error')
    }
  }, [status])

  return (
    <div className="relative inline-flex items-center">
      <button
        onClick={toggleVoice}
        disabled={status === 'connecting'}
        className={`
          relative flex items-center justify-center w-10 h-10 rounded-full
          transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2
          ${status === 'connected'
            ? 'bg-red-500 hover:bg-red-600 focus:ring-red-500 text-white'
            : status === 'connecting'
              ? 'bg-yellow-500 text-white cursor-wait'
              : 'bg-zinc-700 hover:bg-zinc-600 focus:ring-zinc-500 text-zinc-300'
          }
        `}
        title={
          status === 'connected'
            ? `Voice active (${roomName}) - click to disconnect`
            : status === 'connecting'
              ? 'Connecting...'
              : 'Start voice mode'
        }
      >
        {/* Microphone icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="w-5 h-5"
        >
          <path d="M12 1a4 4 0 00-4 4v6a4 4 0 008 0V5a4 4 0 00-4-4z" />
          <path d="M6 11a1 1 0 10-2 0 8 8 0 0016 0 1 1 0 10-2 0 6 6 0 01-12 0z" />
          <path d="M11 19.93V23a1 1 0 102 0v-3.07A8.002 8.002 0 0020 12a1 1 0 10-2 0 6 6 0 01-12 0 1 1 0 10-2 0 8.002 8.002 0 007 7.93z" />
        </svg>

        {/* Pulsing indicator when connected */}
        {status === 'connected' && (
          <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
          </span>
        )}

        {/* Connecting spinner */}
        {status === 'connecting' && (
          <span className="absolute -top-0.5 -right-0.5">
            <span className="animate-spin inline-flex h-3 w-3 rounded-full border-2 border-white border-t-transparent" />
          </span>
        )}
      </button>

      {/* Error tooltip */}
      {status === 'error' && error && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-red-900 text-red-200 text-xs rounded-lg whitespace-nowrap shadow-lg">
          {error}
        </div>
      )}
    </div>
  )
}
