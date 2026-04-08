import { NextRequest } from 'next/server'
import { initializeDb, notifications } from '@blade/db'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'

export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    initializeDb()
    const list = notifications.list()

    return Response.json({
      success: true,
      data: list.map((n) => ({
        ...n,
        read: Boolean(n.read),
      })),
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to list notifications'
    logger.error('Notifications', `GET error: ${errorMessage}`)
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const postAuth = requireAuth(req)
  if (!postAuth.authorized) return unauthorizedResponse(postAuth.error ?? 'Unauthorized')

  try {
    const body = (await req.json()) as { id?: string; markAllRead?: boolean }

    initializeDb()

    if (body.markAllRead) {
      notifications.markAllRead()
      return Response.json({ success: true })
    }

    if (!body.id) {
      return Response.json(
        { success: false, error: 'id is required' },
        { status: 400 }
      )
    }

    notifications.markRead(body.id)
    return Response.json({ success: true })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to update notification'
    logger.error('Notifications', `POST error: ${errorMessage}`)
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
