/**
 * GHL MCP Client — reusable client for calling the GoHighLevel MCP server.
 * Handles SSE response parsing, session management, and auth headers.
 */

const MCP_SERVER_URL = 'https://dlf-agency.skool-203.workers.dev'

interface MCPToolResult {
  text: string
  parsed: unknown
}

interface MCPMessage {
  jsonrpc: string
  id: number
  result?: {
    content?: Array<{ type: string; text: string }>
    protocolVersion?: string
    capabilities?: unknown
    serverInfo?: unknown
  }
  error?: { code: number; message: string }
}

interface GHLMessage {
  id: string
  direction: 'inbound' | 'outbound'
  status: string
  type: number
  locationId: string
  body: string
  contactId: string
  conversationId: string
  dateAdded: string
  dateUpdated: string
  source: string
  from: string
  to: string
  messageType: string
  attachments: string[]
  contentType: string
  userId?: string
  altId?: string
}

interface GHLSubAccount {
  id: string
  name: string
  account_type: string
  is_default: string
  notes: string | null
  created_at: string
  updated_at: string
}

interface GHLContact {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  source: string
  dateAdded: string
  tags: string[]
  attributionSource?: {
    campaign?: string
    formName?: string
    utmSource?: string
    utmMedium?: string
    utmCampaign?: string
    utmContent?: string
    medium?: string
    source?: string
    adSource?: string
  }
  lastAttributionSource?: {
    campaign?: string
    formName?: string
    utmSource?: string
    utmMedium?: string
    utmCampaign?: string
    utmContent?: string
  }
}

interface GHLAppointment {
  id: string
  status: string
  title: string
  startTime: string
  endTime: string
  contactId: string
}

export type { GHLMessage, GHLSubAccount, GHLContact, GHLAppointment }

let cachedSessionId: string | null = null
let requestId = 0

function getUserKey(): string {
  const key = process.env.GHL_MCP_USER_KEY
  if (!key) {
    throw new Error('GHL_MCP_USER_KEY not configured')
  }
  return key
}

function nextId(): number {
  requestId += 1
  return requestId
}

function parseSSEResponse(raw: string): MCPMessage | null {
  const lines = raw.split('\n')
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        return JSON.parse(line.slice(6)) as MCPMessage
      } catch {
        continue
      }
    }
    if (line.startsWith('{')) {
      try {
        return JSON.parse(line) as MCPMessage
      } catch {
        continue
      }
    }
  }
  return null
}

async function initSession(): Promise<string> {
  if (cachedSessionId) return cachedSessionId

  const res = await fetch(`${MCP_SERVER_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'X-User-Key': getUserKey(),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: nextId(),
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'blade-super-agent', version: '1.0' },
      },
    }),
  })

  const sessionId = res.headers.get('mcp-session-id')
  if (!sessionId) {
    throw new Error('MCP server did not return session ID')
  }

  cachedSessionId = sessionId
  return sessionId
}

async function callTool(name: string, args: Record<string, string> = {}): Promise<MCPToolResult> {
  const sessionId = await initSession()

  const res = await fetch(`${MCP_SERVER_URL}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'X-User-Key': getUserKey(),
      'Mcp-Session-Id': sessionId,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: nextId(),
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  })

  const raw = await res.text()
  const msg = parseSSEResponse(raw)

  if (!msg) {
    throw new Error(`Failed to parse MCP response for ${name}`)
  }

  if (msg.error) {
    // Session may have expired — clear and retry once
    if (msg.error.message.includes('Session') || msg.error.message.includes('session')) {
      cachedSessionId = null
      return callTool(name, args)
    }
    throw new Error(`MCP tool ${name} failed: ${msg.error.message}`)
  }

  const text = msg.result?.content?.[0]?.text ?? ''
  let parsed: unknown = text
  try {
    parsed = JSON.parse(text)
  } catch {
    // Some tools return pre-formatted text with a header line like "5 conversation(s):"
    // Try to extract JSON from after the first line
    const jsonStart = text.indexOf('[')
    const jsonObjStart = text.indexOf('{')
    const start = jsonStart >= 0 && (jsonObjStart < 0 || jsonStart < jsonObjStart)
      ? jsonStart
      : jsonObjStart
    if (start >= 0) {
      try {
        parsed = JSON.parse(text.slice(start))
      } catch {
        parsed = text
      }
    }
  }

  return { text, parsed }
}

// ── Convenience methods ──────────────────────────────────────

export async function listSubAccounts(): Promise<GHLSubAccount[]> {
  const result = await callTool('ghl_list_sub_accounts')
  return (result.parsed as GHLSubAccount[]) ?? []
}

export async function exportMessages(
  locationId?: string,
  lastMessageId?: string,
  limit = '50'
): Promise<{ messages: GHLMessage[]; nextCursor?: string }> {
  const args: Record<string, string> = { limit }
  if (locationId) args.locationId = locationId
  if (lastMessageId) args.lastMessageId = lastMessageId

  const result = await callTool('ghl_export_messages', args)
  const data = result.parsed as Record<string, unknown> | undefined

  // The MCP server returns { messages: [...] } or the text may parse differently
  const messages = Array.isArray(data?.messages)
    ? (data.messages as GHLMessage[])
    : Array.isArray(data)
      ? (data as unknown as GHLMessage[])
      : []

  return {
    messages,
    nextCursor: (data?.lastMessageId as string) ?? undefined,
  }
}

export async function getAllMessages(
  locationId: string,
  startDate?: string,
  maxPages = 20
): Promise<GHLMessage[]> {
  const all: GHLMessage[] = []
  let cursor: string | undefined
  let pages = 0

  while (pages < maxPages) {
    const batch = await exportMessages(locationId, cursor, '50')
    if (!batch.messages || batch.messages.length === 0) break

    // Filter by date if provided
    if (startDate) {
      const startTs = new Date(startDate).getTime()
      const filtered = batch.messages.filter(
        (m) => new Date(m.dateAdded).getTime() >= startTs
      )
      all.push(...filtered)

      // If we've gone past the start date, stop
      const oldest = batch.messages[batch.messages.length - 1]
      if (oldest && new Date(oldest.dateAdded).getTime() < startTs) break
    } else {
      all.push(...batch.messages)
    }

    cursor = batch.nextCursor
    if (!cursor) break
    pages += 1
  }

  return all
}

export async function getContact(contactId: string): Promise<GHLContact | null> {
  try {
    const result = await callTool('ghl_get_contact', { contactId })
    const data = result.parsed as { contact?: GHLContact }
    return data?.contact ?? null
  } catch {
    return null
  }
}

export async function getContactAppointments(contactId: string): Promise<GHLAppointment[]> {
  try {
    const result = await callTool('ghl_get_contact_appointments', { contactId })
    const data = result.parsed as Record<string, unknown> | unknown[]
    if (Array.isArray(data)) return data as GHLAppointment[]
    if (data && typeof data === 'object') {
      const events = (data as Record<string, unknown>).events ??
        (data as Record<string, unknown>).appointments ??
        (data as Record<string, unknown>).data
      if (Array.isArray(events)) return events as GHLAppointment[]
    }
    return []
  } catch {
    return []
  }
}

export async function searchConversations(
  locationId?: string,
  contactId?: string,
  limit = '20'
): Promise<Array<{ id: string; contactId: string; contactName: string; lastMessageDate: number }>> {
  const args: Record<string, string> = { limit }
  if (locationId) args.locationId = locationId
  if (contactId) args.contactId = contactId

  const result = await callTool('ghl_search_conversations', args)
  return (result.parsed as Array<{ id: string; contactId: string; contactName: string; lastMessageDate: number }>) ?? []
}

export async function getConversationMessages(
  conversationId: string,
  limit = '50'
): Promise<GHLMessage[]> {
  const result = await callTool('ghl_get_conversation_messages', {
    conversationId,
    limit,
  })
  return (result.parsed as GHLMessage[]) ?? []
}

export { callTool }
