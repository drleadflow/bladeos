import { NextRequest } from 'next/server'
import { z } from 'zod'
import { initializeDb } from '@blade/db'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'
import { executeInstall } from '@blade/core'
import type { OnboardingSession } from '@blade/core'
import { join } from 'node:path'

export const runtime = 'nodejs'

const OnboardPayloadSchema = z.object({
  vertical: z.string().regex(/^[a-z0-9-]*$/).optional(),
  answers: z.object({
    business: z.string().max(2000).optional(),
    challenge: z.string().max(2000).optional(),
    numbers: z.string().max(2000).optional(),
  }).optional().default({}),
})

type OnboardPayload = z.infer<typeof OnboardPayloadSchema>

function getPacksDir(): string {
  return join(process.cwd(), 'skill-packs')
}

export async function POST(req: NextRequest): Promise<Response> {
  const auth = requireAuth(req)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    const raw = await req.json()
    const parseResult = OnboardPayloadSchema.safeParse(raw)
    if (!parseResult.success) {
      return Response.json({ success: false, error: 'Invalid request body' }, { status: 400 })
    }
    const body: OnboardPayload = parseResult.data

    initializeDb()

    // Build an onboarding session from the request body
    const session: OnboardingSession = {
      id: crypto.randomUUID(),
      channel: 'web',
      channelId: 'web-api',
      state: 'installing',
      vertical: body.vertical,
      answers: body.answers ?? {},
    }

    const result = executeInstall(session, getPacksDir())

    logger.info('Onboarding', `Activated ${result.employeesActivated} employees, seeded ${result.memoriesSeeded} memories, installed ${result.skillsInstalled} skills`)

    return Response.json({
      success: true,
      employeesActivated: result.employeesActivated,
      memoriesSeeded: result.memoriesSeeded,
      skillsInstalled: result.skillsInstalled,
    }, { status: 201 })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to onboard employees'
    logger.error('Onboarding', `POST error: ${errorMessage}`)
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
