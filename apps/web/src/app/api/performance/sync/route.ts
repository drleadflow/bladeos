import { NextResponse } from 'next/server'
import Database from 'better-sqlite3'
import path from 'path'

/**
 * POST /api/performance/sync — triggers background data refresh for an account.
 * GET /api/performance/sync — returns sync status for all accounts.
 *
 * The main /api/performance route reads from the cache table.
 * This endpoint populates the cache by calling the full pipeline.
 */

function getDb(): InstanceType<typeof Database> {
  const dbPath = path.resolve(process.cwd(), '../../blade.db')
  return new Database(dbPath)
}

export async function GET() {
  try {
    const db = getDb()
    const rows = db.prepare(
      `SELECT account_id, account_name,
              datetime(created_at) as synced_at,
              datetime(expires_at) as expires_at,
              CASE WHEN expires_at > datetime('now') THEN 'fresh' ELSE 'stale' END as status,
              length(data_json) as data_size
       FROM performance_cache
       ORDER BY created_at DESC`
    ).all() as Array<{ account_id: string; account_name: string; synced_at: string; expires_at: string; status: string; data_size: number }>

    db.close()
    return NextResponse.json({ success: true, data: rows })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const body = await request.json() as { accountId?: string }
  const accountId = body.accountId

  if (!accountId) {
    return NextResponse.json({ success: false, error: 'accountId required' }, { status: 400 })
  }

  try {
    // Call the main performance endpoint to generate fresh data
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const endDate = new Date().toISOString()

    const baseUrl = request.headers.get('host') ?? 'localhost:3000'
    const protocol = baseUrl.includes('localhost') ? 'http' : 'https'

    const res = await fetch(
      `${protocol}://${baseUrl}/api/performance?accountId=${accountId}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
      { headers: { 'Content-Type': 'application/json' } }
    )

    const json = await res.json() as { success: boolean; data?: unknown; error?: string }

    if (!json.success || !json.data) {
      return NextResponse.json({
        success: false,
        error: `Sync failed: ${json.error ?? 'no data'}`,
      })
    }

    // Store in SQLite cache with 1-hour TTL
    const db = getDb()

    // Get account name from the accounts list
    const accountRes = await fetch(
      `${protocol}://${baseUrl}/api/performance/accounts`,
      { headers: { 'Content-Type': 'application/json' } }
    )
    const accountJson = await accountRes.json() as { data?: Array<{ id: string; name: string }> }
    const accountName = accountJson.data?.find((a) => a.id === accountId)?.name ?? accountId

    db.prepare(
      `INSERT OR REPLACE INTO performance_cache (id, account_id, account_name, data_json, created_at, expires_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now', '+1 hour'))`
    ).run(
      `${accountId}-30d`,
      accountId,
      accountName,
      JSON.stringify(json.data)
    )

    db.close()

    return NextResponse.json({
      success: true,
      message: `Synced ${accountName}`,
      cachedUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
