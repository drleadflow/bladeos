import { NextRequest } from 'next/server'
import { initializeDb, employees, memories } from '@blade/db'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'

export const runtime = 'nodejs'

interface OnboardPayload {
  employees: string[]
  archetype: string
  answers: Record<string, Record<string, string>>
}

const EMPLOYEE_CATALOG: Record<string, { name: string; title: string; pillar: string; description: string; icon: string }> = {
  'the-closer': { name: 'The Closer', title: 'Sales', pillar: 'business', description: 'Handles objections, writes follow-ups, and closes deals while you sleep.', icon: '🎯' },
  'the-nurture-engine': { name: 'The Nurture Engine', title: 'Follow-Up', pillar: 'business', description: 'Keeps every lead warm with perfectly timed, personalized touchpoints.', icon: '💌' },
  'the-cash-machine': { name: 'The Cash Machine', title: 'Revenue', pillar: 'business', description: 'Tracks revenue, finds upsell opportunities, and optimizes your pricing.', icon: '💰' },
  'the-marketer': { name: 'The Marketer', title: 'Content + Ads', pillar: 'business', description: 'Creates content, manages ad campaigns, and grows your brand presence.', icon: '📣' },
  'the-operator': { name: 'The Operator', title: 'Systems', pillar: 'business', description: 'Builds SOPs, automates workflows, and keeps operations running smoothly.', icon: '⚙️' },
  'the-support-rep': { name: 'The Support Rep', title: 'Service', pillar: 'business', description: 'Responds to customer inquiries instantly with empathy and accuracy.', icon: '🛟' },
  'the-code-agent': { name: 'The Code Agent', title: 'Dev', pillar: 'business', description: 'Ships features, fixes bugs, and reviews code across your projects.', icon: '💻' },
  'the-wellness-coach': { name: 'The Wellness Coach', title: 'Health', pillar: 'health', description: 'Tracks habits, suggests routines, and keeps your physical health on track.', icon: '🏃' },
  'the-wealth-strategist': { name: 'The Wealth Strategist', title: 'Finance', pillar: 'wealth', description: 'Monitors spending, plans investments, and builds your financial future.', icon: '📈' },
  'the-connector': { name: 'The Connector', title: 'Relationships', pillar: 'relationships', description: 'Remembers birthdays, suggests check-ins, and strengthens your network.', icon: '🤝' },
  'the-reflector': { name: 'The Reflector', title: 'Spirituality', pillar: 'spirituality', description: 'Guides journaling, meditation prompts, and personal growth reflection.', icon: '🔮' },
}

export async function POST(req: NextRequest): Promise<Response> {
  const auth = requireAuth(req)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    const body = (await req.json()) as OnboardPayload

    if (!body.employees || !Array.isArray(body.employees) || body.employees.length === 0) {
      return Response.json(
        { success: false, error: 'At least one employee is required' },
        { status: 400 }
      )
    }

    if (!body.archetype || !['coach', 'operator'].includes(body.archetype)) {
      return Response.json(
        { success: false, error: 'archetype must be "coach" or "operator"' },
        { status: 400 }
      )
    }

    initializeDb()

    // Activate each selected employee
    for (const slug of body.employees) {
      const catalog = EMPLOYEE_CATALOG[slug]
      if (!catalog) continue

      employees.upsert({
        slug,
        name: catalog.name,
        title: catalog.title,
        pillar: catalog.pillar,
        description: catalog.description,
        icon: catalog.icon,
        active: true,
        archetype: body.archetype,
        onboardingAnswers: body.answers[slug] ?? {},
      })

      // Save onboarding answers as memories for context
      const employeeAnswers = body.answers[slug]
      if (employeeAnswers && Object.keys(employeeAnswers).length > 0) {
        const answersText = Object.entries(employeeAnswers)
          .map(([key, value]) => `${key}: ${value}`)
          .join('; ')

        memories.create({
          type: 'preference',
          content: `Onboarding answers for ${catalog.name} (${catalog.title}): ${answersText}`,
          tags: ['onboarding', slug, catalog.pillar],
          source: 'onboarding',
          confidence: 0.9,
        })
      }
    }

    // Save archetype preference as a memory
    memories.create({
      type: 'preference',
      content: `User selected the "${body.archetype}" archetype for their AI team communication style.`,
      tags: ['onboarding', 'archetype', body.archetype],
      source: 'onboarding',
      confidence: 1.0,
    })

    logger.info('Onboarding', `Activated ${body.employees.length} employees with ${body.archetype} archetype`)

    return Response.json({ success: true }, { status: 201 })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to onboard employees'
    logger.error('Onboarding', `POST error: ${errorMessage}`)
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
