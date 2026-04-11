import { requireAuth, unauthorizedResponse } from '@/lib/auth'
import { createPresignedUpload } from '@/lib/r2'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    const body = (await request.json()) as {
      fileName?: string
      fileType?: string
      fileSize?: number
    }

    if (!body.fileName || !body.fileType || !body.fileSize) {
      return Response.json(
        { success: false, error: 'fileName, fileType, and fileSize are required' },
        { status: 400 }
      )
    }

    const result = await createPresignedUpload(
      body.fileName,
      body.fileType,
      body.fileSize,
      auth.userId
    )

    return Response.json({ success: true, data: result })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Upload failed'
    const status = message.includes('too large') || message.includes('not allowed') ? 400 : 500
    return Response.json({ success: false, error: message }, { status })
  }
}
