'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

// ── Types ───────────────────────────────────────────────────

interface Turn {
  role: 'user' | 'agent'
  text: string
  agentSlug?: string
  timestamp: string
}

interface AgentDef {
  slug: string
  name: string
  title: string
  icon: string
}

const AGENTS: AgentDef[] = [
  { slug: 'chief-of-staff', name: 'Main', title: 'The Hand of the King', icon: '👑' },
  { slug: 'sdr', name: 'SDR', title: 'Sales Hunter', icon: '🎯' },
  { slug: 'growth-lead', name: 'Growth', title: 'Growth Strategist', icon: '📈' },
  { slug: 'csm-agent', name: 'CSM', title: 'Client Guardian', icon: '🤝' },
  { slug: 'ops-manager', name: 'Ops', title: 'Master of War', icon: '⚙️' },
]

type RecordingState = 'idle' | 'recording' | 'processing'

// ── Component ───────────────────────────────────────────────

export default function WarRoomPage() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [activeAgent, setActiveAgent] = useState<string>('chief-of-staff')
  const [turns, setTurns] = useState<Turn[]>([])
  const [totalCost, setTotalCost] = useState(0)
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const transcriptEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns])

  // Create session on mount
  useEffect(() => {
    async function init() {
      try {
        const res = await fetch('/api/war-room/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create', agentSlug: 'chief-of-staff' }),
        })
        const json = await res.json()
        if (json.success) {
          setSessionId(json.data.sessionId)
        }
      } catch {
        setError('Failed to create war room session')
      }
    }
    init()
  }, [])

  async function switchAgent(slug: string) {
    if (!sessionId) return
    setActiveAgent(slug)
    await fetch('/api/war-room/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'switch-agent', sessionId, agentSlug: slug }),
    })
  }

  async function startRecording() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        await sendAudio(blob)
      }

      mediaRecorder.start()
      setRecordingState('recording')
    } catch {
      setError('Microphone access denied')
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
      setRecordingState('processing')
    }
  }

  async function sendAudio(blob: Blob) {
    if (!sessionId) return

    try {
      const formData = new FormData()
      formData.append('audio', blob, 'recording.webm')
      formData.append('sessionId', sessionId)

      const res = await fetch('/api/war-room/speak', {
        method: 'POST',
        body: formData,
      })
      const json = await res.json()

      if (json.success) {
        const { userTranscript, agentText, agentSlug, agentAudio, costUsd } = json.data

        setTurns(prev => [
          ...prev,
          { role: 'user', text: userTranscript, timestamp: new Date().toISOString() },
          { role: 'agent', text: agentText, agentSlug, timestamp: new Date().toISOString() },
        ])
        setTotalCost(prev => prev + (costUsd ?? 0))

        // Play audio response
        if (agentAudio) {
          const audioBytes = Uint8Array.from(atob(agentAudio), c => c.charCodeAt(0))
          const audioBlob = new Blob([audioBytes], { type: 'audio/mpeg' })
          const audioUrl = URL.createObjectURL(audioBlob)
          const audio = new Audio(audioUrl)
          audio.play().catch(() => { /* autoplay blocked */ })
        }
      } else {
        setError(json.error ?? 'Voice processing failed')
      }
    } catch {
      setError('Network error during voice processing')
    } finally {
      setRecordingState('idle')
    }
  }

  const activeAgentDef = AGENTS.find(a => a.slug === activeAgent) ?? AGENTS[0]

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      {/* ── Left Sidebar: Agent Roster ─────────────────────── */}
      <div className="flex w-72 flex-col border-r border-white/[0.06] bg-zinc-950/80">
        <div className="flex items-center justify-between border-b border-white/[0.06] p-4">
          <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
            ← Mission Control
          </Link>
        </div>

        <div className="p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 mb-3">Your Team</p>
          <div className="space-y-1">
            {AGENTS.map(agent => (
              <button
                key={agent.slug}
                onClick={() => switchAgent(agent.slug)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-all ${
                  activeAgent === agent.slug
                    ? 'border border-cyan-400/20 bg-cyan-400/[0.08]'
                    : 'border border-transparent hover:bg-white/[0.04]'
                }`}
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-lg">
                  {agent.icon}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-semibold ${activeAgent === agent.slug ? 'text-cyan-200' : 'text-zinc-200'}`}>
                      {agent.name}
                    </p>
                    {activeAgent === agent.slug && (
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 truncate">{agent.title}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Meeting Mode */}
        <div className="mt-auto border-t border-white/[0.06] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 mb-2">Meeting Mode</p>
          <div className="flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
            <button className="flex-1 rounded-lg bg-white/[0.1] px-3 py-1.5 text-xs font-semibold text-zinc-200">
              Direct
            </button>
            <button className="flex-1 rounded-lg px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300">
              Hand Up
            </button>
          </div>
        </div>
      </div>

      {/* ── Main: Transcript + Controls ────────────────────── */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-3">
          <h1 className="text-sm font-bold uppercase tracking-widest text-rose-400">War Room</h1>
          <span className="text-xs text-zinc-600">${totalCost.toFixed(3)}</span>
        </div>

        {/* Transcript */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {turns.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <p className="text-2xl mb-2">🎙️</p>
              <p className="text-sm text-zinc-500">Click the mic to start talking to {activeAgentDef.name}</p>
              <p className="text-xs text-zinc-600 mt-1">Your voice → Deepgram STT → Agent → ElevenLabs TTS → Speaker</p>
            </div>
          )}

          {turns.map((turn, i) => (
            <div key={i} className="max-w-2xl">
              <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${
                turn.role === 'user' ? 'text-zinc-500' : 'text-rose-400'
              }`}>
                {turn.role === 'user' ? 'You' : 'Agent'}
              </p>
              <p className="text-sm leading-relaxed text-zinc-300">{turn.text}</p>
            </div>
          ))}

          {recordingState === 'processing' && (
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
              <p className="text-xs text-zinc-500">Processing...</p>
            </div>
          )}

          <div ref={transcriptEndRef} />
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mb-2 rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-2 text-xs text-rose-300">
            {error}
          </div>
        )}

        {/* Mic Controls */}
        <div className="flex items-center justify-center gap-4 border-t border-white/[0.06] px-6 py-5">
          {/* Mic Button */}
          <button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            disabled={!sessionId || recordingState === 'processing'}
            className={`relative grid h-16 w-16 place-items-center rounded-full transition-all ${
              recordingState === 'recording'
                ? 'bg-rose-500 scale-110 shadow-lg shadow-rose-500/30'
                : recordingState === 'processing'
                  ? 'bg-zinc-700 cursor-wait'
                  : 'bg-zinc-800 hover:bg-zinc-700 hover:scale-105'
            }`}
          >
            {recordingState === 'recording' && (
              <span className="absolute inset-0 animate-ping rounded-full bg-rose-500 opacity-30" />
            )}
            <svg className="h-6 w-6 text-white relative z-10" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          </button>

          {/* Mic level indicator */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] uppercase tracking-wider text-zinc-600">Mic</span>
            <div className="h-1 w-24 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className={`h-full rounded-full transition-all duration-150 ${
                  recordingState === 'recording' ? 'w-3/4 bg-emerald-400' : 'w-0'
                }`}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
