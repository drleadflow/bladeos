import { initializeDb, activityEvents } from '@blade/db'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'
import { corsHeaders } from '@/lib/cors'

export const runtime = 'nodejs'

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders() })
}

export async function GET(request: Request): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  initializeDb()

  const encoder = new TextEncoder()
  let lastCheck = new Date().toISOString()
  let closed = false

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`))

      const poll = async () => {
        while (!closed) {
          try {
            const events = activityEvents.list({ since: lastCheck, limit: 20 })

            if (events.length > 0) {
              lastCheck = events[0].createdAt
              for (const event of events.reverse()) {
                controller.enqueue(encoder.encode(
                  `data: ${JSON.stringify({ type: 'activity', payload: event })}\n\n`
                ))
              }
            }

            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({ type: 'heartbeat', ts: new Date().toISOString() })}\n\n`
            ))
          } catch { /* ignore polling errors */ }

          await new Promise(resolve => setTimeout(resolve, 3000))
        }
      }

      poll().catch(() => {
        if (!closed) {
          closed = true
          try { controller.close() } catch { /* already closed */ }
        }
      })
    },
    cancel() {
      closed = true
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      ...corsHeaders(),
    },
  })
}
