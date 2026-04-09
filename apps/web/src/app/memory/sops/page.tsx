'use client'

import { useState } from 'react'
import { PageShell, Panel, PanelHeader } from '@/components/dashboard/cockpit-ui'

interface SopStep {
  step: number
  instruction: string
}

interface Sop {
  id: string
  title: string
  department: string
  lastUpdated: string
  steps: SopStep[]
}

const MOCK_SOPS: Sop[] = [
  {
    id: 'sop-1',
    title: 'New Lead Intake & Qualification',
    department: 'Sales',
    lastUpdated: '2025-03-15',
    steps: [
      { step: 1, instruction: 'Verify lead source and UTM parameters in GHL contact record.' },
      { step: 2, instruction: 'Check if lead has interacted with any previous campaigns.' },
      { step: 3, instruction: 'Score lead based on ICP criteria: industry, team size, budget signal.' },
      { step: 4, instruction: 'Assign to the correct pipeline stage (Cold, Warm, Hot).' },
      { step: 5, instruction: 'Send personalized outreach within 5 minutes of form submission.' },
    ],
  },
  {
    id: 'sop-2',
    title: 'Client Onboarding Checklist',
    department: 'Operations',
    lastUpdated: '2025-03-28',
    steps: [
      { step: 1, instruction: 'Send welcome email with onboarding packet and Calendly link.' },
      { step: 2, instruction: 'Create client workspace in Airtable and share access.' },
      { step: 3, instruction: 'Schedule kickoff call within 48 hours of contract signing.' },
      { step: 4, instruction: 'Complete intake questionnaire on the call and log answers.' },
      { step: 5, instruction: 'Assign dedicated account manager and brief them on client context.' },
      { step: 6, instruction: 'Set up reporting dashboard and send first weekly summary by Friday.' },
    ],
  },
  {
    id: 'sop-3',
    title: 'Monthly Financial Review',
    department: 'Finance',
    lastUpdated: '2025-02-01',
    steps: [
      { step: 1, instruction: 'Pull revenue report from Stripe and cross-check with CRM closed deals.' },
      { step: 2, instruction: 'Reconcile all outstanding invoices and flag overdue accounts.' },
      { step: 3, instruction: 'Review ad spend against ROAS targets per campaign.' },
      { step: 4, instruction: 'Update cash flow projection spreadsheet for next 90 days.' },
      { step: 5, instruction: 'Present summary in Monday leadership meeting.' },
    ],
  },
  {
    id: 'sop-4',
    title: 'Social Content Publishing',
    department: 'Marketing',
    lastUpdated: '2025-04-01',
    steps: [
      { step: 1, instruction: 'Pull weekly content brief from Airtable content calendar.' },
      { step: 2, instruction: 'Review and approve copy and creative assets.' },
      { step: 3, instruction: 'Schedule posts in Buffer: LinkedIn (Tue/Thu), Instagram (daily), YouTube (Wed).' },
      { step: 4, instruction: 'Monitor engagement for first 2 hours post-publish and respond to comments.' },
      { step: 5, instruction: 'Log performance metrics (reach, CTR, saves) every Monday.' },
    ],
  },
  {
    id: 'sop-5',
    title: 'Support Ticket Resolution',
    department: 'Support',
    lastUpdated: '2025-03-10',
    steps: [
      { step: 1, instruction: 'Acknowledge ticket within 1 hour during business hours.' },
      { step: 2, instruction: 'Categorize issue: billing, technical, access, or feature request.' },
      { step: 3, instruction: 'Attempt resolution using knowledge base before escalating.' },
      { step: 4, instruction: 'Escalate to engineering if unresolved within 4 hours.' },
      { step: 5, instruction: 'Close ticket only after confirming resolution with the client.' },
      { step: 6, instruction: 'Log root cause in Notion defect tracker for pattern analysis.' },
    ],
  },
  {
    id: 'sop-6',
    title: 'Weekly Team Stand-Up',
    department: 'Leadership',
    lastUpdated: '2025-01-20',
    steps: [
      { step: 1, instruction: 'All employees submit async update in Slack by 9am Monday.' },
      { step: 2, instruction: 'Blade AI aggregates updates and surfaces blockers before the call.' },
      { step: 3, instruction: 'Leadership reviews KPI dashboard before the live 15-minute sync.' },
      { step: 4, instruction: 'Assign action items in Airtable with owner and due date.' },
      { step: 5, instruction: 'Send recap summary to all-hands Slack channel by EOD Monday.' },
    ],
  },
]

const ALL_DEPARTMENTS = ['All', 'Sales', 'Operations', 'Finance', 'Marketing', 'Support', 'Leadership']

const DEPT_COLORS: Record<string, string> = {
  Sales: '#f472b6',
  Operations: '#94a3b8',
  Finance: '#34d399',
  Marketing: '#f59e0b',
  Support: '#60a5fa',
  Leadership: '#a78bfa',
}

export default function SopsPage() {
  const [activeDept, setActiveDept] = useState('All')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const filtered = activeDept === 'All' ? MOCK_SOPS : MOCK_SOPS.filter((s) => s.department === activeDept)

  const grouped = filtered.reduce<Record<string, Sop[]>>((acc, sop) => {
    const key = sop.department
    return { ...acc, [key]: [...(acc[key] ?? []), sop] }
  }, {})

  function toggleSop(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <PageShell
      eyebrow="Memory / SOPs"
      title="Standard operating procedures"
      description="Department-organized procedures your AI workforce follows. Expand any SOP to see step-by-step instructions."
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {ALL_DEPARTMENTS.map((d) => (
          <button
            key={d}
            onClick={() => setActiveDept(d)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] transition-colors ${
              activeDept === d
                ? 'text-zinc-950'
                : 'border border-white/10 bg-white/[0.05] text-zinc-400 hover:text-zinc-200'
            }`}
            style={activeDept === d ? { background: 'linear-gradient(to right, #f472b6, #db2777)' } : {}}
          >
            {d}
          </button>
        ))}
      </div>

      <div className="space-y-6">
        {Object.entries(grouped).map(([dept, sops]) => (
          <Panel key={dept}>
            <PanelHeader
              eyebrow="Department"
              title={dept}
              aside={
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: DEPT_COLORS[dept] ?? '#94a3b8' }}
                />
              }
            />
            <div className="space-y-3">
              {sops.map((sop) => (
                <div
                  key={sop.id}
                  className="rounded-[1.3rem] border border-white/10 bg-zinc-950/45 overflow-hidden"
                >
                  <button
                    onClick={() => toggleSop(sop.id)}
                    className="w-full flex items-center justify-between px-5 py-4 text-left"
                  >
                    <div>
                      <p className="text-sm font-semibold text-zinc-100">{sop.title}</p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {sop.steps.length} steps · Updated {sop.lastUpdated}
                      </p>
                    </div>
                    <span
                      className={`ml-4 shrink-0 text-zinc-500 transition-transform duration-200 ${expanded[sop.id] ? 'rotate-180' : ''}`}
                      style={{ display: 'inline-block' }}
                    >
                      ▾
                    </span>
                  </button>

                  {expanded[sop.id] && (
                    <div className="border-t border-white/10 px-5 pb-5 pt-4">
                      <ol className="space-y-3">
                        {sop.steps.map((s) => (
                          <li key={s.step} className="flex gap-4">
                            <span
                              className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-zinc-950"
                              style={{ background: 'linear-gradient(to bottom right, #f472b6, #db2777)' }}
                            >
                              {s.step}
                            </span>
                            <p className="text-sm leading-6 text-zinc-300">{s.instruction}</p>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Panel>
        ))}
      </div>
    </PageShell>
  )
}
