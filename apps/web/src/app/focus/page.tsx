'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { PageShell, Panel, PanelHeader, MetricCard, Badge } from '@/components/dashboard/cockpit-ui'

type Mode = 'focus' | 'short-break' | 'long-break'

const DURATIONS: Record<Mode, number> = {
  focus: 25 * 60,
  'short-break': 5 * 60,
  'long-break': 15 * 60,
}

const STORAGE_KEY = 'blade-focus-sessions'

interface SessionData {
  date: string
  count: number
  totalMinutes: number
  streak: number
  lastCompletedDate: string | null
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function getYesterday(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

function loadSessions(): SessionData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw) as SessionData
      if (data.date === getToday()) return data
      // Date rolled over — reset count/minutes but keep streak logic
      const streak =
        data.lastCompletedDate === getYesterday() ? data.streak : 0
      return {
        date: getToday(),
        count: 0,
        totalMinutes: 0,
        streak,
        lastCompletedDate: data.lastCompletedDate ?? null,
      }
    }
  } catch {
    // ignore parse errors
  }
  return { date: getToday(), count: 0, totalMinutes: 0, streak: 0, lastCompletedDate: null }
}

function saveSessions(sessions: SessionData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
}

const RADIUS = 120
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const MODE_LABELS: Record<Mode, string> = {
  focus: 'Focus',
  'short-break': 'Short Break',
  'long-break': 'Long Break',
}

export default function FocusPage() {
  const [mode, setMode] = useState<Mode>('focus')
  const [timeLeft, setTimeLeft] = useState(DURATIONS.focus)
  const [isRunning, setIsRunning] = useState(false)
  const [sessions, setSessions] = useState<SessionData>({
    date: getToday(),
    count: 0,
    totalMinutes: 0,
    streak: 0,
    lastCompletedDate: null,
  })
  const [justCompleted, setJustCompleted] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setSessions(loadSessions())
  }, [])

  const handleComplete = useCallback(
    (completedMode: Mode, currentSessions: SessionData) => {
      setIsRunning(false)
      setJustCompleted(true)
      setTimeout(() => setJustCompleted(false), 2000)

      if (completedMode === 'focus') {
        const today = getToday()
        const newStreak =
          currentSessions.lastCompletedDate === getYesterday() ||
          currentSessions.lastCompletedDate === today
            ? currentSessions.streak + 1
            : 1
        const updated: SessionData = {
          ...currentSessions,
          count: currentSessions.count + 1,
          totalMinutes: currentSessions.totalMinutes + DURATIONS.focus / 60,
          streak: newStreak,
          lastCompletedDate: today,
        }
        setSessions(updated)
        saveSessions(updated)
      }

      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'granted') {
          new Notification(
            completedMode === 'focus' ? 'Focus session complete!' : 'Break is over!'
          )
        }
      }
    },
    []
  )

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    if (!isRunning) return

    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Use a ref-captured mode + sessions to avoid stale closure
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isRunning])

  // Watch for timer hitting zero
  const modeRef = useRef(mode)
  const sessionsRef = useRef(sessions)
  modeRef.current = mode
  sessionsRef.current = sessions

  useEffect(() => {
    if (timeLeft === 0 && isRunning) {
      handleComplete(modeRef.current, sessionsRef.current)
    }
  }, [timeLeft, isRunning, handleComplete])

  const switchMode = (newMode: Mode) => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setMode(newMode)
    setTimeLeft(DURATIONS[newMode])
    setIsRunning(false)
  }

  const reset = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setTimeLeft(DURATIONS[mode])
    setIsRunning(false)
  }

  const requestNotificationPermission = () => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {
        // ignore
      })
    }
  }

  const handleStart = () => {
    requestNotificationPermission()
    setIsRunning(true)
  }

  const minutes = Math.floor(timeLeft / 60)
  const seconds = timeLeft % 60
  const progress = 1 - timeLeft / DURATIONS[mode]
  const strokeDashoffset = CIRCUMFERENCE * (1 - progress)

  const isFocus = mode === 'focus'
  const accentColor = isFocus ? 'rgb(34, 211, 238)' : 'rgb(16, 185, 129)'
  const accentGlow = isFocus
    ? '0 0 60px rgba(34,211,238,0.35), 0 0 120px rgba(34,211,238,0.15)'
    : '0 0 60px rgba(16,185,129,0.35), 0 0 120px rgba(16,185,129,0.15)'
  const accentTone = isFocus ? 'cyan' : 'emerald'

  const timerLabel = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`

  return (
    <PageShell
      eyebrow="Focus Timer"
      title="Deep Work Block"
      description="12-hour CEO week — protect deep work and own your schedule"
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Main timer panel */}
        <Panel glow={accentTone} className="flex flex-col items-center py-10">
          {/* Mode tabs */}
          <div className="mb-10 flex rounded-2xl border border-white/10 bg-black/30 p-1">
            {(Object.keys(DURATIONS) as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={[
                  'rounded-xl px-5 py-2.5 text-xs font-medium uppercase tracking-[0.18em] transition-all duration-200',
                  mode === m
                    ? isFocus && m === 'focus'
                      ? 'bg-cyan-400/20 text-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.2)]'
                      : !isFocus && m === mode
                        ? 'bg-emerald-400/20 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.2)]'
                        : 'bg-white/10 text-zinc-200'
                    : 'text-zinc-500 hover:text-zinc-300',
                ].join(' ')}
              >
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>

          {/* SVG ring timer */}
          <div className="relative flex items-center justify-center">
            {/* Outer glow ring */}
            <div
              className="absolute rounded-full transition-all duration-700"
              style={{
                width: 296,
                height: 296,
                boxShadow: isRunning ? accentGlow : 'none',
                opacity: isRunning ? 1 : 0,
              }}
            />

            <svg width="296" height="296" viewBox="0 0 296 296" className="-rotate-90">
              {/* Track ring */}
              <circle
                cx="148"
                cy="148"
                r={RADIUS}
                fill="none"
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="12"
              />
              {/* Progress ring */}
              <circle
                cx="148"
                cy="148"
                r={RADIUS}
                fill="none"
                stroke={accentColor}
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={strokeDashoffset}
                style={{
                  transition: isRunning ? 'stroke-dashoffset 1s linear' : 'none',
                  filter: `drop-shadow(0 0 8px ${accentColor})`,
                }}
              />
            </svg>

            {/* Timer digits */}
            <div className="absolute flex flex-col items-center">
              <span
                className={[
                  'font-mono text-6xl font-semibold tracking-tight transition-colors duration-300',
                  justCompleted
                    ? isFocus
                      ? 'text-cyan-300'
                      : 'text-emerald-300'
                    : 'text-zinc-50',
                ].join(' ')}
                style={{
                  textShadow: isRunning ? `0 0 30px ${accentColor}80` : 'none',
                }}
              >
                {timerLabel}
              </span>
              <span className="mt-2 text-xs uppercase tracking-[0.22em] text-zinc-500">
                {MODE_LABELS[mode]}
              </span>
              {justCompleted && (
                <span
                  className={[
                    'mt-3 text-xs font-medium uppercase tracking-[0.18em]',
                    isFocus ? 'text-cyan-300' : 'text-emerald-300',
                  ].join(' ')}
                >
                  Complete
                </span>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="mt-10 flex items-center gap-4">
            {isRunning ? (
              <button
                onClick={() => setIsRunning(false)}
                className="rounded-2xl border border-white/10 bg-white/[0.07] px-8 py-3 text-sm font-medium text-zinc-200 transition-all duration-200 hover:border-white/20 hover:bg-white/10 active:scale-95"
              >
                Pause
              </button>
            ) : (
              <button
                onClick={handleStart}
                className={[
                  'rounded-2xl border px-8 py-3 text-sm font-semibold text-zinc-900 transition-all duration-200 active:scale-95',
                  isFocus
                    ? 'border-cyan-300/40 bg-cyan-300 hover:bg-cyan-200 shadow-[0_0_24px_rgba(34,211,238,0.4)]'
                    : 'border-emerald-300/40 bg-emerald-300 hover:bg-emerald-200 shadow-[0_0_24px_rgba(16,185,129,0.4)]',
                ].join(' ')}
              >
                {timeLeft === DURATIONS[mode] ? 'Start' : 'Resume'}
              </button>
            )}

            <button
              onClick={reset}
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-medium text-zinc-500 transition-all duration-200 hover:border-white/15 hover:text-zinc-300 active:scale-95"
            >
              Reset
            </button>
          </div>

          {/* Session dots */}
          {sessions.count > 0 && (
            <div className="mt-8 flex items-center gap-2">
              {Array.from({ length: Math.min(sessions.count, 12) }).map((_, i) => (
                <span
                  key={i}
                  className="h-2 w-2 rounded-full bg-cyan-400/60"
                  style={{ boxShadow: '0 0 6px rgba(34,211,238,0.5)' }}
                />
              ))}
              {sessions.count > 12 && (
                <span className="text-xs text-zinc-500">+{sessions.count - 12}</span>
              )}
            </div>
          )}
        </Panel>

        {/* Stats sidebar */}
        <div className="flex flex-col gap-4">
          <Panel>
            <PanelHeader
              eyebrow="Today"
              title="Focus stats"
              description="Your deep work progress for today."
            />
            <div className="grid grid-cols-1 gap-3">
              <MetricCard
                label="Sessions completed"
                value={sessions.count}
                hint={
                  sessions.count === 0
                    ? 'Start your first session to begin tracking.'
                    : sessions.count === 1
                      ? 'One down. Keep the momentum going.'
                      : `${sessions.count} sessions locked in today.`
                }
                accent="cyan"
              />
              <MetricCard
                label="Focus time today"
                value={
                  sessions.totalMinutes >= 60
                    ? `${Math.floor(sessions.totalMinutes / 60)}h ${sessions.totalMinutes % 60}m`
                    : `${sessions.totalMinutes}m`
                }
                hint="Total uninterrupted deep work this session."
                accent="blue"
              />
              <MetricCard
                label="Current streak"
                value={sessions.streak === 0 ? '—' : `${sessions.streak}`}
                hint={
                  sessions.streak === 0
                    ? 'Complete a session to start your streak.'
                    : sessions.streak === 1
                      ? 'Streak started. Come back tomorrow.'
                      : `${sessions.streak} sessions in a row.`
                }
                accent="emerald"
              />
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              eyebrow="Mode guide"
              title="Pomodoro rhythm"
            />
            <div className="space-y-3">
              <div className="rounded-[1.2rem] border border-white/10 bg-black/20 px-4 py-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <Badge tone="cyan">Focus — 25 min</Badge>
                </div>
                <p className="text-xs leading-5 text-zinc-400">
                  Single task. No notifications. Full attention on one thing.
                </p>
              </div>
              <div className="rounded-[1.2rem] border border-white/10 bg-black/20 px-4 py-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <Badge tone="emerald">Short Break — 5 min</Badge>
                </div>
                <p className="text-xs leading-5 text-zinc-400">
                  Step away. Move, breathe, hydrate. No screens.
                </p>
              </div>
              <div className="rounded-[1.2rem] border border-white/10 bg-black/20 px-4 py-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <Badge tone="emerald">Long Break — 15 min</Badge>
                </div>
                <p className="text-xs leading-5 text-zinc-400">
                  After 4 focus sessions. Full reset before the next block.
                </p>
              </div>
              <div className="mt-2 rounded-[1.2rem] border border-white/10 bg-gradient-to-br from-white/[0.04] to-cyan-400/[0.02] px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">CEO principle</p>
                <p className="mt-1 text-xs leading-5 text-zinc-300">
                  Guard every focus block like a board meeting. Interruptions cost more than they appear.
                </p>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </PageShell>
  )
}
