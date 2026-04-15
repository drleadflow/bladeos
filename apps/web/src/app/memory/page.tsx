'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  EmptyState,
  PageShell,
  Panel,
  PanelHeader,
  MetricCard,
} from '@/components/dashboard/cockpit-ui'

// ── Types ───────────────────────────────────────────────────

interface MemoryEntry {
  id: string
  content: string
  type: string
  tagsJson: string
  confidence: number
  importance: string
  pinned: number
  scope: string
  createdAt: string
  accessCount: number
}

interface InsightEntry {
  id: string
  content: string
  tagsJson: string
  confidence: number
  createdAt: string
  sourceMemoryIds: string
  patternDescription: string
}

interface MemoryStats {
  total: number
  pinnedCount: number
  avgConfidence: number
  decayingCount: number
  insightCount: number
  lastConsolidation: string | null
  byType: { type: string; count: number }[]
  byImportance: { importance: string; count: number }[]
}

type Tab = 'all' | 'pinned' | 'insights'
type ImportanceFilter = 'all' | 'critical' | 'high' | 'medium' | 'low'

const IMPORTANCE_COLORS: Record<string, string> = {
  critical: 'border-rose-400/30 bg-rose-400/15 text-rose-300',
  high: 'border-amber-400/30 bg-amber-400/15 text-amber-300',
  medium: 'border-blue-400/30 bg-blue-400/15 text-blue-300',
  low: 'border-zinc-400/30 bg-zinc-400/15 text-zinc-400',
}

const IMPORTANCE_BAR_COLORS: Record<string, string> = {
  critical: 'bg-rose-400',
  high: 'bg-amber-400',
  medium: 'bg-blue-400',
  low: 'bg-zinc-500',
}

const TYPE_COLORS: Record<string, string> = {
  fact: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-300',
  preference: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
  skill_result: 'border-purple-400/20 bg-purple-400/10 text-purple-300',
  error_pattern: 'border-rose-400/20 bg-rose-400/10 text-rose-300',
  insight: 'border-amber-400/20 bg-amber-400/10 text-amber-300',
  conversation: 'border-blue-400/20 bg-blue-400/10 text-blue-300',
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function parseTags(tagsJson: string): string[] {
  try { return JSON.parse(tagsJson ?? '[]') } catch { return [] }
}

function healthColor(avg: number): 'emerald' | 'amber' | 'rose' {
  if (avg >= 0.5) return 'emerald'
  if (avg >= 0.3) return 'amber'
  return 'rose'
}

// ── Component ───────────────────────────────────────────────

export default function MemoryPage() {
  const [entries, setEntries] = useState<MemoryEntry[]>([])
  const [insights, setInsights] = useState<InsightEntry[]>([])
  const [stats, setStats] = useState<MemoryStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('all')
  const [search, setSearch] = useState('')
  const [importanceFilter, setImportanceFilter] = useState<ImportanceFilter>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [newContent, setNewContent] = useState('')
  const [newType, setNewType] = useState('fact')
  const [newTags, setNewTags] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchAll = useCallback(async () => {
    try {
      const [memRes, statsRes, insightsRes] = await Promise.all([
        fetch('/api/memory'),
        fetch('/api/memory/stats'),
        fetch('/api/memory/insights'),
      ])
      const [memJson, statsJson, insightsJson] = await Promise.all([
        memRes.json(),
        statsRes.json(),
        insightsRes.json(),
      ])

      if (memJson.success) setEntries(Array.isArray(memJson.data) ? memJson.data : [])
      if (statsJson.success) setStats(statsJson.data)
      if (insightsJson.success) setInsights(Array.isArray(insightsJson.data) ? insightsJson.data : [])
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function handlePin(id: string, pinned: boolean) {
    await fetch('/api/memory/pinned', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, pinned }),
    })
    await fetchAll()
  }

  async function handleDelete(id: string) {
    await fetch('/api/memory', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await fetchAll()
  }

  async function handleAdd() {
    if (!newContent.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newContent.trim(),
          type: newType,
          tags: newTags ? newTags.split(',').map(t => t.trim()) : [],
        }),
      })
      const json = await res.json()
      if (json.success) {
        setNewContent('')
        setNewTags('')
        setShowAdd(false)
        await fetchAll()
      }
    } catch { /* silent */ } finally {
      setSaving(false)
    }
  }

  const filtered = entries.filter(e => {
    const matchesImportance = importanceFilter === 'all' || e.importance === importanceFilter
    const matchesSearch = search === '' ||
      e.content.toLowerCase().includes(search.toLowerCase()) ||
      parseTags(e.tagsJson).some(t => t.toLowerCase().includes(search.toLowerCase()))
    const matchesTab = tab === 'all' ? true : tab === 'pinned' ? e.pinned === 1 : false
    return matchesImportance && matchesSearch && matchesTab
  })

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: '#f472b6', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return (
    <PageShell
      eyebrow="Memory"
      title="Multi-layer memory system"
      description="Pinned facts, auto-classified knowledge, AI-synthesized insights, and decaying context — all feeding your AI workforce."
      actions={
        <button
          onClick={() => setShowAdd(v => !v)}
          className="rounded-2xl px-4 py-2.5 text-sm font-semibold text-zinc-950 transition-transform duration-200 hover:scale-[1.01]"
          style={{ background: 'linear-gradient(to right, #f472b6, #db2777)' }}
        >
          + Add Memory
        </button>
      }
    >
      {/* ── Health + Importance Stats ─────────────────────────── */}
      {stats && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Total Memories"
            value={stats.total.toString()}
            hint={`${stats.pinnedCount} pinned`}
            accent="cyan"
          />
          <MetricCard
            label="Health"
            value={`${Math.round(stats.avgConfidence * 100)}%`}
            hint={`Avg confidence`}
            accent={healthColor(stats.avgConfidence)}
          />
          <MetricCard
            label="Insights"
            value={stats.insightCount.toString()}
            hint={stats.lastConsolidation ? `Last: ${formatDate(stats.lastConsolidation)}` : 'No consolidation yet'}
            accent="amber"
          />
          <MetricCard
            label="Decaying"
            value={stats.decayingCount.toString()}
            hint="Confidence < 30%"
            accent={stats.decayingCount > 10 ? 'rose' as const : 'emerald' as const}
          />
        </div>
      )}

      {/* ── Importance Distribution ───────────────────────────── */}
      {stats && stats.byImportance.length > 0 && (
        <Panel className="mb-6">
          <PanelHeader eyebrow="Distribution" title="Importance breakdown" />
          <div className="space-y-2">
            {(['critical', 'high', 'medium', 'low'] as const).map(level => {
              const entry = stats.byImportance.find(b => b.importance === level)
              const count = entry?.count ?? 0
              const pct = stats.total > 0 ? (count / stats.total) * 100 : 0
              return (
                <div key={level} className="flex items-center gap-3">
                  <span className="w-16 text-xs font-semibold uppercase tracking-wider text-zinc-400">{level}</span>
                  <div className="flex-1 h-2 rounded-full bg-white/[0.05] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${IMPORTANCE_BAR_COLORS[level]}`}
                      style={{ width: `${Math.max(pct, 1)}%` }}
                    />
                  </div>
                  <span className="w-10 text-right text-xs text-zinc-500">{count}</span>
                </div>
              )
            })}
          </div>
        </Panel>
      )}

      {/* ── Add Memory Form ──────────────────────────────────── */}
      {showAdd && (
        <div className="mb-4 rounded-[1.75rem] border border-white/10 bg-white/[0.045] p-5 backdrop-blur-xl">
          <PanelHeader eyebrow="New Entry" title="Add to memory" />
          <div className="grid gap-3 sm:grid-cols-2">
            <select
              value={newType}
              onChange={e => setNewType(e.target.value)}
              className="rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-pink-400/40"
            >
              <option value="fact">Fact</option>
              <option value="preference">Preference</option>
              <option value="error_pattern">Error Pattern</option>
              <option value="skill_result">Skill Result</option>
            </select>
            <input
              value={newTags}
              onChange={e => setNewTags(e.target.value)}
              placeholder="Tags (comma-separated)"
              className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-pink-400/40"
            />
            <textarea
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              placeholder="Memory content"
              rows={3}
              className="col-span-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-pink-400/40"
            />
          </div>
          <div className="mt-3 flex gap-3">
            <button
              onClick={handleAdd}
              disabled={saving || !newContent.trim()}
              className="rounded-2xl px-5 py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-50"
              style={{ background: 'linear-gradient(to right, #f472b6, #db2777)' }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="rounded-2xl border border-white/10 bg-white/[0.05] px-5 py-2.5 text-sm font-semibold text-zinc-300 hover:bg-white/[0.08]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Tabs ─────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1">
          {(['all', 'pinned', 'insights'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-xl px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
                tab === t
                  ? 'bg-white/[0.1] text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t === 'all' ? `All (${entries.length})` : t === 'pinned' ? `Pinned (${entries.filter(e => e.pinned).length})` : `Insights (${insights.length})`}
            </button>
          ))}
        </div>

        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search memory…"
          className="flex-1 min-w-[200px] rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-pink-400/40"
        />

        {tab !== 'insights' && (
          <div className="flex gap-1.5">
            {(['all', 'critical', 'high', 'medium', 'low'] as const).map(level => (
              <button
                key={level}
                onClick={() => setImportanceFilter(level)}
                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                  importanceFilter === level
                    ? 'text-zinc-950'
                    : 'border border-white/10 bg-white/[0.05] text-zinc-500 hover:text-zinc-300'
                }`}
                style={importanceFilter === level ? { background: 'linear-gradient(to right, #f472b6, #db2777)' } : {}}
              >
                {level}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Content ──────────────────────────────────────────── */}
      {error ? (
        <EmptyState title="Failed to load memory" description={error} />
      ) : tab === 'insights' ? (
        // Insights tab
        insights.length === 0 ? (
          <EmptyState title="No insights yet" description="The consolidation engine creates insights every 12 hours from patterns in your memories." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {insights.map(insight => {
              const sourceIds = (() => {
                try { return JSON.parse(insight.sourceMemoryIds ?? '[]') } catch { return [] }
              })() as string[]
              return (
                <Panel key={insight.id} glow="amber">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-amber-400 text-sm">&#9733;</span>
                    <p className="text-sm font-semibold text-zinc-100">{insight.patternDescription}</p>
                  </div>
                  <p className="text-sm leading-6 text-zinc-400">{insight.content}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[10px] text-zinc-600">From {sourceIds.length} memories</span>
                    <span className="text-xs text-zinc-600">{formatDate(insight.createdAt)}</span>
                  </div>
                </Panel>
              )
            })}
          </div>
        )
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No memories found"
          description={search || importanceFilter !== 'all' ? 'Try adjusting your filters.' : tab === 'pinned' ? 'Pin important memories to keep them always active.' : 'Add the first memory to get started.'}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(entry => {
            const tags = parseTags(entry.tagsJson)
            return (
              <Panel key={entry.id} glow={entry.pinned ? 'cyan' : undefined}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {entry.pinned === 1 && (
                      <span className="shrink-0 text-cyan-400 text-xs" title="Pinned">&#128204;</span>
                    )}
                    <span className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${TYPE_COLORS[entry.type] ?? 'border-white/10 bg-white/[0.05] text-zinc-400'}`}>
                      {entry.type}
                    </span>
                    <span className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${IMPORTANCE_COLORS[entry.importance] ?? IMPORTANCE_COLORS.medium}`}>
                      {entry.importance}
                    </span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => handlePin(entry.id, !entry.pinned)}
                      className="rounded-lg p-1.5 text-xs text-zinc-500 hover:bg-white/[0.08] hover:text-zinc-200 transition-colors"
                      title={entry.pinned ? 'Unpin' : 'Pin'}
                    >
                      {entry.pinned ? '&#128204;' : '&#128392;'}
                    </button>
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="rounded-lg p-1.5 text-xs text-zinc-500 hover:bg-rose-400/10 hover:text-rose-400 transition-colors"
                      title="Delete"
                    >
                      &#128465;
                    </button>
                  </div>
                </div>
                <p className="text-sm leading-6 text-zinc-300 line-clamp-3">{entry.content}</p>
                {tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {tags.map(tag => (
                      <span key={tag} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-zinc-500">{tag}</span>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex items-center justify-between text-xs text-zinc-600">
                  <span>conf: {Math.round(entry.confidence * 100)}%</span>
                  <span>{formatDate(entry.createdAt)}</span>
                </div>
              </Panel>
            )
          })}
        </div>
      )}
    </PageShell>
  )
}
