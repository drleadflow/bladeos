import { requireAuth, unauthorizedResponse } from '@/lib/auth'
import { deleteFile } from '@/lib/r2'

export const runtime = 'nodejs'

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    // The id is the R2 key (URL-encoded)
    const key = decodeURIComponent(params.id)
    await deleteFile(key)

    return Response.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Delete failed'
    return Response.json({ success: false, error: message }, { status: 500 })
  }
}
