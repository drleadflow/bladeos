import { initializeDb, conversations } from '@blade/db'

export const runtime = 'nodejs'

export async function GET(): Promise<Response> {
  try {
    initializeDb()
    const list = conversations.list(50)

    return Response.json({
      success: true,
      data: list,
    })
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to load conversations'
    return Response.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
