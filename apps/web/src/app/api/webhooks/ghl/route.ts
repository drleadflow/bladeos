import { initializeDb, leadEvents, leadEngagement } from '@blade/db'
import { logger } from '@blade/shared'

/**
 * GHL Webhook Endpoint — receives real-time events from GoHighLevel.
 * No auth required (webhooks can't carry bearer tokens).
 * Ingests events into lead_events and updates lead_engagement.
 */

export async function POST(request: Request): Promise<Response> {
  try {
    initializeDb()

    const body = await request.json() as Record<string, unknown>

    // GHL sends different payload shapes depending on event type
    const eventType = detectEventType(body)
    if (!eventType) {
      return Response.json({ received: true, skipped: 'unknown event type' })
    }

    const contactId = extractContactId(body)
    const locationId = extractLocationId(body)

    if (!contactId || !locationId) {
      return Response.json({ received: true, skipped: 'missing contactId or locationId' })
    }

    const direction = extractDirection(body, eventType)
    const messageBody = extractMessageBody(body)
    const source = extractSource(body)
    const channel = extractChannel(body)
    const contactName = extractContactName(body)

    // 1. Store raw event
    leadEvents.ingest({
      accountId: locationId,
      contactId,
      eventType,
      channel: channel ?? undefined,
      direction: direction ?? undefined,
      handler: source === 'workflow' ? 'workflow' : (source === 'app' ? 'human' : (source ?? undefined)),
      messageBody: messageBody ?? undefined,
      source: source ?? undefined,
      metadata: body,
    })

    // 2. Update computed engagement state
    if (direction) {
      leadEngagement.upsertFromEvent({
        accountId: locationId,
        contactId,
        contactName: contactName ?? undefined,
        direction,
        messageBody: messageBody ?? undefined,
        source: source ?? undefined,
      })
    }

    return Response.json({ received: true, eventType, contactId, locationId })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Webhook processing failed'
    logger.error('GHL-Webhook', msg)
    // Always return 200 to prevent GHL from retrying
    return Response.json({ received: true, error: msg })
  }
}

// Also handle GET for webhook verification
export async function GET(): Promise<Response> {
  return Response.json({ status: 'ok', service: 'blade-ghl-webhook' })
}

// ── Event Detection ─────────────────────────────────────────

function detectEventType(body: Record<string, unknown>): string | null {
  // GHL webhook event types
  if (body.type === 'InboundMessage' || body.type === 'inbound_message') return 'inbound_message'
  if (body.type === 'OutboundMessage' || body.type === 'outbound_message') return 'outbound_message'
  if (body.type === 'ContactCreate' || body.type === 'contact_create') return 'contact_created'
  if (body.type === 'ContactUpdate') return 'contact_updated'
  if (body.type === 'AppointmentScheduled' || body.type === 'appointment_scheduled') return 'appointment_booked'
  if (body.type === 'AppointmentUpdate') return 'appointment_updated'
  if (body.type === 'TaskCreate') return 'task_created'
  if (body.type === 'NoteCreate') return 'note_created'
  if (body.type === 'OpportunityCreate') return 'opportunity_created'
  if (body.type === 'OpportunityStatusUpdate') return 'pipeline_stage_changed'
  if (body.type === 'WorkflowAdded') return 'workflow_added'

  // Some GHL payloads use different structure
  if (body.direction === 'inbound') return 'inbound_message'
  if (body.direction === 'outbound') return 'outbound_message'
  if (body.message) return body.direction === 'inbound' ? 'inbound_message' : 'outbound_message'

  return null
}

function extractContactId(body: Record<string, unknown>): string | null {
  return (body.contactId ?? body.contact_id ?? (body.contact as Record<string, unknown>)?.id ?? null) as string | null
}

function extractLocationId(body: Record<string, unknown>): string | null {
  return (body.locationId ?? body.location_id ?? body.companyId ?? null) as string | null
}

function extractDirection(body: Record<string, unknown>, eventType: string): string | null {
  if (eventType === 'inbound_message') return 'inbound'
  if (eventType === 'outbound_message') return 'outbound'
  return (body.direction as string) ?? null
}

function extractMessageBody(body: Record<string, unknown>): string | null {
  return (body.body ?? body.message ?? body.text ?? null) as string | null
}

function extractSource(body: Record<string, unknown>): string | null {
  return (body.source ?? body.messageSource ?? null) as string | null
}

function extractChannel(body: Record<string, unknown>): string | null {
  return (body.channel ?? body.messageType ?? body.type ?? null) as string | null
}

function extractContactName(body: Record<string, unknown>): string | null {
  const contact = body.contact as Record<string, unknown> | undefined
  if (contact) {
    const first = contact.firstName ?? contact.first_name ?? ''
    const last = contact.lastName ?? contact.last_name ?? ''
    const name = `${first} ${last}`.trim()
    return name || null
  }
  return (body.contactName ?? body.contact_name ?? null) as string | null
}
