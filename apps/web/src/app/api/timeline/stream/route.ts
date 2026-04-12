import { initializeDb, activityEvents } from '@blade/db'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'

/**
 * SSE endpoint for real-time activity timeline streaming.
 * Polls activity_events every 2s and emits new entries.
 * Clients connect with EventSource('/api/timeline/stream').
 */
export async function GET(request: Request): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  initializeDb()

  const url = new URL(request.url)
  const eventType = url.searchParams.get('type') ?? undefined
  const actorId = url.searchParams.get('actor') ?? undefined

  const encoder = new TextEncoder()
  let lastTimestamp = new Date().toISOString()
  let closed = false

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial batch of recent events
      try {
        const recent = activityEvents.list({ limit: 20, eventType, actorId })
        if (recent.length > 0) {
          controller.enqueue(encoder.encode(
            `event: init\ndata: ${JSON.stringify({ events: recent })}\n\n`
          ))
          lastTimestamp = recent[0].createdAt ?? lastTimestamp
        }
      } catch { /* DB may not be ready */ }

      const poll = async () => {
        while (!closed) {
          try {
            const newEvents = activityEvents.list({
              limit: 50,
              since: lastTimestamp,
              eventType,
              actorId,
            })

            if (newEvents.length > 0) {
              // Update timestamp to latest event
              lastTimestamp = newEvents[0].createdAt ?? lastTimestamp

              for (const event of newEvents.reverse()) {
                controller.enqueue(encoder.encode(
                  `event: activity\ndata: ${JSON.stringify(event)}\n\n`
                ))
              }
            }

            // Heartbeat every cycle
            controller.enqueue(encoder.encode(
              `event: heartbeat\ndata: ${JSON.stringify({ ts: new Date().toISOString() })}\n\n`
            ))
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            controller.enqueue(encoder.encode(
              `event: error\ndata: ${JSON.stringify({ message })}\n\n`
            ))
          }

          await new Promise(resolve => setTimeout(resolve, 2000))
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
    },
  })
}
