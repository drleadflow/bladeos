'use client'

import { useState } from 'react'
import { PageShell, Panel, PanelHeader, Badge } from '@/components/dashboard/cockpit-ui'

interface Analysis {
  bestCase: string
  worstCase: string
  mostLikely: string
  doNothing: string
  recommendation: string
  confidence: string
}

const CASES = [
  { key: 'bestCase', label: 'Best Case', icon: '🟢', tone: 'emerald', description: 'If everything goes right' },
  { key: 'worstCase', label: 'Worst Case', icon: '🔴', tone: 'rose', description: 'If everything goes wrong' },
  { key: 'mostLikely', label: 'Most Likely', icon: '🔵', tone: 'cyan', description: 'The probable outcome' },
  { key: 'doNothing', label: 'Do Nothing', icon: '⚪', tone: 'neutral', description: 'Cost of inaction' },
] as const

type CaseTone = 'emerald' | 'rose' | 'cyan' | 'none'

const TONE_MAP: Record<string, CaseTone> = {
  emerald: 'emerald',
  rose: 'rose',
  cyan: 'cyan',
  neutral: 'none',
}

export default function CompassPage() {
  const [decision, setDecision] = useState('')
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const analyze = async () => {
    if (!decision.trim() || decision.length < 10) return
    setLoading(true)
    setError('')
    setAnalysis(null)

    try {
      const res = await fetch('/api/compass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      })
      const json = (await res.json()) as { success: boolean; data?: Analysis; error?: string }
      if (json.success && json.data) {
        setAnalysis(json.data)
      } else {
        setError(json.error ?? 'Analysis failed')
      }
    } catch {
      setError('Failed to connect')
    } finally {
      setLoading(false)
    }
  }

  const confidenceTone = (c: string): 'emerald' | 'amber' | 'rose' => {
    if (c === 'high') return 'emerald'
    if (c === 'medium') return 'amber'
    return 'rose'
  }

  return (
    <PageShell
      eyebrow="Decision Intelligence"
      title="Clarity Compass"
      description="4-Case decision filter — cut through noise and act with conviction"
    >
      {/* Input */}
      <Panel className="mb-6">
        <PanelHeader
          title="What decision are you facing?"
          description="Describe the choice, the stakes, and any constraints"
        />
        <textarea
          value={decision}
          onChange={e => setDecision(e.target.value)}
          placeholder="e.g., Should we hire a senior engineer now or wait until Q3 when revenue is more predictable?"
          className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-cyan-400/30"
          rows={3}
        />
        <div className="mt-4 flex items-center gap-4">
          <button
            onClick={analyze}
            disabled={loading || decision.length < 10}
            className="rounded-xl bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-600 px-6 py-2.5 text-sm font-semibold text-zinc-950 transition-all hover:scale-[1.01] disabled:opacity-40 disabled:hover:scale-100"
          >
            {loading ? 'Analyzing...' : 'Analyze Decision'}
          </button>
          {error && <p className="text-sm text-rose-400">{error}</p>}
        </div>
      </Panel>

      {/* Results */}
      {analysis && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {CASES.map(c => (
              <Panel key={c.key} glow={TONE_MAP[c.tone]}>
                <PanelHeader eyebrow={c.description} title={`${c.icon} ${c.label}`} />
                <p className="text-sm leading-relaxed text-zinc-300">
                  {analysis[c.key as keyof Analysis] || '—'}
                </p>
              </Panel>
            ))}
          </div>

          {/* Recommendation */}
          <Panel glow="cyan">
            <PanelHeader
              title="Recommendation"
              aside={
                <Badge tone={confidenceTone(analysis.confidence)}>
                  {analysis.confidence} confidence
                </Badge>
              }
            />
            <p className="text-base font-medium leading-relaxed text-zinc-200">
              {analysis.recommendation}
            </p>
          </Panel>
        </>
      )}
    </PageShell>
  )
}
