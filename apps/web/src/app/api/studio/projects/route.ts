import { initializeDb, contentProjects } from '@blade/db'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'

export async function GET(request: Request): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    initializeDb()
    const projects = contentProjects.list(50)
    return Response.json({ success: true, data: projects })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to load projects'
    logger.error('Studio', `GET /projects error: ${errorMessage}`)
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
