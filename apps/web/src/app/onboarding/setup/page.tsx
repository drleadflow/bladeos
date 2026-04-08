'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Employee {
  slug: string
  icon: string
  name: string
  title: string
  description: string
  pillar: string
}

interface OnboardingQuestion {
  id: string
  label: string
  type: 'text' | 'select' | 'multiselect'
  placeholder?: string
  options?: string[]
}

const EMPLOYEE_QUESTIONS: Record<string, OnboardingQuestion[]> = {
  'the-closer': [
    { id: 'sales-style', label: 'How would you describe your sales style?', type: 'select', options: ['Consultative', 'Challenger', 'Relationship-based', 'Solution-selling'] },
    { id: 'avg-deal', label: 'What is your average deal size?', type: 'text', placeholder: 'e.g. $5,000' },
    { id: 'crm', label: 'What CRM do you use?', type: 'text', placeholder: 'e.g. GHL, HubSpot, Salesforce' },
  ],
  'the-nurture-engine': [
    { id: 'followup-channels', label: 'Which follow-up channels do you use?', type: 'multiselect', options: ['Email', 'SMS', 'WhatsApp', 'DM', 'Phone'] },
    { id: 'followup-frequency', label: 'How often should we follow up?', type: 'select', options: ['Daily', 'Every 2-3 days', 'Weekly', 'Custom cadence'] },
    { id: 'tone', label: 'What tone should follow-ups have?', type: 'select', options: ['Professional', 'Casual', 'Friendly', 'Direct'] },
  ],
  'the-cash-machine': [
    { id: 'revenue-model', label: 'What is your primary revenue model?', type: 'select', options: ['Subscription/SaaS', 'One-time sales', 'Services/retainer', 'E-commerce', 'Mixed'] },
    { id: 'monthly-revenue', label: 'Current monthly revenue range?', type: 'select', options: ['Pre-revenue', '$1K-$10K', '$10K-$50K', '$50K-$100K', '$100K+'] },
    { id: 'revenue-goal', label: 'Monthly revenue goal?', type: 'text', placeholder: 'e.g. $50,000/mo' },
  ],
  'the-marketer': [
    { id: 'platforms', label: 'Which platforms are you active on?', type: 'multiselect', options: ['YouTube', 'Instagram', 'TikTok', 'LinkedIn', 'X/Twitter', 'Facebook', 'Blog'] },
    { id: 'content-type', label: 'What content works best for you?', type: 'select', options: ['Long-form video', 'Short-form video', 'Written content', 'Podcasts', 'Mixed'] },
    { id: 'ad-budget', label: 'Monthly ad budget?', type: 'text', placeholder: 'e.g. $2,000/mo or N/A' },
  ],
  'the-operator': [
    { id: 'tools', label: 'What tools do you use daily?', type: 'multiselect', options: ['GHL', 'Notion', 'Slack', 'Asana', 'Monday', 'ClickUp', 'Zapier', 'Make'] },
    { id: 'team-size', label: 'How big is your team?', type: 'select', options: ['Just me', '2-5 people', '6-15 people', '15+'] },
    { id: 'biggest-bottleneck', label: 'Biggest operational bottleneck?', type: 'text', placeholder: 'e.g. Client onboarding takes too long' },
  ],
  'the-support-rep': [
    { id: 'support-channels', label: 'Where do customers reach you?', type: 'multiselect', options: ['Email', 'Live chat', 'Phone', 'Social DMs', 'Support portal'] },
    { id: 'avg-tickets', label: 'How many support requests per week?', type: 'select', options: ['1-10', '10-50', '50-100', '100+'] },
    { id: 'support-tone', label: 'What support tone do you prefer?', type: 'select', options: ['Professional & formal', 'Friendly & warm', 'Quick & direct', 'Empathetic & thorough'] },
  ],
  'the-code-agent': [
    { id: 'languages', label: 'Primary languages/frameworks?', type: 'multiselect', options: ['TypeScript', 'Python', 'React/Next.js', 'Node.js', 'Go', 'Rust', 'Other'] },
    { id: 'repos', label: 'Main project or repo URL?', type: 'text', placeholder: 'e.g. github.com/you/project' },
    { id: 'dev-focus', label: 'What do you need most help with?', type: 'select', options: ['New features', 'Bug fixes', 'Code reviews', 'Automation', 'Full-stack dev'] },
  ],
  'the-wellness-coach': [
    { id: 'health-goals', label: 'Top health goals?', type: 'multiselect', options: ['Weight loss', 'Muscle gain', 'Better sleep', 'More energy', 'Stress reduction', 'Nutrition'] },
    { id: 'exercise-freq', label: 'How often do you exercise?', type: 'select', options: ['Rarely', '1-2x/week', '3-4x/week', '5+/week'] },
    { id: 'health-note', label: 'Anything specific to track?', type: 'text', placeholder: 'e.g. Track water intake, stretching routine' },
  ],
  'the-wealth-strategist': [
    { id: 'financial-goal', label: 'Primary financial goal?', type: 'select', options: ['Save more', 'Invest wisely', 'Reduce debt', 'Build passive income', 'Retirement planning'] },
    { id: 'investing-style', label: 'Investing comfort level?', type: 'select', options: ['Conservative', 'Moderate', 'Aggressive', 'Not investing yet'] },
    { id: 'finance-note', label: 'Any specific financial focus?', type: 'text', placeholder: 'e.g. Real estate, crypto, index funds' },
  ],
  'the-connector': [
    { id: 'network-size', label: 'How large is your active network?', type: 'select', options: ['Small (under 50)', 'Medium (50-200)', 'Large (200-500)', 'Very large (500+)'] },
    { id: 'relationship-focus', label: 'Which relationships matter most?', type: 'multiselect', options: ['Family', 'Friends', 'Business partners', 'Mentors', 'Clients', 'Community'] },
    { id: 'connect-note', label: 'How can The Connector help most?', type: 'text', placeholder: 'e.g. Remember to check in with key people monthly' },
  ],
  'the-reflector': [
    { id: 'spiritual-practice', label: 'Current practices?', type: 'multiselect', options: ['Meditation', 'Journaling', 'Prayer', 'Breathwork', 'Gratitude', 'None yet'] },
    { id: 'reflection-freq', label: 'How often do you want to reflect?', type: 'select', options: ['Daily', 'A few times a week', 'Weekly', 'When I need it'] },
    { id: 'reflector-note', label: 'What does growth look like for you?', type: 'text', placeholder: 'e.g. More presence, less anxiety, deeper purpose' },
  ],
}

export default function SetupPage() {
  const router = useRouter()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [archetype, setArchetype] = useState<string>('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, Record<string, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('blade_onboarding')
    if (!stored) {
      router.push('/onboarding')
      return
    }

    const parsed = JSON.parse(stored) as { employees: Employee[]; archetype: string }
    setEmployees(parsed.employees)
    setArchetype(parsed.archetype)
    setLoaded(true)
  }, [router])

  if (!loaded || employees.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    )
  }

  const currentEmployee = employees[currentIndex]
  const questions = EMPLOYEE_QUESTIONS[currentEmployee.slug] ?? []
  const currentAnswers = answers[currentEmployee.slug] ?? {}
  const isLast = currentIndex === employees.length - 1
  const progress = ((currentIndex + 1) / employees.length) * 100

  function updateAnswer(questionId: string, value: string) {
    setAnswers((prev) => ({
      ...prev,
      [currentEmployee.slug]: {
        ...prev[currentEmployee.slug],
        [questionId]: value,
      },
    }))
  }

  function toggleMultiselect(questionId: string, option: string) {
    const current = currentAnswers[questionId] ?? ''
    const values = current ? current.split(',') : []
    const updated = values.includes(option)
      ? values.filter((v) => v !== option)
      : [...values, option]
    updateAnswer(questionId, updated.join(','))
  }

  function handleNext() {
    if (isLast) {
      handleSubmit()
    } else {
      setCurrentIndex((prev) => prev + 1)
    }
  }

  function handleBack() {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1)
    }
  }

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const res = await fetch('/api/employees/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employees: employees.map((e) => e.slug),
          archetype,
          answers,
        }),
      })

      const data = await res.json()
      if (data.success) {
        localStorage.removeItem('blade_onboarding')
        router.push('/')
      }
    } catch {
      // Allow retry
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="mx-auto max-w-2xl px-6 py-12">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
            <span>
              Employee {currentIndex + 1} of {employees.length}
            </span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Current Employee Header */}
        <div className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
          <div className="flex items-center gap-4">
            <span className="text-4xl">{currentEmployee.icon}</span>
            <div>
              <h2 className="text-xl font-bold text-zinc-100">{currentEmployee.name}</h2>
              <p className="text-sm text-zinc-500">{currentEmployee.title} &middot; {currentEmployee.description}</p>
            </div>
          </div>
        </div>

        {/* Questions */}
        <div className="space-y-6">
          {questions.length === 0 ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 text-center">
              <p className="text-sm text-zinc-400">
                No additional setup needed for {currentEmployee.name}. Hit continue to proceed.
              </p>
            </div>
          ) : (
            questions.map((q) => (
              <div key={q.id} className="space-y-2">
                <label className="block text-sm font-medium text-zinc-300">
                  {q.label}
                </label>

                {q.type === 'text' && (
                  <input
                    type="text"
                    value={currentAnswers[q.id] ?? ''}
                    onChange={(e) => updateAnswer(q.id, e.target.value)}
                    placeholder={q.placeholder}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30"
                  />
                )}

                {q.type === 'select' && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {q.options?.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => updateAnswer(q.id, opt)}
                        className={`rounded-lg border px-3 py-2 text-left text-sm transition-all duration-150 ${
                          currentAnswers[q.id] === opt
                            ? 'border-blue-500/60 bg-blue-500/10 text-blue-300'
                            : 'border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}

                {q.type === 'multiselect' && (
                  <div className="flex flex-wrap gap-2">
                    {q.options?.map((opt) => {
                      const selected = (currentAnswers[q.id] ?? '').split(',').includes(opt)
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => toggleMultiselect(q.id, opt)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
                            selected
                              ? 'border-blue-500/60 bg-blue-500/10 text-blue-300'
                              : 'border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:border-zinc-700 hover:text-zinc-400'
                          }`}
                        >
                          {selected ? '✓ ' : ''}{opt}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Navigation */}
        <div className="mt-10 flex items-center justify-between">
          <button
            onClick={handleBack}
            disabled={currentIndex === 0}
            className={`rounded-lg px-5 py-2.5 text-sm font-medium transition-colors ${
              currentIndex === 0
                ? 'cursor-not-allowed text-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Back
          </button>

          <button
            onClick={handleNext}
            disabled={submitting}
            className={`
              rounded-xl px-6 py-2.5 text-sm font-semibold transition-all duration-200
              ${
                submitting
                  ? 'cursor-wait bg-zinc-800 text-zinc-500'
                  : isLast
                    ? 'bg-gradient-to-r from-blue-600 to-emerald-600 text-white shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40'
                    : 'bg-blue-600 text-white shadow-lg shadow-blue-500/25 hover:bg-blue-500'
              }
            `}
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Setting up...
              </span>
            ) : isLast ? (
              'Start Using Blade'
            ) : (
              <span className="flex items-center gap-2">
                Next Employee
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
