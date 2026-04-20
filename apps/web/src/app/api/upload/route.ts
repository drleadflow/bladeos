import { NextRequest } from 'next/server'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import crypto from 'node:crypto'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'

export const runtime = 'nodejs'

const UPLOAD_DIR = join(process.cwd(), 'uploads')
const MAX_SIZE = 10 * 1024 * 1024

export async function POST(req: NextRequest): Promise<Response> {
  const auth = requireAuth(req)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return Response.json({ success: false, error: 'No file provided' }, { status: 400 })
    }

    if (file.size > MAX_SIZE) {
      return Response.json({ success: false, error: 'File too large (max 10MB)' }, { status: 400 })
    }

    const fileId = crypto.randomUUID().slice(0, 12)
    const ext = file.name.split('.').pop() ?? 'bin'
    const filename = `${fileId}.${ext}`

    await mkdir(UPLOAD_DIR, { recursive: true })
    const buffer = Buffer.from(await file.arrayBuffer())
    const filePath = join(UPLOAD_DIR, filename)
    await writeFile(filePath, buffer)

    return Response.json({
      success: true,
      data: { fileId, filename, url: `/uploads/${filename}`, mimeType: file.type, size: file.size },
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Upload failed'
    logger.error('Upload', `error: ${msg}`)
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}
