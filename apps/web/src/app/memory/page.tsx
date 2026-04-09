'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  EmptyState,
  PageShell,
  Panel,
  PanelHeader,
} from '@/components/dashboard/cockpit-ui'

interface MemoryEntry {
  id: string
  key: string
  value: string
  category: string
  createdAt: string
}

type Category = 'all' | 'business' | 'customer' | 'decision' | 'preference' | 'sop'

const CATEGORIES: Category[] = ['all', 'business', 'customer', 'decision', 'preference', 'sop']

const CATEGORY_COLORS: Record<string, string> = {
  business: 'border-pink-400/20 bg-pink-400/10 text-pink-300',
  customer: 'border-blue-400/20 bg-blue-400/10 text-blue-300',
  decision: 'border-amber-400/20 bg-amber-400/10 text-amber-300',
  preference: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
  sop: 'border-purple-400/20 bg-purple-400/10 text-purple-300',
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function MemoryPage() {
  const [entries, setEntries] = useState<MemoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<Category>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [newCategory, setNewCategory] = useState<Exclude<Category, 'all'>>('business')
  const [saving, setSaving] = useState(false)

  const fetchMemory = useCallback(async () => {
    try {
      const res = await fetch('/api/memory')
      const json = await res.json()
      if (json.success) {
        setEntries(Array.isArray(json.data) ? json.data : [])
      } else {
        setError(json.error ?? 'Failed to load memory')
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMemory()
  }, [fetchMemory])

  const filtered = entries.filter((e) => {
    const matchesCategory = category === 'all' || e.category === category
    const matchesSearch =
      search === '' ||
      e.key.toLowerCase().includes(search.toLowerCase()) ||
      e.value.toLowerCase().includes(search.toLowerCase())
    return matchesCategory && matchesSearch
  })

  async function handleAdd() {
    if (!newKey.trim() || !newValue.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: newKey.trim(), value: newValue.trim(), category: newCategory }),
      })
      const json = await res.json()
      if (json.success) {
        setNewKey('')
        setNewValue('')
        setNewCategory('business')
        setShowAdd(false)
        await fetchMemory()
      }
    } catch {
      // silent — UI still functional
    } finally {
      setSaving(false)
    }
  }

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
      title="Business memory browser"
      description="The institutional knowledge your AI workforce draws from — business context, customer preferences, decisions, and SOPs."
      actions={
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="rounded-2xl px-4 py-2.5 text-sm font-semibold text-zinc-950 transition-transform duration-200 hover:scale-[1.01]"
          style={{ background: 'linear-gradient(to right, #f472b6, #db2777)' }}
        >
          + Add Memory
        </button>
      }
    >
      {showAdd && (
        <div className="mb-4 rounded-[1.75rem] border border-white/10 bg-white/[0.045] p-5 backdrop-blur-xl">
          <PanelHeader eyebrow="New Entry" title="Add to memory" />
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="Key (e.g. pricing_strategy)"
              className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-pink-400/40"
            />
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as Exclude<Category, 'all'>)}
              className="rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 outline-none transition-colors focus:border-pink-400/40"
            >
              {CATEGORIES.filter((c) => c !== 'all').map((c) => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
            <textarea
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="Value / content"
              rows={3}
              className="col-span-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-pink-400/40"
            />
          </div>
          <div className="mt-3 flex gap-3">
            <button
              onClick={handleAdd}
              disabled={saving || !newKey.trim() || !newValue.trim()}
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

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search memory…"
          className="flex-1 min-w-[200px] rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-pink-400/40"
        />
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] transition-colors ${
                category === c
                  ? 'text-zinc-950'
                  : 'border border-white/10 bg-white/[0.05] text-zinc-400 hover:text-zinc-200'
              }`}
              style={category === c ? { background: 'linear-gradient(to right, #f472b6, #db2777)' } : {}}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <EmptyState title="Failed to load memory" description={error} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No entries found"
          description={search || category !== 'all' ? 'Try adjusting your filters.' : 'Add the first memory entry to get started.'}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((entry) => (
            <Panel key={entry.id}>
              <div className="flex items-start justify-between gap-2 mb-3">
                <p className="text-sm font-semibold text-zinc-100 break-words">{entry.key}</p>
                <span
                  className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.15em] ${CATEGORY_COLORS[entry.category] ?? 'border-white/10 bg-white/[0.05] text-zinc-400'}`}
                >
                  {entry.category}
                </span>
              </div>
              <p className="text-sm leading-6 text-zinc-400 line-clamp-3">{entry.value}</p>
              <p className="mt-3 text-xs text-zinc-600">{formatDate(entry.createdAt)}</p>
            </Panel>
          ))}
        </div>
      )}
    </PageShell>
  )
}
