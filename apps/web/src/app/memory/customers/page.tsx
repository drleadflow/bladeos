'use client'

import { useMemo, useState } from 'react'
import { EmptyState, PageShell, Panel } from '@/components/dashboard/cockpit-ui'

interface Customer {
  id: string
  name: string
  company: string
  email: string
  preferences: string[]
  historySummary: string
  lastInteraction: string
  notes: string
  status: 'active' | 'at-risk' | 'churned' | 'prospect'
}

const MOCK_CUSTOMERS: Customer[] = [
  {
    id: 'c-1',
    name: 'Marcus Holloway',
    company: 'Apex Wealth Advisors',
    email: 'marcus@apexwealth.com',
    preferences: ['Morning calls only', 'Prefers Loom videos over docs', 'High autonomy — minimal check-ins'],
    historySummary: 'Joined beta in Jan 2025. Closed deal on first call. Uses Blade daily for lead follow-up automation.',
    lastInteraction: '2025-04-06',
    notes: 'Referred two clients. Strong candidate for case study. Wants white-label option.',
    status: 'active',
  },
  {
    id: 'c-2',
    name: 'Priya Nair',
    company: 'Nair Digital Marketing',
    email: 'priya@nairdigital.co',
    preferences: ['Detailed written updates', 'Needs custom report templates', 'Timezone: IST (UTC+5:30)'],
    historySummary: 'Onboarded Feb 2025. Uses Blade for content scheduling and client reporting. Had one billing issue (resolved).',
    lastInteraction: '2025-04-02',
    notes: 'Requested Airtable integration improvement. Mentioned competitive pressure from Jasper.',
    status: 'active',
  },
  {
    id: 'c-3',
    name: 'Derek Simmons',
    company: 'FitCoach Pro',
    email: 'derek@fitcoachpro.com',
    preferences: ['Text-only communication', 'Wants weekly digest emails', 'Sensitive to pricing changes'],
    historySummary: 'Signed in March 2025. Has not logged in for 12 days. Support ticket open for onboarding confusion.',
    lastInteraction: '2025-03-25',
    notes: 'At risk. Assigned to re-engagement campaign. Scheduled follow-up call for Apr 14.',
    status: 'at-risk',
  },
  {
    id: 'c-4',
    name: 'Sofia Reyes',
    company: 'Reyes Law Group',
    email: 'sofia@reyeslaw.com',
    preferences: ['Encrypted file sharing only', 'No social content tools — compliance reasons', 'Formal communication style'],
    historySummary: 'Prospect since Q1. Evaluated against 3 competitors. High-value account ($2K+/mo potential).',
    lastInteraction: '2025-04-05',
    notes: 'Waiting on compliance review from their IT team. Follow up Apr 15 with legal use-case PDF.',
    status: 'prospect',
  },
  {
    id: 'c-5',
    name: 'Tyler Brooks',
    company: 'Brooks Construction LLC',
    email: 'tyler@brooksllc.com',
    preferences: ['Calls only — no email', 'Plain language, no jargon', 'Manual approval on all automations'],
    historySummary: 'Active for 6 months. One of the first 10 customers. Monthly revenue $497. Rarely escalates issues.',
    lastInteraction: '2025-04-07',
    notes: 'Asked about adding a second seat for his VA. Upsell opportunity.',
    status: 'active',
  },
  {
    id: 'c-6',
    name: 'Aisha Coleman',
    company: 'Coleman Consulting Group',
    email: 'aisha@colemanconsult.com',
    preferences: ['Dashboard-first, hates emails', 'Wants AI to be invisible (no AI disclaimers)', 'Responsive to upsells'],
    historySummary: 'Churned in Feb 2025 after pricing increase. Was most engaged user for 4 months. Outreach in progress.',
    lastInteraction: '2025-02-28',
    notes: 'Left because of price, not value. Win-back offer at $397/mo pending.',
    status: 'churned',
  },
]

const STATUS_STYLES: Record<Customer['status'], string> = {
  active: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
  'at-risk': 'border-amber-400/20 bg-amber-400/10 text-amber-300',
  churned: 'border-rose-400/20 bg-rose-400/10 text-rose-300',
  prospect: 'border-blue-400/20 bg-blue-400/10 text-blue-300',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function CustomerMemoryPage() {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return MOCK_CUSTOMERS.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
    )
  }, [search])

  return (
    <PageShell
      eyebrow="Memory / Customers"
      title="Customer memory"
      description="Preferences, history, and key context remembered across every touchpoint — so every interaction feels personal."
    >
      <div className="mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, company, or email…"
          className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-pink-400/40"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No customers found" description="Try a different search term." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <Panel key={c.id}>
              <div className="flex items-start justify-between gap-2 mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-zinc-950"
                    style={{ background: 'linear-gradient(to bottom right, #f472b6, #db2777)' }}
                  >
                    {c.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-zinc-100">{c.name}</p>
                    <p className="text-xs text-zinc-500">{c.company}</p>
                  </div>
                </div>
                <span
                  className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.15em] ${STATUS_STYLES[c.status]}`}
                >
                  {c.status}
                </span>
              </div>

              <div className="mb-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500 mb-1.5">Preferences</p>
                <ul className="space-y-1">
                  {c.preferences.map((p, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-zinc-400">
                      <span style={{ color: '#f472b6' }}>·</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mb-3 rounded-[1.1rem] border border-white/10 bg-zinc-950/40 px-3 py-2.5">
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500 mb-1">History</p>
                <p className="text-xs leading-5 text-zinc-400">{c.historySummary}</p>
              </div>

              <div className="mb-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500 mb-1">Notes</p>
                <p className="text-xs leading-5 text-zinc-400">{c.notes}</p>
              </div>

              <p className="text-xs text-zinc-600">Last interaction: {formatDate(c.lastInteraction)}</p>
            </Panel>
          ))}
        </div>
      )}
    </PageShell>
  )
}
