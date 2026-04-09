'use client'

import { useMemo, useState } from 'react'
import { EmptyState, PageShell, Panel, PanelHeader } from '@/components/dashboard/cockpit-ui'

interface Decision {
  id: string
  title: string
  context: string
  outcome: string
  madeBy: string
  date: string
  category: 'strategic' | 'product' | 'technical' | 'operational' | 'financial'
}

const MOCK_DECISIONS: Decision[] = [
  {
    id: 'd-1',
    title: 'Switch AI routing to Claude for chat, OpenRouter for background tasks',
    context: 'Background workers were consuming Claude quota and causing rate limits during peak chat hours.',
    outcome: 'Routing bifurcated: Claude handles all real-time chat, OpenRouter handles batch/background jobs. Rate limit incidents dropped to zero.',
    madeBy: 'Emeka',
    date: '2025-04-07',
    category: 'technical',
  },
  {
    id: 'd-2',
    title: 'Use GHL as primary CRM via MCP server rather than native API',
    context: 'Native GHL API required maintaining complex OAuth flows. MCP server exposes 508 tools with zero auth overhead.',
    outcome: 'Full GHL contact management, pipeline, and campaign data now available to all agents via MCP.',
    madeBy: 'Emeka',
    date: '2025-04-01',
    category: 'technical',
  },
  {
    id: 'd-3',
    title: 'Adopt Blade OS 7-section nav architecture',
    context: 'Original single-page design was becoming unwieldy. Needed clear separation between command, workforce, memory, and control surfaces.',
    outcome: 'Command Center, Revenue, Workforce, Operations, Engineering, Memory, Control — each as a first-class section.',
    madeBy: 'Emeka',
    date: '2025-03-28',
    category: 'product',
  },
  {
    id: 'd-4',
    title: 'Add approval gates before destructive agent actions',
    context: 'Agent loop was executing irreversible operations (DB migrations, mass emails) without human confirmation.',
    outcome: 'All actions tagged as destructive now pause and create an ApprovalRequest. Agents resume only after explicit approval.',
    madeBy: 'Emeka',
    date: '2025-03-20',
    category: 'operational',
  },
  {
    id: 'd-5',
    title: 'Monorepo with npm workspaces + Turborepo for the agent platform',
    context: 'Early single-package structure made it impossible to share types between CLI, web, and core agent loop.',
    outcome: 'Clean package boundaries: core, db, web, cli — shared types via @blade/core. Build times reduced by 60% with Turbo caching.',
    madeBy: 'Emeka',
    date: '2025-02-15',
    category: 'technical',
  },
  {
    id: 'd-6',
    title: 'Price Blade at $497/month for the beta cohort',
    context: 'Considered $197 (volume) vs $997 (premium). Beta customers need white-glove onboarding which increases per-customer cost.',
    outcome: '$497 chosen. 12 beta seats sold in first week. Onboarding cost covered with margin to spare.',
    madeBy: 'Emeka',
    date: '2025-01-30',
    category: 'financial',
  },
]

const CATEGORY_STYLES: Record<Decision['category'], string> = {
  strategic: 'border-purple-400/20 bg-purple-400/10 text-purple-300',
  product: 'border-pink-400/20 bg-pink-400/10 text-pink-300',
  technical: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-300',
  operational: 'border-amber-400/20 bg-amber-400/10 text-amber-300',
  financial: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function DecisionsPage() {
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const filtered = useMemo(() => {
    return MOCK_DECISIONS.filter((d) => {
      if (fromDate && d.date < fromDate) return false
      if (toDate && d.date > toDate) return false
      return true
    }).sort((a, b) => b.date.localeCompare(a.date))
  }, [fromDate, toDate])

  return (
    <PageShell
      eyebrow="Memory / Decisions"
      title="Decision log"
      description="A chronological record of every significant business and technical decision — context, outcome, and who made the call."
      actions={
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2 text-zinc-300 outline-none focus:border-pink-400/40"
          />
          <span className="text-zinc-600">to</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2 text-zinc-300 outline-none focus:border-pink-400/40"
          />
          {(fromDate || toDate) && (
            <button
              onClick={() => { setFromDate(''); setToDate('') }}
              className="rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200"
            >
              Clear
            </button>
          )}
        </div>
      }
    >
      {filtered.length === 0 ? (
        <EmptyState title="No decisions in range" description="Adjust the date filter to see decisions from a different period." />
      ) : (
        <div className="relative space-y-4 pl-6 before:absolute before:left-[11px] before:top-0 before:h-full before:w-px before:bg-white/10">
          {filtered.map((d) => (
            <div key={d.id} className="relative">
              <span
                className="absolute -left-[27px] top-5 h-3 w-3 rounded-full border-2 border-zinc-950"
                style={{ backgroundColor: '#f472b6' }}
              />
              <Panel>
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-100 leading-snug">{d.title}</p>
                    <p className="mt-1 text-xs text-zinc-500">{formatDate(d.date)} · {d.madeBy}</p>
                  </div>
                  <span
                    className={`shrink-0 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.15em] ${CATEGORY_STYLES[d.category]}`}
                  >
                    {d.category}
                  </span>
                </div>

                <PanelHeader eyebrow="Context" title="" />
                <p className="text-sm leading-6 text-zinc-400 -mt-4 mb-4">{d.context}</p>

                <div className="rounded-[1.1rem] border border-white/10 bg-zinc-950/40 px-4 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500 mb-1">Outcome</p>
                  <p className="text-sm leading-6 text-zinc-300">{d.outcome}</p>
                </div>
              </Panel>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  )
}
