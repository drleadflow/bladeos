import { ensureServerInit } from '@/lib/server-init'

export function GET() {
  ensureServerInit()
  return Response.json({ ok: true, ts: Date.now() })
}
