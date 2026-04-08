import { registerTool } from '../tool-registry.js'
import type { ToolCallResult, ExecutionContext } from '../types.js'

// ============================================================
// GHL MCP SERVER CLIENT
// ============================================================

const GHL_MCP_URL = 'https://dlf-agency.skool-203.workers.dev/mcp'

let _mcpSessionId: string | null = null

async function initMcpSession(): Promise<string> {
  if (_mcpSessionId) return _mcpSessionId

  const userKey = process.env.GHL_MCP_USER_KEY
  if (!userKey) throw new Error('GHL_MCP_USER_KEY not configured. Add it to your .env file.')

  const response = await fetch(GHL_MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'X-User-Key': userKey,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'init',
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'blade-super-agent', version: '1.0' },
      },
    }),
  })

  const sessionId = response.headers.get('mcp-session-id')
  if (!sessionId) throw new Error('MCP server did not return a session ID')

  // Consume the response body
  await response.text()

  _mcpSessionId = sessionId
  return sessionId
}

async function callGhlMcp(toolName: string, input: Record<string, unknown>): Promise<unknown> {
  const userKey = process.env.GHL_MCP_USER_KEY
  if (!userKey) throw new Error('GHL_MCP_USER_KEY not configured. Add it to your .env file.')

  const sessionId = await initMcpSession()

  const response = await fetch(GHL_MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'X-User-Key': userKey,
      'Mcp-Session-Id': sessionId,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'tools/call',
      params: { name: toolName, arguments: input },
    }),
  })

  if (!response.ok) {
    // Session may have expired — reset and retry once
    _mcpSessionId = null
    const body = await response.text().catch(() => '')
    throw new Error(`GHL MCP server ${response.status}: ${body.slice(0, 300)}`)
  }

  // Parse SSE response
  const text = await response.text()
  for (const line of text.split('\n')) {
    if (line.startsWith('data:')) {
      try {
        const data = JSON.parse(line.slice(5).trim())
        if (data.error) throw new Error(data.error.message ?? JSON.stringify(data.error))
        if (data.result?.content) {
          // Extract text content from MCP response
          for (const block of data.result.content) {
            if (block.type === 'text') {
              try { return JSON.parse(block.text) } catch { return block.text }
            }
          }
        }
        return data.result
      } catch (e) {
        if (e instanceof Error && e.message.includes('MCP')) throw e
      }
    }
  }

  // Try parsing as plain JSON
  try {
    const data = JSON.parse(text)
    if (data.error) throw new Error(data.error.message)
    return data.result
  } catch {
    return text
  }
}

function makeResult(toolName: string, input: Record<string, unknown>, success: boolean, data: unknown, display: string): ToolCallResult {
  return { toolUseId: '', toolName, input, success, data, display, durationMs: 0, timestamp: new Date().toISOString() }
}

// ============================================================
// GHL CONVERSATIONS
// ============================================================

registerTool(
  {
    name: 'ghl_list_conversations',
    description: 'List recent conversations from GoHighLevel. Shows contact name, last message, status, and unread count.',
    input_schema: {
      type: 'object',
      properties: {
        locationId: { type: 'string', description: 'GHL location/sub-account ID (uses default if not provided)' },
        status: { type: 'string', description: 'Filter by status: all, read, unread, starred', enum: ['all', 'read', 'unread', 'starred'] },
        limit: { type: 'string', description: 'Max results (default: 20)' },
      },
      required: [],
    },
    category: 'system',
  },
  async (input, _ctx): Promise<ToolCallResult> => {
    try {
      const locationId = (input.locationId as string) ?? process.env.GHL_LOCATION_ID
      const limit = parseInt((input.limit as string) ?? '20', 10)
      const status = (input.status as string) ?? 'all'

      const mcpInput: Record<string, unknown> = { locationId, limit }
      if (status !== 'all') mcpInput.status = status

      const result = await callGhlMcp('ghl_search_conversations', mcpInput) as { conversations?: unknown[] }
      const convos = result?.conversations ?? (Array.isArray(result) ? result : [])

      const display = convos.length > 0
        ? `Found ${convos.length} conversations:\n${(convos as Array<{ contactName?: string; lastMessageBody?: string; unreadCount?: number; id?: string }>).map((c, i) =>
            `${i + 1}. ${c.contactName ?? 'Unknown'} — "${(c.lastMessageBody ?? '').slice(0, 80)}" (unread: ${c.unreadCount ?? 0})`
          ).join('\n')}`
        : 'No conversations found.'

      return makeResult('ghl_list_conversations', input, true, convos, display)
    } catch (err) {
      return makeResult('ghl_list_conversations', input, false, null, err instanceof Error ? err.message : String(err))
    }
  }
)

// ============================================================
// GHL CONVERSATION MESSAGES
// ============================================================

registerTool(
  {
    name: 'ghl_get_messages',
    description: 'Get messages from a specific GHL conversation. Shows the full message history with timestamps and direction (inbound/outbound).',
    input_schema: {
      type: 'object',
      properties: {
        conversationId: { type: 'string', description: 'The GHL conversation ID' },
        limit: { type: 'string', description: 'Max messages (default: 20)' },
      },
      required: ['conversationId'],
    },
    category: 'system',
  },
  async (input, _ctx): Promise<ToolCallResult> => {
    try {
      const convId = input.conversationId as string
      const limit = parseInt((input.limit as string) ?? '20', 10)

      const result = await callGhlMcp('ghl_get_conversation_messages', { conversationId: convId, limit }) as { messages?: unknown[] }
      const msgs = result?.messages ?? (Array.isArray(result) ? result : [])

      const display = msgs.length > 0
        ? (msgs as Array<{ direction?: string; body?: string; dateAdded?: string; contactName?: string }>).map(m =>
            `[${m.direction === 'inbound' ? '←' : '→'}] ${m.body?.slice(0, 200) ?? '(no body)'}`
          ).join('\n')
        : 'No messages found.'

      return makeResult('ghl_get_messages', input, true, msgs, display)
    } catch (err) {
      return makeResult('ghl_get_messages', input, false, null, err instanceof Error ? err.message : String(err))
    }
  }
)

// ============================================================
// GHL SEARCH CONTACTS
// ============================================================

registerTool(
  {
    name: 'ghl_search_contacts',
    description: 'Search for contacts in GoHighLevel by name, email, or phone.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term (name, email, or phone)' },
        locationId: { type: 'string', description: 'GHL location ID (uses default if not provided)' },
        limit: { type: 'string', description: 'Max results (default: 10)' },
      },
      required: ['query'],
    },
    category: 'system',
  },
  async (input, _ctx): Promise<ToolCallResult> => {
    try {
      const query = input.query as string
      const locationId = (input.locationId as string) ?? process.env.GHL_LOCATION_ID
      const limit = parseInt((input.limit as string) ?? '10', 10)

      const result = await callGhlMcp('ghl_search_contacts', { query, locationId, limit }) as { contacts?: unknown[] }
      const contacts = result?.contacts ?? (Array.isArray(result) ? result : [])

      const display = contacts.length > 0
        ? `Found ${contacts.length} contacts:\n${(contacts as Array<{ firstName?: string; lastName?: string; email?: string; phone?: string; id?: string }>).map((c, i) =>
            `${i + 1}. ${c.firstName ?? ''} ${c.lastName ?? ''} — ${c.email ?? ''} ${c.phone ?? ''}`
          ).join('\n')}`
        : `No contacts found for "${query}".`

      return makeResult('ghl_search_contacts', input, true, contacts, display)
    } catch (err) {
      return makeResult('ghl_search_contacts', input, false, null, err instanceof Error ? err.message : String(err))
    }
  }
)

// ============================================================
// GHL GET PIPELINES
// ============================================================

registerTool(
  {
    name: 'ghl_get_pipelines',
    description: 'List all sales pipelines and their stages from GoHighLevel.',
    input_schema: {
      type: 'object',
      properties: {
        locationId: { type: 'string', description: 'GHL location ID (uses default if not provided)' },
      },
      required: [],
    },
    category: 'system',
  },
  async (input, _ctx): Promise<ToolCallResult> => {
    try {
      const locationId = (input.locationId as string) ?? process.env.GHL_LOCATION_ID

      const result = await callGhlMcp('ghl_list_pipelines', { locationId }) as { pipelines?: unknown[] }
      const pipelines = result?.pipelines ?? (Array.isArray(result) ? result : [])

      const display = pipelines.length > 0
        ? (pipelines as Array<{ name?: string; stages?: Array<{ name?: string }> }>).map(p =>
            `Pipeline: ${p.name}: ${(p.stages ?? []).map(s => s.name).join(' -> ')}`
          ).join('\n')
        : 'No pipelines found.'

      return makeResult('ghl_get_pipelines', input, true, pipelines, display)
    } catch (err) {
      return makeResult('ghl_get_pipelines', input, false, null, err instanceof Error ? err.message : String(err))
    }
  }
)

// ============================================================
// GHL SEND MESSAGE
// ============================================================

registerTool(
  {
    name: 'ghl_send_message',
    description: 'Send a message to a contact via GHL (SMS, email, or chat). ALWAYS confirm with the user before sending.',
    input_schema: {
      type: 'object',
      properties: {
        conversationId: { type: 'string', description: 'The conversation ID' },
        message: { type: 'string', description: 'The message text to send' },
        type: { type: 'string', description: 'Message type', enum: ['SMS', 'Email', 'WhatsApp', 'Live_Chat'] },
      },
      required: ['conversationId', 'message', 'type'],
    },
    category: 'system',
  },
  async (input, _ctx): Promise<ToolCallResult> => {
    try {
      const result = await callGhlMcp('ghl_send_message', {
        type: input.type,
        conversationId: input.conversationId,
        message: input.message,
      })

      return makeResult('ghl_send_message', input, true, result, `Message sent successfully via ${input.type}`)
    } catch (err) {
      return makeResult('ghl_send_message', input, false, null, err instanceof Error ? err.message : String(err))
    }
  }
)

// ============================================================
// GHL AUDIT CONVERSATIONS (the killer feature)
// ============================================================

registerTool(
  {
    name: 'ghl_audit_conversations',
    description: 'Audit recent GHL conversations to find: unanswered leads, slow response times, best-performing messages, and missed opportunities. This is a comprehensive analysis tool.',
    input_schema: {
      type: 'object',
      properties: {
        locationId: { type: 'string', description: 'GHL location ID (uses default if not provided)' },
        limit: { type: 'string', description: 'Number of conversations to audit (default: 50)' },
      },
      required: [],
    },
    category: 'system',
  },
  async (input, _ctx): Promise<ToolCallResult> => {
    try {
      const locationId = (input.locationId as string) ?? process.env.GHL_LOCATION_ID
      const limit = parseInt((input.limit as string) ?? '50', 10)

      // Fetch recent conversations via MCP
      const result = await callGhlMcp('ghl_search_conversations', {
        locationId,
        limit,
        sortBy: 'last_message_date',
        sortOrder: 'desc',
      }) as {
        conversations?: Array<{
          id?: string
          contactName?: string
          lastMessageBody?: string
          lastMessageDate?: string
          lastMessageDirection?: string
          unreadCount?: number
          contactId?: string
        }>
      }

      const convos = result?.conversations ?? (Array.isArray(result) ? result as Array<{
        id?: string
        contactName?: string
        lastMessageBody?: string
        lastMessageDate?: string
        lastMessageDirection?: string
        unreadCount?: number
        contactId?: string
      }> : [])

      let unanswered = 0
      const unansweredLeads: string[] = []
      const staleLeads: string[] = []

      const now = Date.now()

      for (const c of convos) {
        // Unanswered: last message was inbound (from lead) and unread
        if (c.lastMessageDirection === 'inbound' && (c.unreadCount ?? 0) > 0) {
          unanswered++
          unansweredLeads.push(`${c.contactName ?? 'Unknown'}: "${(c.lastMessageBody ?? '').slice(0, 60)}"`)
        }

        // Stale: no message in 48+ hours
        if (c.lastMessageDate) {
          const lastMsg = new Date(c.lastMessageDate).getTime()
          const hoursSince = (now - lastMsg) / (1000 * 60 * 60)
          if (hoursSince > 48) {
            staleLeads.push(`${c.contactName ?? 'Unknown'} (${Math.round(hoursSince)}h ago)`)
          }
        }
      }

      const lines = [
        `GHL Conversation Audit (${convos.length} conversations)`,
        '',
        `Unanswered leads: ${unanswered}`,
      ]

      if (unansweredLeads.length > 0) {
        lines.push(...unansweredLeads.slice(0, 10).map(l => `   - ${l}`))
      }

      lines.push('', `Stale conversations (48h+): ${staleLeads.length}`)
      if (staleLeads.length > 0) {
        lines.push(...staleLeads.slice(0, 10).map(l => `   - ${l}`))
      }

      lines.push(
        '',
        `Summary:`,
        `   Total conversations: ${convos.length}`,
        `   Need immediate response: ${unanswered}`,
        `   Gone cold (48h+): ${staleLeads.length}`,
        `   Active: ${convos.length - unanswered - staleLeads.length}`,
      )

      if (unanswered > 0) {
        lines.push('', `Action: ${unanswered} leads are waiting for a response right now.`)
      }

      return makeResult('ghl_audit_conversations', input, true, {
        total: convos.length,
        unanswered,
        stale: staleLeads.length,
        unansweredLeads: unansweredLeads.slice(0, 10),
        staleLeads: staleLeads.slice(0, 10),
      }, lines.join('\n'))
    } catch (err) {
      return makeResult('ghl_audit_conversations', input, false, null, err instanceof Error ? err.message : String(err))
    }
  }
)
