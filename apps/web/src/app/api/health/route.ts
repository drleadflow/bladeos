import { ensureServerInit } from '@/lib/server-init'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export function GET() {
  try {
    ensureServerInit()
    return Response.json({ ok: true, ts: Date.now() })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ ok: false, error: msg, ts: Date.now() }, { status: 500 })
  }
}
