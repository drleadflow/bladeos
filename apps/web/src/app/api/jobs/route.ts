import { NextRequest } from 'next/server'
import { initializeDb, jobs } from '@blade/db'
import { logger } from '@blade/shared'

export async function GET(): Promise<Response> {
  try {
    initializeDb()
    const list = jobs.list()
    return Response.json({ success: true, data: list })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to list jobs'
    logger.error('Jobs', 'GET error', { error: errorMessage })
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = await req.json()
    const { title, description, repoUrl, baseBranch } = body as {
      title: string
      description: string
      repoUrl: string
      baseBranch?: string
    }

    if (!title || !description || !repoUrl) {
      return Response.json(
        { success: false, error: 'title, description, and repoUrl are required' },
        { status: 400 }
      )
    }

    initializeDb()

    const branchName = `blade/${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}-${Date.now()}`

    const result = jobs.create({
      title,
      description,
      repoUrl,
      branch: branchName,
      baseBranch: baseBranch ?? 'main',
    })

    return Response.json({ success: true, data: result }, { status: 201 })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to create job'
    logger.error('Jobs', 'POST error', { error: errorMessage })
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
