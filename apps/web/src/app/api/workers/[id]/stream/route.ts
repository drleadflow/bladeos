import { initializeDb, jobLogs, workerSessions } from '@blade/db'
import { requireAuth, unauthorizedResponse } from '@/lib/auth'

/**
 * SSE endpoint for live worker log streaming.
 * Polls job_logs every 1s and emits new entries as SSE events.
 * Closes when worker reaches a terminal status.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = requireAuth(request)
  if (!auth.authorized) return unauthorizedResponse(auth.error ?? 'Unauthorized')

  const { id: workerId } = await params
  initializeDb()

  const session = workerSessions.get(workerId)
  if (!session) {
    return Response.json({ success: false, error: 'Worker not found' }, { status: 404 })
  }

  const jobId = session.jobId
  if (!jobId) {
    return Response.json({ success: false, error: 'Worker has no associated job' }, { status: 400 })
  }

  const encoder = new TextEncoder()
  let lastSeenId = 0
  let closed = false

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial status
      controller.enqueue(encoder.encode(
        `event: status\ndata: ${JSON.stringify({ workerId, jobId, status: session.status, runtime: session.runtime })}\n\n`
      ))

      // Poll for new log entries
      const poll = async () => {
        while (!closed) {
          try {
            // Fetch new logs since last seen ID
            const logs = jobLogs.listByJob(jobId, 100) as { id?: number; level: string; message: string; createdAt: string; data_json?: string }[]

            for (const log of logs) {
              const logId = log.id ?? 0
              if (logId <= lastSeenId) continue
              lastSeenId = logId

              const eventType = log.level === 'error' ? 'error' : 'log'
              controller.enqueue(encoder.encode(
                `event: ${eventType}\ndata: ${JSON.stringify({
                  id: logId,
                  level: log.level,
                  message: log.message,
                  timestamp: log.createdAt,
                })}\n\n`
              ))
            }

            // Check if worker is in terminal state
            const currentSession = workerSessions.get(workerId)
            const currentStatus = currentSession?.status ?? 'unknown'

            if (['completed', 'failed', 'stopped'].includes(currentStatus)) {
              controller.enqueue(encoder.encode(
                `event: done\ndata: ${JSON.stringify({ status: currentStatus, summary: currentSession?.latestSummary })}\n\n`
              ))
              closed = true
              controller.close()
              return
            }

            // Emit heartbeat with latest status
            controller.enqueue(encoder.encode(
              `event: heartbeat\ndata: ${JSON.stringify({ status: currentStatus, summary: currentSession?.latestSummary })}\n\n`
            ))
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            controller.enqueue(encoder.encode(
              `event: error\ndata: ${JSON.stringify({ message })}\n\n`
            ))
          }

          // Wait 1 second before next poll
          await new Promise(resolve => setTimeout(resolve, 1000))
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
