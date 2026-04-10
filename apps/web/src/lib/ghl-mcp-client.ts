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

// ── Direct GHL Internal API (Firebase auth fallback) ─────────
// Used for accounts where MCP OAuth token is expired but we have
// Firebase agency access (e.g., MDW Aesthetics)

const GHL_INTERNAL_API = 'https://services.leadconnectorhq.com'
const FIREBASE_API_KEY = 'AIzaSyB_w3vXmsI7WeQtrIOkjR6xTRVN5uOieiE'

let cachedFirebaseToken: string | null = null
let firebaseTokenExpiry = 0

async function getFirebaseToken(): Promise<string | null> {
  if (cachedFirebaseToken && Date.now() < firebaseTokenExpiry) {
    return cachedFirebaseToken
  }

  const refreshToken = process.env.GHL_FIREBASE_REFRESH_TOKEN
  if (!refreshToken) return null

  try {
    const res = await fetch(
      `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=refresh_token&refresh_token=${refreshToken}`,
      }
    )
    if (!res.ok) return null

    const data = (await res.json()) as { id_token?: string; expires_in?: string }
    if (!data.id_token) return null

    cachedFirebaseToken = data.id_token
    firebaseTokenExpiry = Date.now() + (parseInt(data.expires_in ?? '3600', 10) - 60) * 1000
    return cachedFirebaseToken
  } catch {
    return null
  }
}

async function ghlInternalFetch(path: string): Promise<unknown> {
  const token = await getFirebaseToken()
  if (!token) throw new Error('No Firebase token available')

  const res = await fetch(`${GHL_INTERNAL_API}${path}`, {
    headers: {
      'token-id': token,
      'channel': 'APP',
      'source': 'WEB_USER',
      'version': '2021-07-28',
    },
  })

  if (!res.ok) {
    throw new Error(`GHL internal API ${res.status}: ${res.statusText}`)
  }

  return res.json()
}

/**
 * Get all messages for a Firebase-authed account by iterating conversations.
 * Used as fallback when MCP OAuth token is expired.
 */
export async function getAllMessagesViaFirebase(
  locationId: string,
  startDate?: string,
  maxConversations = 50
): Promise<GHLMessage[]> {
  const token = await getFirebaseToken()
  if (!token) throw new Error('No Firebase token — set GHL_FIREBASE_REFRESH_TOKEN in .env')

  // 1. Get conversations
  const convData = (await ghlInternalFetch(
    `/conversations/search?locationId=${locationId}&limit=${maxConversations}`
  )) as { conversations?: Array<{ id: string; contactId: string; contactName: string; lastMessageDate: number }> }

  const conversations = convData?.conversations ?? []
  if (conversations.length === 0) return []

  // Filter by date if provided
  const startTs = startDate ? new Date(startDate).getTime() : 0
  const filtered = startTs > 0
    ? conversations.filter((c) => c.lastMessageDate >= startTs)
    : conversations

  // 2. Get messages for each conversation (batch of 10)
  const allMessages: GHLMessage[] = []
  const BATCH = 10

  for (let i = 0; i < filtered.length; i += BATCH) {
    const batch = filtered.slice(i, i + BATCH)
    const results = await Promise.all(
      batch.map(async (conv) => {
        try {
          const msgData = (await ghlInternalFetch(
            `/conversations/${conv.id}/messages?limit=50`
          )) as { messages?: { messages?: Array<Record<string, unknown>> } }

          const msgs = msgData?.messages?.messages ?? []
          return msgs.map((m) => ({
            id: String(m.id ?? ''),
            direction: String(m.direction ?? 'outbound') as 'inbound' | 'outbound',
            status: String(m.status ?? ''),
            type: Number(m.type ?? 0),
            locationId,
            body: String(m.body ?? ''),
            contactId: String(m.contactId ?? conv.contactId),
            conversationId: conv.id,
            dateAdded: String(m.dateAdded ?? ''),
            dateUpdated: String(m.dateUpdated ?? ''),
            source: String(m.source ?? ''),
            from: String(m.from ?? ''),
            to: String(m.to ?? ''),
            messageType: String(m.messageType ?? m.type ?? ''),
            attachments: Array.isArray(m.attachments) ? m.attachments as string[] : [],
            contentType: String(m.contentType ?? ''),
          } satisfies GHLMessage))
        } catch {
          return []
        }
      })
    )
    allMessages.push(...results.flat())
  }

  // Filter by start date
  if (startDate) {
    const ts = new Date(startDate).getTime()
    return allMessages.filter((m) => new Date(m.dateAdded).getTime() >= ts)
  }

  return allMessages
}
