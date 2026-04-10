import { NextResponse } from 'next/server'
import { listSubAccounts } from '@/lib/ghl-mcp-client'

export async function GET() {
  try {
    const accounts = await listSubAccounts()
    const formatted = accounts.map((a) => ({
      id: a.id,
      name: a.name,
      isDefault: a.is_default === 'YES',
    }))
    return NextResponse.json({ success: true, data: formatted })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch accounts'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
