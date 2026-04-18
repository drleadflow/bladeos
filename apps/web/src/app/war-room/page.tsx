'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { PipecatClient, RTVIEvent } from '@pipecat-ai/client-js'
import { WebSocketTransport, WavMediaManager } from '@pipecat-ai/websocket-transport'

// ── Types ───────────────────────────────────────────────────

interface Turn {
  role: 'user' | 'agent'
  text: string
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

// ── Component ───────────────────────────────────────────────

export default function WarRoomPage() {
  const [activeAgent, setActiveAgent] = useState<string>('chief-of-staff')
  const [meetingState, setMeetingState] = useState<MeetingState>('idle')
  const [turns, setTurns] = useState<Turn[]>([])
  const [error, setError] = useState<string | null>(null)
  const [handUp, setHandUp] = useState<string | null>(null)

  const clientRef = useRef<PipecatClient | null>(null)
  const micCleanupRef = useRef<(() => void) | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns])

  useEffect(() => {
    if (!handUp) return
    const t = setTimeout(() => setHandUp(null), 6000)
    return () => clearTimeout(t)
  }, [handUp])

  async function startMeeting() {
    setError(null)
    setMeetingState('connecting')
    setTurns([])

    try {
      const mediaManager = new WavMediaManager(4096, 16000)

      const WS_URL = process.env.NEXT_PUBLIC_WARROOM_WS_URL ?? 'ws://127.0.0.1:7860'

      const transport = new WebSocketTransport({
        wsUrl: WS_URL,
        mediaManager,
        recorderSampleRate: 16000,
        playerSampleRate: 24000,
      })

      const client = new PipecatClient({
        transport,
        enableMic: true,
        enableCam: false,
        callbacks: {
          onConnected: () => {
            console.log('[WarRoom] connected, state:', transport.state)
            setMeetingState('live')
          },
          onDisconnected: () => {
            setMeetingState('idle')
          },
          onTransportStateChanged: (state: string) => {
            console.log('[WarRoom] state:', state)
          },
        },
      })

      client.on(RTVIEvent.BotTranscript, (data: { text: string }) => {
        setTurns(prev => [...prev, {
          role: 'agent',
          text: data.text,
          timestamp: new Date().toISOString(),
        }])
      })

      client.on(RTVIEvent.UserTranscript, (data: { text: string; final: boolean }) => {
        if (data.final) {
          setTurns(prev => [...prev, {
            role: 'user',
            text: data.text,
            timestamp: new Date().toISOString(),
          }])
        }
      })

      client.on(RTVIEvent.Error, (msg: unknown) => {
        console.error('[WarRoom] error:', msg)
        const errMsg = msg instanceof Error ? msg.message
          : typeof msg === 'object' && msg !== null && 'data' in msg
            ? String((msg as { data: unknown }).data)
            : 'Connection error'
        setError(errMsg)
        setMeetingState('error')
      })

      clientRef.current = client
      await client.connect()
      console.log('[WarRoom] connected, starting direct mic capture')

      // Direct mic capture — bypass WavMediaManager's broken recorder
      // and feed audio directly into the transport's audio handler
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      })
      const audioCtx = new AudioContext({ sampleRate: 16000 })
      const source = audioCtx.createMediaStreamSource(micStream)
      const processor = audioCtx.createScriptProcessor(4096, 1, 1)

      processor.onaudioprocess = (e) => {
        const float32 = e.inputBuffer.getChannelData(0)
        const int16 = new Int16Array(float32.length)
        for (let i = 0; i < float32.length; i++) {
          const s = Math.max(-1, Math.min(1, float32[i]))
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
        }
        // Feed audio directly into the transport's audio handler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(transport as any).handleUserAudioStream(int16)
      }
      source.connect(processor)
      processor.connect(audioCtx.destination)

      micCleanupRef.current = () => {
        processor.disconnect()
        source.disconnect()
        micStream.getTracks().forEach(t => t.stop())
        audioCtx.close()
      }
      console.log('[WarRoom] direct mic capture active')
    } catch (err) {
      console.error('[WarRoom] connect failed:', err)
      const msg = err instanceof Error ? err.message : 'Failed to connect'
      setError(`${msg}. Is the War Room server running? (cd warroom && python server.py)`)
      setMeetingState('error')
    }
  }

  async function endMeeting() {
    micCleanupRef.current?.()
    micCleanupRef.current = null
    try {
      await clientRef.current?.disconnect()
    } catch { /* ignore */ }
    clientRef.current = null
    setMeetingState('idle')
  }

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* ── Sidebar ────────────────────────────────────────── */}
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
                  onClick={() => setActiveAgent(agent.slug)}
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
                    {isHandUp && <span className="absolute -top-1 -right-1 text-sm animate-bounce">✋</span>}
                    {isPinned && <span className="absolute -top-1 -right-1 rounded-full bg-cyan-400 px-1 text-[8px] font-bold text-zinc-950">PIN</span>}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-semibold ${isPinned ? 'text-cyan-200' : isHandUp ? 'text-amber-200' : 'text-zinc-200'}`}>
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

        {/* Controls */}
        <div className="mt-auto border-t border-white/[0.06] p-4 space-y-3">
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

      {/* ── Main ───────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col">
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
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {meetingState === 'idle' && turns.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <p className="text-4xl mb-4">🎙️</p>
              <p className="text-lg font-semibold text-zinc-300">Blade War Room</p>
              <p className="text-sm text-zinc-500 mt-2 max-w-md">
                Voice standup with your AI workforce. Click Start Meeting to begin.
              </p>
              <div className="mt-6 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-left text-xs text-zinc-600 max-w-sm space-y-1">
                <p className="font-semibold text-zinc-400 mb-2">First time setup:</p>
                <p>1. <code className="text-cyan-400">cd warroom && pip install -r requirements.txt</code></p>
                <p>2. <code className="text-cyan-400">python server.py</code></p>
                <p>3. Click Start Meeting</p>
              </div>
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
          <div ref={transcriptEndRef} />
        </div>

        {error && (
          <div className="mx-6 mb-2 rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-2 text-xs text-rose-300">
            {error}
          </div>
        )}

        {meetingState === 'live' && (
          <div className="flex items-center justify-center gap-4 border-t border-white/[0.06] px-6 py-4">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-zinc-800">
              <svg className="h-6 w-6 text-emerald-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z" />
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </svg>
            </div>
            <p className="text-xs text-zinc-500">Mic active — just talk naturally</p>
          </div>
        )}
      </div>
    </div>
  )
}
