'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { EmployeeCard } from '@/components/onboarding/employee-card'
import { ArchetypePicker } from '@/components/onboarding/archetype-picker'

interface Employee {
  slug: string
  icon: string
  name: string
  title: string
  description: string
  pillar: 'business' | 'health' | 'wealth' | 'relationships' | 'spirituality'
}

const BUSINESS_EMPLOYEES: Employee[] = [
  { slug: 'the-closer', icon: '🎯', name: 'The Closer', title: 'Sales', pillar: 'business', description: 'Handles objections, writes follow-ups, and closes deals while you sleep.' },
  { slug: 'the-nurture-engine', icon: '💌', name: 'The Nurture Engine', title: 'Follow-Up', pillar: 'business', description: 'Keeps every lead warm with perfectly timed, personalized touchpoints.' },
  { slug: 'the-cash-machine', icon: '💰', name: 'The Cash Machine', title: 'Revenue', pillar: 'business', description: 'Tracks revenue, finds upsell opportunities, and optimizes your pricing.' },
  { slug: 'the-marketer', icon: '📣', name: 'The Marketer', title: 'Content + Ads', pillar: 'business', description: 'Creates content, manages ad campaigns, and grows your brand presence.' },
  { slug: 'the-operator', icon: '⚙️', name: 'The Operator', title: 'Systems', pillar: 'business', description: 'Builds SOPs, automates workflows, and keeps operations running smoothly.' },
  { slug: 'the-support-rep', icon: '🛟', name: 'The Support Rep', title: 'Service', pillar: 'business', description: 'Responds to customer inquiries instantly with empathy and accuracy.' },
  { slug: 'the-code-agent', icon: '💻', name: 'The Code Agent', title: 'Dev', pillar: 'business', description: 'Ships features, fixes bugs, and reviews code across your projects.' },
]

const LIFE_EMPLOYEES: Employee[] = [
  { slug: 'the-wellness-coach', icon: '🏃', name: 'The Wellness Coach', title: 'Health', pillar: 'health', description: 'Tracks habits, suggests routines, and keeps your physical health on track.' },
  { slug: 'the-wealth-strategist', icon: '📈', name: 'The Wealth Strategist', title: 'Finance', pillar: 'wealth', description: 'Monitors spending, plans investments, and builds your financial future.' },
  { slug: 'the-connector', icon: '🤝', name: 'The Connector', title: 'Relationships', pillar: 'relationships', description: 'Remembers birthdays, suggests check-ins, and strengthens your network.' },
  { slug: 'the-reflector', icon: '🔮', name: 'The Reflector', title: 'Spirituality', pillar: 'spirituality', description: 'Guides journaling, meditation prompts, and personal growth reflection.' },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set())
  const [archetype, setArchetype] = useState<'coach' | 'operator' | null>(null)

  function toggleEmployee(slug: string) {
    setSelectedSlugs((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) {
        next.delete(slug)
      } else {
        next.add(slug)
      }
      return next
    })
  }

  function handleContinue() {
    if (selectedSlugs.size === 0 || !archetype) return

    const allEmployees = [...BUSINESS_EMPLOYEES, ...LIFE_EMPLOYEES]
    const selected = allEmployees.filter((e) => selectedSlugs.has(e.slug))

    localStorage.setItem(
      'blade_onboarding',
      JSON.stringify({
        employees: selected,
        archetype,
      })
    )

    router.push('/onboarding/setup')
  }

  const canContinue = selectedSlugs.size > 0 && archetype !== null

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="mx-auto max-w-5xl px-6 py-12">
        {/* Header */}
        <div className="mb-12 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/5 px-4 py-1.5">
            <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-xs font-medium text-blue-400">Getting Started</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-100 sm:text-5xl">
            Build Your Team
          </h1>
          <p className="mt-3 text-lg text-zinc-500">
            Pick the AI employees you need. You can always add more later.
          </p>
        </div>

        {/* Employee Grid — Two Sections */}
        <div className="grid gap-10 lg:grid-cols-2">
          {/* Business */}
          <div>
            <div className="mb-4 flex items-center gap-2">
              <div className="h-px flex-1 bg-gradient-to-r from-blue-500/40 to-transparent" />
              <span className="text-xs font-semibold uppercase tracking-widest text-blue-400">
                Business
              </span>
              <div className="h-px flex-1 bg-gradient-to-l from-blue-500/40 to-transparent" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {BUSINESS_EMPLOYEES.map((emp) => (
                <EmployeeCard
                  key={emp.slug}
                  icon={emp.icon}
                  name={emp.name}
                  title={emp.title}
                  description={emp.description}
                  pillar={emp.pillar}
                  selected={selectedSlugs.has(emp.slug)}
                  onToggle={() => toggleEmployee(emp.slug)}
                />
              ))}
            </div>
          </div>

          {/* Life */}
          <div>
            <div className="mb-4 flex items-center gap-2">
              <div className="h-px flex-1 bg-gradient-to-r from-emerald-500/40 to-transparent" />
              <span className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
                Life
              </span>
              <div className="h-px flex-1 bg-gradient-to-l from-emerald-500/40 to-transparent" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {LIFE_EMPLOYEES.map((emp) => (
                <EmployeeCard
                  key={emp.slug}
                  icon={emp.icon}
                  name={emp.name}
                  title={emp.title}
                  description={emp.description}
                  pillar={emp.pillar}
                  selected={selectedSlugs.has(emp.slug)}
                  onToggle={() => toggleEmployee(emp.slug)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Archetype Picker */}
        <div className="mt-14">
          <div className="mb-6 text-center">
            <h2 className="text-2xl font-bold text-zinc-100">Choose Your Style</h2>
            <p className="mt-2 text-sm text-zinc-500">
              This defines how your AI team communicates with you.
            </p>
          </div>
          <div className="mx-auto max-w-2xl">
            <ArchetypePicker selected={archetype} onSelect={setArchetype} />
          </div>
        </div>

        {/* Continue Button */}
        <div className="mt-12 flex justify-center">
          <button
            onClick={handleContinue}
            disabled={!canContinue}
            className={`
              relative rounded-xl px-8 py-3.5 text-sm font-semibold transition-all duration-200
              ${
                canContinue
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25 hover:bg-blue-500 hover:shadow-blue-500/40'
                  : 'cursor-not-allowed bg-zinc-800 text-zinc-600'
              }
            `}
          >
            {canContinue ? (
              <span className="flex items-center gap-2">
                Continue
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </span>
            ) : (
              `Select employees & style to continue`
            )}
          </button>
        </div>

        {/* Selection Summary */}
        {selectedSlugs.size > 0 && (
          <p className="mt-4 text-center text-xs text-zinc-600">
            {selectedSlugs.size} employee{selectedSlugs.size === 1 ? '' : 's'} selected
            {archetype ? ` · ${archetype === 'coach' ? 'Coach' : 'Operator'} style` : ''}
          </p>
        )}
      </div>
    </div>
  )
}
