import { ensureServerInit } from '@/lib/server-init'
import { initializeDb } from '@blade/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export function GET() {
  try {
    ensureServerInit()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ ok: false, error: `server-init failed: ${msg}`, ts: Date.now() }, { status: 500 })
  }

  try {
    const db = initializeDb()
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]).map(r => r.name)
    return Response.json({ ok: true, ts: Date.now(), tables, dbPath: process.env.BLADE_DATA_DIR ?? 'cwd' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ ok: false, error: `db-check failed: ${msg}`, ts: Date.now() }, { status: 500 })
  }
}
