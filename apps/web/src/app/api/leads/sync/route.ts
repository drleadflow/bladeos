import { initializeDb, leadEvents } from '@blade/db'
import { logger } from '@blade/shared'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'
import { getAllMessages, listSubAccounts } from '@/lib/ghl-mcp-client'

/**
 * Lead Sync — Backfill historical messages from GHL MCP into Blade's lead tracking.
 * Call this once per account to load existing data, then webhooks handle the rest.
 *
 * GET /api/leads/sync?accountId=xxx — sync one account
 * GET /api/leads/sync?all=true — sync all sub-accounts
 */

export async function GET(request: Request): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  try {
    initializeDb()
    const url = new URL(request.url)
    const accountId = url.searchParams.get('accountId')
    const syncAll = url.searchParams.get('all') === 'true'
    const days = parseInt(url.searchParams.get('days') ?? '30', 10)
    const startDate = new Date(Date.now() - days * 86_400_000).toISOString()

    if (!accountId && !syncAll) {
      return Response.json({ success: false, error: 'Provide accountId or all=true' }, { status: 400 })
    }

    let accountsToSync: { id: string; name: string }[] = []

    if (syncAll) {
      const accounts = await listSubAccounts()
      accountsToSync = accounts.map(a => ({ id: a.id, name: a.name }))
    } else {
      accountsToSync = [{ id: accountId!, name: accountId! }]
    }

    const results: { accountId: string; name: string; messagesLoaded: number; leadsTracked: number }[] = []

    for (const account of accountsToSync) {
      try {
        logger.info('LeadSync', `Syncing ${account.name} (${account.id})...`)

        const messages = await getAllMessages(account.id, startDate, 20)

        // Group by conversation
        const convos = new Map<string, typeof messages>()
        for (const msg of messages) {
          const cid = msg.conversationId
          if (!cid) continue
          if (!convos.has(cid)) convos.set(cid, [])
          convos.get(cid)!.push(msg)
        }

        // Sort each conversation by time
        Array.from(convos.values()).forEach(msgs => {
          msgs.sort((a, b) => new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime())
        })

        let leadsTracked = 0

        // Process each conversation
        for (const msgs of Array.from(convos.values())) {
          for (const msg of msgs) {
            // Ingest raw event
            leadEvents.ingest({
              accountId: account.id,
              accountName: account.name,
              contactId: msg.contactId,
              eventType: msg.direction === 'inbound' ? 'inbound_message' : 'outbound_message',
              channel: msg.messageType ?? undefined,
              direction: msg.direction,
              handler: msg.source === 'workflow' ? 'workflow' : (msg.source ?? undefined),
              messageBody: msg.body ?? undefined,
              source: msg.source ?? undefined,
            })
          }

          // Build engagement from conversation
          const firstOutbound = msgs.find(m => m.direction === 'outbound' && m.body)
          if (!firstOutbound) continue

          const firstOutTime = new Date(firstOutbound.dateAdded).getTime()

          // Find second outbound
          const secondOutbound = msgs.find(m =>
            m.direction === 'outbound' && m.body &&
            new Date(m.dateAdded).getTime() > firstOutTime + 1000
          )
          const secondOutTime = secondOutbound ? new Date(secondOutbound.dateAdded).getTime() : Infinity

          const firstInbound = msgs.find(m =>
            m.direction === 'inbound' &&
            new Date(m.dateAdded).getTime() > firstOutTime
          )

          const repliedToIntro = firstInbound
            ? new Date(firstInbound.dateAdded).getTime() < secondOutTime
            : false

          const repliedAtAll = !!firstInbound

          // Upsert engagement (use raw SQL for backfill to avoid duplicate logic issues)
          try {
            const { getDb } = await import('@blade/db')
            const db = getDb()
            db.prepare(
              `INSERT OR REPLACE INTO lead_engagement (
                account_id, contact_id, first_outbound_at, first_outbound_body,
                first_outbound_source, first_inbound_at, replied_to_intro,
                replied_to_followup, is_responded, total_inbound, total_outbound,
                engagement_status, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(
              account.id,
              firstOutbound.contactId,
              firstOutbound.dateAdded,
              firstOutbound.body ?? null,
              firstOutbound.source ?? null,
              firstInbound?.dateAdded ?? null,
              repliedToIntro ? 1 : 0,
              (!repliedToIntro && repliedAtAll) ? 1 : 0,
              repliedAtAll ? 1 : 0,
              msgs.filter(m => m.direction === 'inbound').length,
              msgs.filter(m => m.direction === 'outbound').length,
              repliedAtAll ? 'engaged' : 'new',
              new Date().toISOString(),
            )
            leadsTracked++
          } catch { /* duplicate — skip */ }
        }

        results.push({
          accountId: account.id,
          name: account.name,
          messagesLoaded: messages.length,
          leadsTracked,
        })

        logger.info('LeadSync', `${account.name}: ${messages.length} messages, ${leadsTracked} leads`)
      } catch (err) {
        logger.error('LeadSync', `Failed to sync ${account.name}: ${err instanceof Error ? err.message : String(err)}`)
        results.push({ accountId: account.id, name: account.name, messagesLoaded: 0, leadsTracked: 0 })
      }
    }

    const totalMessages = results.reduce((s, r) => s + r.messagesLoaded, 0)
    const totalLeads = results.reduce((s, r) => s + r.leadsTracked, 0)

    return Response.json({
      success: true,
      summary: `Synced ${results.length} account(s): ${totalMessages} messages, ${totalLeads} leads tracked`,
      results,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Sync failed'
    logger.error('LeadSync', msg)
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}
