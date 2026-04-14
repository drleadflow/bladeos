import { NextRequest, NextResponse } from 'next/server'
import Database from 'better-sqlite3'
import path from 'path'
import { callTool } from '@/lib/ghl-mcp-client'

function getFirebaseApiKey(): string {
  const key = process.env.GHL_FIREBASE_API_KEY
  if (!key) throw new Error('GHL_FIREBASE_API_KEY not configured')
  return key
}

async function getFirebaseToken(): Promise<string | null> {
  const refreshToken = process.env.GHL_FIREBASE_REFRESH_TOKEN
  if (!refreshToken) return null
  try {
    const res = await fetch(
      `https://securetoken.googleapis.com/v1/token?key=${getFirebaseApiKey()}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=refresh_token&refresh_token=${refreshToken}`,
      }
    )
    if (!res.ok) return null
    const data = (await res.json()) as { id_token?: string }
    return data.id_token ?? null
  } catch {
    return null
  }
}

async function internalFetch(url: string, token: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      'token-id': token,
      'channel': 'APP',
      'source': 'WEB_USER',
      'version': '2021-07-28',
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  })
  if (!res.ok) return null
  return res.json()
}

interface OpportunityData {
  id: string
  contactId: string
  pipelineStageId: string
  name: string
  status: string
}

interface PipelineAnalysis {
  pipelineId: string
  pipelineName: string
  totalOpportunities: number
  stageBreakdown: Array<{ stage: string; count: number; pct: number }>
  introResponseRate: number
  introResponseCount: number
  followupResponseRate: number
  followupResponseCount: number
  neverRepliedRate: number
  neverRepliedCount: number
  sampled: number
  topIntros: Array<{
    name: string
    intro: string
    gotResponse: boolean
    reply: string
  }>
}

export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get('accountId') ?? ''
  const pipelineId = request.nextUrl.searchParams.get('pipelineId') ?? ''

  if (!accountId || !pipelineId) {
    return NextResponse.json(
      { success: false, error: 'accountId and pipelineId required' },
      { status: 400 }
    )
  }

  // Check SQLite cache
  const cacheId = `pipeline-${accountId}-${pipelineId}`
  try {
    const dbPath = path.resolve(process.cwd(), '../../blade.db')
    const db = new Database(dbPath, { readonly: true })
    const cached = db.prepare(
      `SELECT data_json FROM performance_cache WHERE id = ? AND expires_at > datetime('now')`
    ).get(cacheId) as { data_json: string } | undefined
    db.close()
    if (cached) {
      return NextResponse.json({ success: true, data: JSON.parse(cached.data_json), cached: true })
    }
  } catch { /* fall through */ }

  try {
    // Get Firebase token for internal API (needed for conversations)
    const fbToken = await getFirebaseToken()

    // 1. Fetch all opportunities from this pipeline
    const allOpps: OpportunityData[] = []
    let startAfter = ''
    let startAfterId = ''

    for (let page = 0; page < 15; page++) {
      let url = `https://services.leadconnectorhq.com/opportunities/search?location_id=${accountId}&pipeline_id=${pipelineId}&limit=100`
      if (startAfter) url += `&startAfter=${startAfter}&startAfterId=${startAfterId}`

      let result: Record<string, unknown> | null = null

      if (fbToken) {
        result = (await internalFetch(url, fbToken)) as Record<string, unknown> | null
      }

      // Fallback to MCP
      if (!result || !result.opportunities) {
        try {
          const mcp = await callTool('ghl_search_opportunities', {
            locationId: accountId,
            pipelineId,
            limit: '100',
          })
          const parsed = mcp.parsed as Record<string, unknown>
          result = parsed
        } catch { break }
      }

      const opps = (result?.opportunities as OpportunityData[]) ?? []
      if (opps.length === 0) break

      allOpps.push(...opps)
      const meta = (result?.meta as Record<string, unknown>) ?? {}
      startAfter = String(meta.startAfter ?? '')
      startAfterId = String(meta.startAfterId ?? '')

      if (!meta.nextPage && opps.length < 100) break
    }

    // 2. Get pipeline stage names
    const stageNames: Record<string, string> = {}
    try {
      const pipResult = await callTool('ghl_get_pipeline', { pipelineId, locationId: accountId })
      const pipData = pipResult.parsed as { stages?: Array<{ id: string; name: string }> }
      if (pipData?.stages) {
        for (const s of pipData.stages) {
          stageNames[s.id] = s.name
        }
      }
    } catch { /* stages will show as IDs */ }

    // If no stage names from MCP, try Firebase
    if (Object.keys(stageNames).length === 0 && fbToken) {
      const pipData = (await internalFetch(
        `https://services.leadconnectorhq.com/opportunities/pipelines?locationId=${accountId}`,
        fbToken
      )) as { pipelines?: Array<{ id: string; name: string; stages?: Array<{ id: string; name: string }> }> } | null

      if (pipData?.pipelines) {
        const pip = pipData.pipelines.find((p) => p.id === pipelineId)
        if (pip?.stages) {
          for (const s of pip.stages) {
            stageNames[s.id] = s.name
          }
        }
      }
    }

    // 3. Stage breakdown
    const stageCounts: Record<string, number> = {}
    for (const opp of allOpps) {
      const name = stageNames[opp.pipelineStageId] ?? opp.pipelineStageId
      stageCounts[name] = (stageCounts[name] ?? 0) + 1
    }

    const stageBreakdown = Object.entries(stageCounts)
      .map(([stage, count]) => ({
        stage,
        count,
        pct: allOpps.length > 0 ? Math.round((count / allOpps.length) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)

    // 4. Sample conversations for intro response rate
    const contactIds = allOpps.map((o) => o.contactId).filter(Boolean)
    const sampleSize = Math.min(50, contactIds.length)

    let repliedToIntro = 0
    let repliedToFollowup = 0
    let neverReplied = 0
    let checked = 0
    const topIntros: PipelineAnalysis['topIntros'] = []

    if (fbToken) {
      for (const cid of contactIds.slice(0, sampleSize)) {
        const convData = (await internalFetch(
          `https://services.leadconnectorhq.com/conversations/search?locationId=${accountId}&contactId=${cid}&limit=1`,
          fbToken
        )) as { conversations?: Array<{ id: string; contactName?: string }> } | null

        if (!convData?.conversations?.length) continue
        const conv = convData.conversations[0]

        const msgData = (await internalFetch(
          `https://services.leadconnectorhq.com/conversations/${conv.id}/messages?limit=30`,
          fbToken
        )) as { messages?: { messages?: Array<Record<string, unknown>> } } | null

        const msgs = msgData?.messages?.messages ?? []
        if (!msgs.length) continue

        msgs.sort((a, b) => String(a.dateAdded ?? '').localeCompare(String(b.dateAdded ?? '')))
        checked++

        const firstOut = msgs.find((m) => m.direction === 'outbound' && m.body)
        if (!firstOut) { neverReplied++; continue }

        const firstOutDate = String(firstOut.dateAdded ?? '')
        const laterOuts = msgs.filter((m) => m.direction === 'outbound' && m.body && String(m.dateAdded ?? '') > firstOutDate)
        const secondOutDate = laterOuts.length > 0 ? String(laterOuts[0].dateAdded ?? '') : '\uffff'

        const repliedBefore = msgs.some(
          (m) => m.direction === 'inbound' && String(m.dateAdded ?? '') > firstOutDate && String(m.dateAdded ?? '') < secondOutDate
        )
        const repliedAtAll = msgs.some(
          (m) => m.direction === 'inbound' && String(m.dateAdded ?? '') > firstOutDate
        )

        const firstReply = msgs.find(
          (m) => m.direction === 'inbound' && String(m.dateAdded ?? '') > firstOutDate && m.body
        )

        const introBody = String(firstOut.body ?? '').slice(0, 300)
        const isSystem = introBody.startsWith('Opportunity') || introBody.startsWith('New Lead Signed')

        if (repliedBefore) {
          repliedToIntro++
          if (!isSystem) {
            topIntros.push({
              name: conv.contactName ?? '?',
              intro: introBody,
              gotResponse: true,
              reply: String(firstReply?.body ?? '').slice(0, 200),
            })
          }
        } else if (repliedAtAll) {
          repliedToFollowup++
        } else {
          neverReplied++
          if (!isSystem && topIntros.filter((t) => !t.gotResponse).length < 5) {
            topIntros.push({
              name: conv.contactName ?? '?',
              intro: introBody,
              gotResponse: false,
              reply: '',
            })
          }
        }
      }
    }

    // Sort: winning first, then dead
    topIntros.sort((a, b) => {
      if (a.gotResponse !== b.gotResponse) return a.gotResponse ? -1 : 1
      return 0
    })

    const pct = (n: number, d: number) => d > 0 ? Math.round((n / d) * 10000) / 100 : 0

    // Get pipeline name
    const pipelineName = stageBreakdown.length > 0
      ? Object.entries(stageNames).length > 0
        ? (await (async () => {
            try {
              const r = await callTool('ghl_get_pipeline', { pipelineId, locationId: accountId })
              return (r.parsed as { name?: string })?.name ?? pipelineId
            } catch { return pipelineId }
          })())
        : pipelineId
      : pipelineId

    const analysis: PipelineAnalysis = {
      pipelineId,
      pipelineName: typeof pipelineName === 'string' ? pipelineName : pipelineId,
      totalOpportunities: allOpps.length,
      stageBreakdown,
      introResponseRate: pct(repliedToIntro, checked),
      introResponseCount: repliedToIntro,
      followupResponseRate: pct(repliedToFollowup, checked),
      followupResponseCount: repliedToFollowup,
      neverRepliedRate: pct(neverReplied, checked),
      neverRepliedCount: neverReplied,
      sampled: checked,
      topIntros: topIntros.slice(0, 15),
    }

    // Cache for 1 hour
    try {
      const dbPath = path.resolve(process.cwd(), '../../blade.db')
      const db = new Database(dbPath)
      db.prepare(
        `INSERT OR REPLACE INTO performance_cache (id, account_id, account_name, data_json, created_at, expires_at)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now', '+1 hour'))`
      ).run(cacheId, accountId, pipelineName, JSON.stringify(analysis))
      db.close()
    } catch { /* cache write failed */ }

    return NextResponse.json({ success: true, data: analysis })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
