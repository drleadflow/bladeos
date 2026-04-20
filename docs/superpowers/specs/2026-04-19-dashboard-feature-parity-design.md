# Dashboard Feature Parity — Design Spec

**Date:** 2026-04-19
**Status:** Draft
**Scope:** Part 3 of 4 — Command Center upgrade series
**Depends on:** Part 1 (Mission Execution Engine), Part 2 (Voice Agent Improvements)

## Problem

The Command Center dashboard is a monitoring/analytics UI with voice-only interaction. It has no text input, no file upload, no way to chat with Blade without speaking. Telegram can do things the dashboard cannot: text conversations, image analysis, file operations, full conversational AI. The dashboard should be a complete interface, not a partial one.

## Goal

Add text chat, file upload, and full conversational AI to the dashboard so it can do everything Telegram can — plus the visual analytics Telegram cannot.

## Design

### 1. Command Bar

A persistent natural language input at the bottom of every page.

**Behavior:**
- Always visible as a single-line input bar at the bottom of the viewport
- Keyboard shortcut: `Cmd+K` (Mac) / `Ctrl+K` (Windows) or `/` to focus
- Natural language only — no slash commands to memorize
- Type anything: "how are my ads doing?", "create a mission to research X", "search memory for competitor pricing"
- Sends input to the conversation engine, response appears inline below the bar
- If the response is short (one message, no follow-up needed), it displays inline and auto-dismisses after 10 seconds
- If the conversation goes multi-turn, the command bar expands into the full chat panel

**Component:** `CommandBar.tsx` — renders on every page via the root layout

**API:** `POST /api/chat` — same endpoint the chat panel uses

### 2. Full Chat Panel

A slide-out drawer for full conversations with Blade.

**Behavior:**
- Opens from the right side of the screen as a drawer (400px wide)
- Triggered by: clicking the expand icon on the command bar, multi-turn conversation starting, or a dedicated "Chat" button in the sidebar nav
- Shows full conversation history with scroll
- Messages tagged with channel origin: `[dashboard]`, `[telegram]`, `[voice]`
- Tool usage shown inline as collapsible cards (e.g., "Used: meta_account_performance" with expandable result)
- Supports markdown rendering: code blocks, tables, lists, bold/italic
- Input area at the bottom with send button and file attach button
- Close button returns to command bar mode (conversation persists)

**Component:** `ChatDrawer.tsx` — rendered in root layout, toggled by Zustand state

### 3. File Upload

Two entry points for file upload, each serving a different use case.

**Chat panel uploads (quick analysis):**
- Drag-and-drop or click attach button in the chat input area
- Paste from clipboard (Cmd+V with image)
- Supported: images (png, jpg, webp), PDFs, text files, CSVs
- Images → sent to `analyze_image` tool (AI vision analysis)
- Documents → sent as context with the next message
- Files uploaded to `/api/upload` which stores them temporarily and returns a URL
- Max file size: 10MB

**Memory page uploads (knowledge base ingestion):**
- Dedicated upload zone on the Memory page
- Drag-and-drop multiple files
- Supported: PDFs, text files, CSVs, markdown
- Files ingested into the RAG system via `ingest_document` tool
- Progress indicator for bulk uploads
- Files stored permanently in the knowledge base

**API:**
- `POST /api/upload` — Accepts multipart form data, stores file, returns `{ fileId, url, mimeType }`
- `POST /api/memory/ingest` — Accepts file reference, ingests into RAG system

### 4. Shared Conversation Architecture

Dashboard, Telegram, and voice share the same conversation thread per user.

**How it works:**
- All channels use the existing `ConversationEngine` from `packages/conversation/`
- New channel adapter: `DashboardAdapter` (alongside `TelegramAdapter`)
- Conversation ID is per-user, not per-channel — same thread everywhere
- Each message stored with a `channel` field: `'telegram' | 'dashboard' | 'voice'`
- Dashboard chat shows all messages regardless of origin, tagged with channel badge
- Telegram shows all messages too (but formatted for mobile)
- Voice transcripts are included as `[voice]` messages

**New channel adapter:**

```typescript
// packages/conversation/src/adapters/dashboard.ts
export class DashboardAdapter {
  parseRequest(body: ChatRequest): ConversationRequest {
    return {
      message: body.message,
      userId: body.userId,
      channel: 'dashboard',
      fileAttachments: body.files ?? [],
      conversationId: body.conversationId,  // Shared across channels
    }
  }

  formatResponse(events: ConversationEvent[]): ChatResponse {
    return {
      messages: events.map(e => ({
        role: e.role,
        content: e.content,
        channel: e.channel,
        toolCalls: e.toolCalls,
        timestamp: e.timestamp,
      })),
    }
  }
}
```

**Conversation history endpoint:**
- `GET /api/chat/history?limit=50` — Returns recent messages across all channels
- Each message includes `channel` field for UI tagging

### 5. Dashboard Chat API

**New endpoints:**

- `POST /api/chat` — Send a message to the conversation engine
  ```typescript
  // Request
  { message: string, userId?: string, conversationId?: string, files?: string[] }
  
  // Response (streamed via SSE)
  { type: 'text' | 'tool_start' | 'tool_result' | 'done', content: string, ... }
  ```

- `GET /api/chat/history` — Get conversation history
  ```typescript
  // Query params: limit, before (cursor)
  // Response
  { data: Array<{ id, role, content, channel, toolCalls, timestamp }> }
  ```

- `POST /api/upload` — Upload a file
  ```typescript
  // Request: multipart/form-data with file
  // Response
  { success: true, data: { fileId, url, mimeType, size } }
  ```

**Streaming:** The chat endpoint uses Server-Sent Events (SSE) to stream responses. The dashboard renders tokens as they arrive, same as a ChatGPT-style interface.

### 6. UI Components

**New components to create:**

| Component | Location | Purpose |
|-----------|----------|---------|
| `CommandBar.tsx` | `components/blade/` | Persistent input bar on every page |
| `ChatDrawer.tsx` | `components/blade/` | Slide-out full chat panel |
| `ChatMessage.tsx` | `components/blade/` | Single message with channel badge and tool cards |
| `ToolCallCard.tsx` | `components/blade/` | Collapsible tool usage display |
| `FileUploadZone.tsx` | `components/blade/` | Drag-and-drop upload area (reused in chat + memory) |
| `ChannelBadge.tsx` | `components/blade/` | Small badge showing message origin (telegram/dashboard/voice) |

**Zustand store additions:**

```typescript
// In blade-store.ts
chatOpen: boolean
chatMessages: ChatMessage[]
chatLoading: boolean
toggleChat: () => void
sendChatMessage: (text: string, files?: string[]) => Promise<void>
loadChatHistory: () => Promise<void>
```

### 7. Navigation Update

Add "Chat" to the sidebar navigation:

- New sidebar item between "Command" and "Council"
- Icon: `MessageSquare` from lucide-react
- Click opens the chat drawer (doesn't navigate to a new page)
- Badge showing unread message count from other channels

## Files to Create

**Backend:**
- `apps/web/src/app/api/chat/route.ts` — Chat message endpoint (SSE streaming)
- `apps/web/src/app/api/chat/history/route.ts` — Conversation history
- `apps/web/src/app/api/upload/route.ts` — File upload endpoint
- `packages/conversation/src/adapters/dashboard.ts` — Dashboard channel adapter

**Frontend:**
- `apps/command/src/components/blade/CommandBar.tsx`
- `apps/command/src/components/blade/ChatDrawer.tsx`
- `apps/command/src/components/blade/ChatMessage.tsx`
- `apps/command/src/components/blade/ToolCallCard.tsx`
- `apps/command/src/components/blade/FileUploadZone.tsx`
- `apps/command/src/components/blade/ChannelBadge.tsx`

**Modify:**
- `apps/command/src/stores/blade-store.ts` — Add chat state and actions
- `apps/command/src/components/blade/Layout.tsx` (or root layout) — Mount CommandBar and ChatDrawer
- `apps/command/src/components/blade/MemoryPage.tsx` — Add FileUploadZone for RAG ingestion
- `packages/conversation/src/engine.ts` — Add `channel` field to message storage
- `packages/db/src/repos/conversations.ts` — Store and query `channel` field

## Out of Scope

- Real-time typing indicators across channels
- Read receipts
- Chat search/filter
- Message editing or deletion
- Rich embeds (link previews, image thumbnails inline)
- Multi-user conversations (only Dr. Emeka uses this)

## Success Criteria

1. `Cmd+K` on any page focuses the command bar
2. Typing "how are my ads?" returns a response inline within 5 seconds
3. Multi-turn conversations auto-expand into the chat drawer
4. Messages sent from Telegram appear in dashboard chat tagged `[telegram]`
5. Messages sent from dashboard appear in Telegram
6. Dragging an image into chat triggers AI vision analysis
7. Uploading a PDF on the Memory page ingests it into the knowledge base
8. Chat drawer shows tool usage as collapsible cards
9. Conversation persists across page navigation
