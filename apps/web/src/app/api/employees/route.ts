import { initializeDb, employees } from '@blade/db'
import { logger } from '@blade/shared'

export const runtime = 'nodejs'

export async function GET(): Promise<Response> {
  try {
    initializeDb()
    const list = employees.list()

    return Response.json({
      success: true,
      data: list.map((e) => ({
        ...e,
        active: Boolean(e.active),
        onboardingAnswers: JSON.parse(e.onboardingAnswersJson),
      })),
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to list employees'
    logger.error('Employees', `GET error: ${errorMessage}`)
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
