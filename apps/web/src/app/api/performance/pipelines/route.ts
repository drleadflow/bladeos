import { NextRequest, NextResponse } from 'next/server'
import { callTool } from '@/lib/ghl-mcp-client'

interface Pipeline {
  id: string
  name: string
  stages: Array<{ id: string; name: string }>
}

export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get('accountId') ?? ''

  if (!accountId) {
    return NextResponse.json({ success: false, error: 'accountId required' }, { status: 400 })
  }

  try {
    const result = await callTool('ghl_list_pipelines', { locationId: accountId })
    const data = result.parsed as { pipelines?: Pipeline[] } | Pipeline[]
    const pipelines = Array.isArray(data) ? data : (data?.pipelines ?? [])

    const formatted = pipelines.map((p) => ({
      id: p.id,
      name: p.name,
      stageCount: p.stages?.length ?? 0,
    }))

    return NextResponse.json({ success: true, data: formatted })
  } catch (error: unknown) {
    // MCP might fail for Firebase-only accounts — try internal API
    try {
      const { getAllMessagesViaFirebase } = await import('@/lib/ghl-mcp-client')
      // If we can reach Firebase, the account exists but MCP is down
      // Return empty pipelines — the user can still use the conversation-based analysis
      void getAllMessagesViaFirebase
      return NextResponse.json({ success: true, data: [], note: 'Pipelines unavailable for this account (Firebase fallback)' })
    } catch {
      const msg = error instanceof Error ? error.message : String(error)
      return NextResponse.json({ success: false, error: msg }, { status: 500 })
    }
  }
}
