import { NextRequest } from 'next/server'
import { initializeDb, memories } from '@blade/db'
import { logger } from '@blade/shared'

export async function GET(req: NextRequest): Promise<Response> {
  try {
    initializeDb()

    const query = req.nextUrl.searchParams.get('q')
    const data = query ? memories.search(query) : memories.getAll()

    return Response.json({ success: true, data })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to retrieve memories'
    logger.error('Memory', 'GET error', { error: errorMessage })
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = await req.json()
    const { content, type, tags } = body as {
      content: string
      type: string
      tags?: string[]
    }

    if (!content || !type) {
      return Response.json(
        { success: false, error: 'content and type are required' },
        { status: 400 }
      )
    }

    initializeDb()

    const result = memories.create({
      type,
      content,
      tags: tags ?? [],
      source: 'web-api',
    })

    return Response.json({ success: true, data: result }, { status: 201 })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to create memory'
    logger.error('Memory', 'POST error', { error: errorMessage })
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest): Promise<Response> {
  try {
    const body = await req.json()
    const { id } = body as { id: string }

    if (!id) {
      return Response.json(
        { success: false, error: 'id is required' },
        { status: 400 }
      )
    }

    initializeDb()
    memories.delete(id)

    return Response.json({ success: true })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete memory'
    logger.error('Memory', 'DELETE error', { error: errorMessage })
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
