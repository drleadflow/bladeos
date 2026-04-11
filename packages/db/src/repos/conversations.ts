import { db, uuid, now } from './helpers.js'

// ============================================================
// CONVERSATIONS
// ============================================================

export const conversations = {
  create(title?: string): { id: string; title?: string; createdAt: string; updatedAt: string } {
    const id = uuid()
    const ts = now()
    db().prepare('INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, title ?? null, ts, ts)
    return { id, title, createdAt: ts, updatedAt: ts }
  },

  get(id: string) {
    return db().prepare('SELECT id, title, created_at as createdAt, updated_at as updatedAt FROM conversations WHERE id = ?').get(id) as { id: string; title?: string; createdAt: string; updatedAt: string } | undefined
  },

  list(limit = 50) {
    return db().prepare('SELECT id, title, created_at as createdAt, updated_at as updatedAt FROM conversations ORDER BY updated_at DESC LIMIT ?').all(limit) as { id: string; title?: string; createdAt: string; updatedAt: string }[]
  },

  updateTitle(id: string, title: string): void {
    db().prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?').run(title, now(), id)
  },
}

// ============================================================
// MESSAGES
// ============================================================

export const messages = {
  create(params: { conversationId: string; role: string; content: string; model?: string; inputTokens?: number; outputTokens?: number }): { id: string } {
    const id = uuid()
    db().prepare(
      'INSERT INTO messages (id, conversation_id, role, content, model, input_tokens, output_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, params.conversationId, params.role, params.content, params.model ?? null, params.inputTokens ?? 0, params.outputTokens ?? 0, now())
    return { id }
  },

  listByConversation(conversationId: string, limit = 100) {
    return db().prepare(
      'SELECT id, conversation_id as conversationId, role, content, model, input_tokens as inputTokens, output_tokens as outputTokens, created_at as createdAt FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?'
    ).all(conversationId, limit) as { id: string; conversationId: string; role: string; content: string; model?: string; inputTokens: number; outputTokens: number; createdAt: string }[]
  },
}

// ============================================================
// TOOL CALLS
// ============================================================

export const toolCalls = {
  create(params: { messageId: string; conversationId: string; toolName: string; input: unknown; success: boolean; result?: unknown; display?: string; durationMs?: number }): void {
    db().prepare(
      'INSERT INTO tool_calls (id, message_id, conversation_id, tool_name, input_json, success, result_json, display, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(uuid(), params.messageId, params.conversationId, params.toolName, JSON.stringify(params.input), params.success ? 1 : 0, params.result ? JSON.stringify(params.result) : null, params.display ?? null, params.durationMs ?? 0, now())
  },

  listByConversation(conversationId: string) {
    return db().prepare('SELECT * FROM tool_calls WHERE conversation_id = ? ORDER BY created_at ASC').all(conversationId)
  },
}

// ============================================================
// CHANNEL LINKS
// ============================================================

export const channelLinks = {
  upsert(params: {
    conversationId: string
    channel: string
    channelId: string
    metadata?: unknown
  }): void {
    db().prepare(
      `INSERT INTO channel_links (conversation_id, channel, channel_id, metadata_json, linked_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(channel, channel_id) DO UPDATE SET
         conversation_id = excluded.conversation_id,
         metadata_json = excluded.metadata_json,
         linked_at = excluded.linked_at`
    ).run(
      params.conversationId,
      params.channel,
      params.channelId,
      JSON.stringify(params.metadata ?? {}),
      now()
    )
  },

  findConversation(channel: string, channelId: string): string | undefined {
    const row = db().prepare(
      'SELECT conversation_id as conversationId FROM channel_links WHERE channel = ? AND channel_id = ?'
    ).get(channel, channelId) as { conversationId: string } | undefined

    return row?.conversationId
  },

  listByConversation(conversationId: string) {
    return db().prepare(
      `SELECT conversation_id as conversationId, channel, channel_id as channelId,
       metadata_json as metadataJson, linked_at as linkedAt
       FROM channel_links WHERE conversation_id = ? ORDER BY linked_at ASC`
    ).all(conversationId) as {
      conversationId: string
      channel: string
      channelId: string
      metadataJson: string | null
      linkedAt: string
    }[]
  },
}
