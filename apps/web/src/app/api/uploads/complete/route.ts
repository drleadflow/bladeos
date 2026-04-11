import { requireAuth, unauthorizedResponse } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    const body = (await request.json()) as {
      key?: string
      fileName?: string
      fileType?: string
      fileSize?: number
    }

    if (!body.key || !body.fileName) {
      return Response.json(
        { success: false, error: 'key and fileName are required' },
        { status: 400 }
      )
    }

    // TODO: Store upload metadata in database for tracking
    // For now, just confirm the upload and return the URL
    const publicUrl = `${process.env.R2_ENDPOINT}/${process.env.R2_BUCKET_NAME}/${body.key}`

    return Response.json({
      success: true,
      data: {
        key: body.key,
        fileName: body.fileName,
        fileType: body.fileType,
        fileSize: body.fileSize,
        url: publicUrl,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to confirm upload'
    return Response.json({ success: false, error: message }, { status: 500 })
  }
}
