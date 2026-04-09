'use client'

import { useRef, useState, useEffect } from 'react'

interface Step {
  label: string
  critical: boolean
}

interface Playbook {
  id: string
  name: string
  category: string
  categoryColor: string
  description: string
  estimatedTime: string
  assignedEmployee: string
  lastRun: string
  steps: Step[]
}

interface PlaybookProgress {
  checked: boolean[]
  startTime: number
}

interface CompletedEntry {
  playbookId: string
  completedAt: string
  elapsedSec: number
}

// ── Static playbook data ──────────────────────────────────────────────────────

const PLAYBOOKS: Playbook[] = [
  {
    id: 'client-onboarding',
    name: 'Client Onboarding',
    category: 'Client Success',
    categoryColor: '#a78bfa',
    description: 'End-to-end flow from signed contract to first deliverable live.',
    estimatedTime: '45 min',
    assignedEmployee: 'Operator',
    lastRun: '2026-04-07',
    steps: [
      { label: 'Send welcome email with portal access link', critical: true },
      { label: 'Create dedicated Slack channel for client', critical: false },
      { label: 'Collect ad account access (Meta Business Manager)', critical: true },
      { label: 'Collect Google / GHL access credentials', critical: true },
      { label: 'Schedule kickoff call within 48 hours', critical: true },
      { label: 'Run initial account audit and document findings', critical: false },
      { label: 'Build campaign strategy document', critical: true },
      { label: 'Set up GHL pipeline stages for client', critical: false },
      { label: 'Configure AI chatbot / automations for client', critical: false },
      { label: 'Launch first campaign (draft → review → live)', critical: true },
      { label: 'Send day-7 check-in message', critical: false },
      { label: 'Deliver first weekly report', critical: true },
    ],
  },
  {
    id: 'lead-qualification',
    name: 'Lead Qualification',
    category: 'Sales',
    categoryColor: '#fbbf24',
    description: 'BANT-style qualification flow before handing a lead to the closer.',
    estimatedTime: '15 min',
    assignedEmployee: 'Closer',
    lastRun: '2026-04-09',
    steps: [
      { label: 'Review lead source and initial form answers', critical: true },
      { label: 'Check LinkedIn / website to gauge company size', critical: false },
      { label: 'Confirm budget range (> $2K/mo threshold)', critical: true },
      { label: 'Identify timeline — ready to start within 30 days?', critical: true },
      { label: 'Verify decision-maker on the call', critical: true },
      { label: 'Identify primary pain point (leads, retention, ops)', critical: true },
      { label: 'Score lead: Hot / Warm / Cold', critical: false },
      { label: 'Route to correct tier offer ($997 or $20K)', critical: true },
      { label: 'Log qualification notes in CRM', critical: false },
    ],
  },
  {
    id: 'content-publishing',
    name: 'Content Publishing',
    category: 'Marketing',
    categoryColor: '#f472b6',
    description: 'From raw idea to published and distributed across all platforms.',
    estimatedTime: '2–4 hours',
    assignedEmployee: 'Marketer',
    lastRun: '2026-04-08',
    steps: [
      { label: 'Select topic from content calendar', critical: false },
      { label: 'Research: pull key stats and talking points', critical: true },
      { label: 'Write script or outline (hook, body, CTA)', critical: true },
      { label: 'Film or produce raw content', critical: true },
      { label: 'Edit: cuts, captions, music, B-roll', critical: true },
      { label: 'Create thumbnail and cover assets', critical: false },
      { label: 'Write platform-specific captions with hashtags', critical: false },
      { label: 'Schedule across platforms (IG, YT, TikTok, FB)', critical: true },
      { label: 'Engage with comments for first hour after posting', critical: false },
      { label: 'Log performance baseline in tracker', critical: false },
    ],
  },
  {
    id: 'bug-triage',
    name: 'Bug Triage',
    category: 'Engineering',
    categoryColor: '#60a5fa',
    description: 'Classify, assign, and begin resolving reported bugs within one business day.',
    estimatedTime: '20 min',
    assignedEmployee: 'Code Agent',
    lastRun: '2026-04-09',
    steps: [
      { label: 'Pull all new bug reports from issue tracker', critical: true },
      { label: 'Reproduce each bug in staging environment', critical: true },
      { label: 'Classify severity: P0 / P1 / P2 / P3', critical: true },
      { label: 'Check if bug is a regression (compare with last release)', critical: false },
      { label: 'Assign P0/P1 bugs immediately, notify on-call engineer', critical: true },
      { label: 'Write clear reproduction steps for each issue', critical: false },
      { label: 'Link related issues and PRs in tracker', critical: false },
      { label: 'Update bug count in weekly status dashboard', critical: false },
    ],
  },
  {
    id: 'monthly-revenue-review',
    name: 'Monthly Revenue Review',
    category: 'Finance',
    categoryColor: '#4ade80',
    description: 'Full P&L walkthrough, pipeline forecast, and next-month goal setting.',
    estimatedTime: '60 min',
    assignedEmployee: 'Wealth Strategist',
    lastRun: '2026-04-01',
    steps: [
      { label: 'Pull Stripe MRR, new MRR, churn MRR, expansion MRR', critical: true },
      { label: 'Reconcile ad spend vs. revenue per channel', critical: true },
      { label: 'Calculate blended CAC and LTV by cohort', critical: true },
      { label: 'Review outstanding invoices and collections', critical: true },
      { label: 'Update 3-month revenue forecast model', critical: false },
      { label: 'Identify top-3 cost reduction opportunities', critical: false },
      { label: 'Set revenue targets and KPIs for next month', critical: true },
      { label: 'Share report with leadership via Slack', critical: true },
      { label: 'Archive report in financial history folder', critical: false },
    ],
  },
]

// ── localStorage helpers ──────────────────────────────────────────────────────

function loadProgress(id: string): PlaybookProgress | null {
  try {
    const raw = localStorage.getItem(`blade-playbook-${id}`)
    if (!raw) return null
    const p = JSON.parse(raw) as PlaybookProgress
    if (!Array.isArray(p.checked) || typeof p.startTime !== 'number') return null
    return p
  } catch {
    return null
  }
}

function saveProgress(id: string, p: PlaybookProgress): void {
  try {
    localStorage.setItem(`blade-playbook-${id}`, JSON.stringify(p))
  } catch {
    // ignore storage errors
  }
}

function clearProgress(id: string): void {
  try {
    localStorage.removeItem(`blade-playbook-${id}`)
  } catch {
    // ignore
  }
}

function loadCompleted(): CompletedEntry[] {
  try {
    const raw = localStorage.getItem('blade-playbooks-completed')
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as CompletedEntry[]) : []
  } catch {
    return []
  }
}

function saveCompleted(entry: CompletedEntry): void {
  try {
    const all = loadCompleted()
    all.push(entry)
    localStorage.setItem('blade-playbooks-completed', JSON.stringify(all))
  } catch {
    // ignore
  }
}

function getLastCompleted(id: string): CompletedEntry | null {
  const all = loadCompleted().filter((e) => e.playbookId === id)
  if (all.length === 0) return null
  return all.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())[0]
}

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function timeAgo(iso: string): string {
  try {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  } catch {
    return ''
  }
}

function formatDate(str: string): string {
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Playbook Card ─────────────────────────────────────────────────────────────

function PlaybookCard({
  playbook,
  onRun,
  completionTick,
}: {
  playbook: Playbook
  onRun: (p: Playbook) => void
  completionTick: number
}) {
  // Re-read localStorage when completionTick changes
  const lastCompleted = completionTick >= 0 ? getLastCompleted(playbook.id) : null
  const inProgress = loadProgress(playbook.id)
  const hasInProgress = inProgress !== null && Array.isArray(inProgress.checked) && inProgress.checked.some(Boolean)

  return (
    <div className="flex flex-col rounded-xl border border-white/10 bg-white/5 p-5 transition-all hover:border-white/20">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-zinc-100">{playbook.name}</p>
        <span
          className="flex-shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
          style={{
            backgroundColor: `${playbook.categoryColor}20`,
            color: playbook.categoryColor,
            border: `1px solid ${playbook.categoryColor}35`,
          }}
        >
          {playbook.category}
        </span>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-zinc-500">{playbook.description}</p>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-600">
        <span>≡ {playbook.steps.length} steps</span>
        <span>⏱ {playbook.estimatedTime}</span>
        <span>👤 {playbook.assignedEmployee}</span>
      </div>

      <div className="mt-3">
        {lastCompleted ? (
          <span className="inline-block rounded-md bg-violet-500/10 px-2 py-1 text-[11px] text-violet-400">
            Last completed {timeAgo(lastCompleted.completedAt)}
          </span>
        ) : (
          <span className="inline-block rounded-md bg-white/5 px-2 py-1 text-[11px] text-zinc-600">
            Last run {formatDate(playbook.lastRun)}
          </span>
        )}
      </div>

      {hasInProgress && (
        <div className="mt-2 rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-400">
          In progress — resume where you left off
        </div>
      )}

      <button
        onClick={() => onRun(playbook)}
        className="mt-auto pt-4 w-full rounded-xl py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-80"
        style={{ backgroundColor: '#a78bfa' }}
      >
        {hasInProgress ? 'Resume Playbook' : 'Run Playbook'}
      </button>
    </div>
  )
}

// ── Playbook Runner ───────────────────────────────────────────────────────────

function PlaybookRunner({
  playbook,
  onBack,
  onCompleted,
}: {
  playbook: Playbook
  onBack: () => void
  onCompleted: (entry: CompletedEntry) => void
}) {
  const startTimeRef = useRef<number>(
    (() => {
      const saved = loadProgress(playbook.id)
      return saved ? saved.startTime : Date.now()
    })()
  )

  const [checked, setChecked] = useState<boolean[]>(() => {
    const saved = loadProgress(playbook.id)
    if (saved && saved.checked.length === playbook.steps.length) return saved.checked
    return new Array(playbook.steps.length).fill(false)
  })

  const [elapsed, setElapsed] = useState<number>(
    Math.floor((Date.now() - startTimeRef.current) / 1000)
  )
  const [done, setDone] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!done) {
      saveProgress(playbook.id, { checked, startTime: startTimeRef.current })
    }
  }, [checked, done, playbook.id])

  function toggle(i: number) {
    setChecked((prev) => {
      const next = [...prev]
      next[i] = !next[i]
      return next
    })
  }

  function handleComplete() {
    if (timerRef.current) clearInterval(timerRef.current)
    const finalElapsed = Math.floor((Date.now() - startTimeRef.current) / 1000)
    const entry: CompletedEntry = {
      playbookId: playbook.id,
      completedAt: new Date().toISOString(),
      elapsedSec: finalElapsed,
    }
    saveCompleted(entry)
    clearProgress(playbook.id)
    onCompleted(entry)
    setDone(true)
  }

  const doneCount = checked.filter(Boolean).length
  const total = playbook.steps.length
  const pct = Math.round((doneCount / total) * 100)
  const allDone = doneCount === total

  if (done) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-white/5 p-12 text-center">
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10 text-3xl text-emerald-400">
          ✓
        </div>
        <p className="text-xl font-bold text-zinc-100">Playbook Complete</p>
        <p className="mt-1 text-sm text-zinc-500">
          {playbook.name} — finished in {formatElapsed(elapsed)}
        </p>
        <p className="mt-1 text-xs text-zinc-600">{total} steps executed.</p>
        <button
          onClick={onBack}
          className="mt-6 rounded-xl px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-80"
          style={{ backgroundColor: '#a78bfa' }}
        >
          Back to Library
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
        >
          ← Back to Library
        </button>
        <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-sm text-zinc-400">
          {formatElapsed(elapsed)}
        </span>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span
            className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
            style={{
              backgroundColor: `${playbook.categoryColor}20`,
              color: playbook.categoryColor,
              border: `1px solid ${playbook.categoryColor}35`,
            }}
          >
            {playbook.category}
          </span>
          <span className="text-xs text-zinc-600">{playbook.estimatedTime}</span>
          <span className="text-xs text-zinc-600">· {playbook.assignedEmployee}</span>
        </div>
        <h2 className="text-lg font-bold text-zinc-100">{playbook.name}</h2>
        <p className="mt-1 text-sm text-zinc-500">{playbook.description}</p>

        <div className="mt-4">
          <div className="mb-1.5 flex justify-between text-xs text-zinc-600">
            <span>{doneCount}/{total} steps</span>
            <span>{pct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${pct}%`, backgroundColor: '#a78bfa' }}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {playbook.steps.map((step, i) => (
          <button
            key={i}
            onClick={() => toggle(i)}
            className="flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-all"
            style={{
              backgroundColor: checked[i] ? 'rgba(167,139,250,0.08)' : 'rgba(255,255,255,0.03)',
              borderColor: checked[i]
                ? 'rgba(167,139,250,0.3)'
                : step.critical
                ? 'rgba(255,255,255,0.12)'
                : 'rgba(255,255,255,0.07)',
              borderLeftColor: step.critical && !checked[i] ? '#fbbf24' : undefined,
              borderLeftWidth: step.critical && !checked[i] ? '3px' : undefined,
            }}
          >
            <div
              className="mt-0.5 h-5 w-5 flex-shrink-0 rounded-md border transition-all"
              style={{
                backgroundColor: checked[i] ? '#a78bfa' : 'transparent',
                borderColor: checked[i] ? '#a78bfa' : 'rgba(255,255,255,0.2)',
              }}
            >
              {checked[i] && (
                <span className="flex h-full w-full items-center justify-center text-[10px] font-bold text-white">
                  ✓
                </span>
              )}
            </div>
            <span
              className="flex-1 text-sm leading-snug"
              style={{
                color: checked[i] ? '#52525b' : '#d4d4d8',
                textDecoration: checked[i] ? 'line-through' : 'none',
              }}
            >
              {step.critical && !checked[i] && (
                <span className="mr-1.5 text-amber-400" title="Critical step">
                  ⚡
                </span>
              )}
              {step.label}
            </span>
          </button>
        ))}
      </div>

      <div className="pb-8">
        <button
          onClick={handleComplete}
          disabled={!allDone}
          className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-all"
          style={{
            backgroundColor: allDone ? '#a78bfa' : 'rgba(255,255,255,0.07)',
            color: allDone ? '#fff' : '#52525b',
            cursor: allDone ? 'pointer' : 'not-allowed',
          }}
        >
          {allDone
            ? 'Complete Playbook'
            : `${total - doneCount} step${total - doneCount !== 1 ? 's' : ''} remaining`}
        </button>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PlaybooksPage() {
  const [active, setActive] = useState<Playbook | null>(null)
  const [completionTick, setCompletionTick] = useState(0)

  function handleCompleted() {
    setCompletionTick((t) => t + 1)
  }

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-[1500px]">
        {active ? (
          <PlaybookRunner
            playbook={active}
            onBack={() => setActive(null)}
            onCompleted={handleCompleted}
          />
        ) : (
          <>
            <div className="mb-8 rounded-[2rem] border border-white/10 bg-white/[0.04] px-6 py-7 shadow-[0_24px_90px_rgba(0,0,0,0.32)] backdrop-blur-xl sm:px-8">
              <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-violet-400">
                Workforce · Playbooks
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
                Executable SOPs
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-400">
                Codified standard operating procedures your agents follow to the letter. Run them, don&apos;t just read them.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PLAYBOOKS.map((p) => (
                <PlaybookCard
                  key={`${p.id}-${completionTick}`}
                  playbook={p}
                  onRun={setActive}
                  completionTick={completionTick}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
