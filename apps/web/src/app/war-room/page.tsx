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

type MeetingState = 'idle' | 'connecting' | 'live' | 'error'
type MeetingMode = 'direct' | 'auto'

// ── Component ───────────────────────────────────────────────

export default function WarRoomPage() {
  const [activeAgent, setActiveAgent] = useState<string>('chief-of-staff')
  const [meetingState, setMeetingState] = useState<MeetingState>('idle')
  const [meetingMode, setMeetingMode] = useState<MeetingMode>('direct')
  const [turns, setTurns] = useState<Turn[]>([])
  const [totalCost] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [handUp, setHandUp] = useState<string | null>(null)
  const [micLevel, setMicLevel] = useState(0)

  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns])

  // Clear hand-up after 6s
  useEffect(() => {
    if (!handUp) return
    const t = setTimeout(() => setHandUp(null), 6000)
    return () => clearTimeout(t)
  }, [handUp])

  async function pinAgent(slug: string) {
    setActiveAgent(slug)
    // If meeting is live, we'd need to restart the server
    // For now, just update local state
    try {
      await fetch('/api/war-room/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'switch-agent', sessionId: 'warroom', agentSlug: slug }),
      })
    } catch { /* best effort */ }
  }

  async function startMeeting() {
    setError(null)
    setMeetingState('connecting')
    setTurns([])

    try {
      // Connect WebSocket to Pipecat server
      const wsUrl = `ws://${window.location.hostname}:8765`
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.binaryType = 'arraybuffer'

      ws.onopen = async () => {
        setMeetingState('live')

        // Start mic capture
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true },
          })
          mediaStreamRef.current = stream

          const ctx = new AudioContext({ sampleRate: 16000 })
          audioContextRef.current = ctx
          const source = ctx.createMediaStreamSource(stream)
          const processor = ctx.createScriptProcessor(4096, 1, 1)
          processorRef.current = processor

          processor.onaudioprocess = (e) => {
            const input = e.inputBuffer.getChannelData(0)
            // Update mic level visualization
            let sum = 0
            for (let i = 0; i < input.length; i++) sum += Math.abs(input[i])
            setMicLevel(sum / input.length)

            // Convert float32 to int16 PCM and send
            if (ws.readyState === WebSocket.OPEN) {
              const pcm16 = new Int16Array(input.length)
              for (let i = 0; i < input.length; i++) {
                const s = Math.max(-1, Math.min(1, input[i]))
                pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
              }
              ws.send(pcm16.buffer)
            }
          }

          source.connect(processor)
          processor.connect(ctx.destination)
        } catch {
          setError('Microphone access denied')
          setMeetingState('error')
        }
      }

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          // Audio frame from server — play it
          playAudioFrame(event.data)
        } else {
          // Text/JSON message (transcript, tool events)
          try {
            const msg = JSON.parse(event.data)
            if (msg.type === 'transcript' && msg.role === 'user') {
              setTurns(prev => [...prev, {
                role: 'user',
                text: msg.text,
                timestamp: new Date().toISOString(),
              }])
            } else if (msg.type === 'transcript' && msg.role === 'agent') {
              setTurns(prev => [...prev, {
                role: 'agent',
                text: msg.text,
                agentSlug: msg.agent,
                timestamp: new Date().toISOString(),
              }])
            } else if (msg.event === 'agent_selected') {
              setHandUp(msg.agent)
            }
          } catch { /* not JSON, ignore */ }
        }
      }

      ws.onerror = () => {
        setError('WebSocket connection failed. Is the War Room server running? (python warroom/server.py)')
        setMeetingState('error')
      }

      ws.onclose = () => {
        if (meetingState === 'live') {
          setMeetingState('idle')
        }
        cleanup()
      }
    } catch {
      setError('Failed to start meeting')
      setMeetingState('error')
    }
  }

  function endMeeting() {
    wsRef.current?.close()
    cleanup()
    setMeetingState('idle')
  }

  function cleanup() {
    processorRef.current?.disconnect()
    mediaStreamRef.current?.getTracks().forEach(t => t.stop())
    audioContextRef.current?.close()
    processorRef.current = null
    mediaStreamRef.current = null
    audioContextRef.current = null
    setMicLevel(0)
  }

  // Simple audio playback for incoming PCM frames
  const playbackCtxRef = useRef<AudioContext | null>(null)
  function playAudioFrame(buffer: ArrayBuffer) {
    if (!playbackCtxRef.current) {
      playbackCtxRef.current = new AudioContext({ sampleRate: 24000 })
    }
    const ctx = playbackCtxRef.current
    const int16 = new Int16Array(buffer)
    const float32 = new Float32Array(int16.length)
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 0x8000
    }
    const audioBuffer = ctx.createBuffer(1, float32.length, 24000)
    audioBuffer.getChannelData(0).set(float32)
    const source = ctx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(ctx.destination)
    source.start()
  }

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
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
            {AGENTS.map(agent => {
              const isPinned = activeAgent === agent.slug
              const isHandUp = handUp === agent.slug
              return (
                <button
                  key={agent.slug}
                  onClick={() => pinAgent(agent.slug)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-all ${
                    isPinned
                      ? 'border border-cyan-400/20 bg-cyan-400/[0.08]'
                      : isHandUp
                        ? 'border border-amber-400/20 bg-amber-400/[0.06]'
                        : 'border border-transparent hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="relative">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-lg">
                      {agent.icon}
                    </div>
                    {isHandUp && (
                      <span className="absolute -top-1 -right-1 text-sm animate-bounce">✋</span>
                    )}
                    {isPinned && (
                      <span className="absolute -top-1 -right-1 rounded-full bg-cyan-400 px-1 text-[8px] font-bold text-zinc-950">
                        PIN
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-semibold ${
                        isPinned ? 'text-cyan-200' : isHandUp ? 'text-amber-200' : 'text-zinc-200'
                      }`}>
                        {agent.name}
                      </p>
                      {isPinned && meetingState === 'live' && (
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 truncate">{agent.title}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Meeting Mode */}
        <div className="mt-auto border-t border-white/[0.06] p-4 space-y-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 mb-2">Meeting Mode</p>
            <div className="flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
              <button
                onClick={() => setMeetingMode('direct')}
                className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  meetingMode === 'direct' ? 'bg-white/[0.1] text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Direct
              </button>
              <button
                onClick={() => setMeetingMode('auto')}
                className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  meetingMode === 'auto' ? 'bg-white/[0.1] text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Hand Up
              </button>
            </div>
          </div>

          {/* Start/End Meeting */}
          {meetingState === 'idle' || meetingState === 'error' ? (
            <button
              onClick={startMeeting}
              className="w-full rounded-xl py-3 text-sm font-bold text-zinc-950 transition-transform hover:scale-[1.02]"
              style={{ background: 'linear-gradient(to right, #22d3ee, #06b6d4)' }}
            >
              Start Meeting
            </button>
          ) : meetingState === 'connecting' ? (
            <button disabled className="w-full rounded-xl bg-zinc-800 py-3 text-sm font-semibold text-zinc-400">
              Connecting...
            </button>
          ) : (
            <button
              onClick={endMeeting}
              className="w-full rounded-xl py-3 text-sm font-bold text-white transition-transform hover:scale-[1.02]"
              style={{ background: 'linear-gradient(to right, #ef4444, #dc2626)' }}
            >
              End Meeting
            </button>
          )}
        </div>
      </div>

      {/* ── Main: Transcript + Controls ────────────────────── */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-3">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-bold uppercase tracking-widest text-rose-400">War Room</h1>
            {meetingState === 'live' && (
              <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                <span className="text-[10px] font-semibold text-emerald-300">LIVE</span>
              </span>
            )}
          </div>
          <span className="text-xs text-zinc-600">${totalCost.toFixed(3)}</span>
        </div>

        {/* Transcript */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {meetingState === 'idle' && turns.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <p className="text-4xl mb-4">🎙️</p>
              <p className="text-lg font-semibold text-zinc-300">Blade War Room</p>
              <p className="text-sm text-zinc-500 mt-2 max-w-md">
                Voice standup with your AI workforce. Click &quot;Start Meeting&quot; to begin.
              </p>
              <div className="mt-6 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-left text-xs text-zinc-600 max-w-sm space-y-1">
                <p className="font-semibold text-zinc-400 mb-2">Setup required:</p>
                <p>1. <code className="text-cyan-400">cd warroom && pip install -r requirements.txt</code></p>
                <p>2. <code className="text-cyan-400">python server.py</code></p>
                <p>3. Click Start Meeting above</p>
              </div>
            </div>
          )}

          {turns.map((turn, i) => (
            <div key={i} className="max-w-2xl">
              <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${
                turn.role === 'user' ? 'text-zinc-500' : 'text-rose-400'
              }`}>
                {turn.role === 'user' ? 'You' : `Agent${turn.agentSlug ? ` (${turn.agentSlug})` : ''}`}
              </p>
              <p className="text-sm leading-relaxed text-zinc-300">{turn.text}</p>
            </div>
          ))}

          <div ref={transcriptEndRef} />
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mb-2 rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-2 text-xs text-rose-300">
            {error}
          </div>
        )}

        {/* Bottom Bar: Mic Level */}
        {meetingState === 'live' && (
          <div className="flex items-center justify-center gap-4 border-t border-white/[0.06] px-6 py-4">
            <div className="relative grid h-14 w-14 place-items-center rounded-full bg-zinc-800">
              {micLevel > 0.01 && (
                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-20" />
              )}
              <svg className="h-6 w-6 text-emerald-400 relative z-10" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z" />
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </svg>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-zinc-600">Mic</span>
              <div className="h-1.5 w-32 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-emerald-400 transition-all duration-75"
                  style={{ width: `${Math.min(micLevel * 500, 100)}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
