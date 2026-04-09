/**
 * EventChannel — Bridges callback-based producers to AsyncGenerator consumers.
 *
 * Used by streamLoop to convert runAgentLoop's callback events into
 * an async iterable that ConversationEngine and channel adapters consume.
 *
 * Implementation: unbounded queue with pull-based consumption.
 * Events pushed before the consumer pulls are buffered in a FIFO queue.
 * When the consumer pulls and the queue is empty, it waits for the next push.
 */

interface Deferred<T> {
  resolve: (value: T) => void
  reject: (reason: unknown) => void
  promise: Promise<T>
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { resolve, reject, promise }
}

export interface EventChannel<T> extends AsyncIterable<T> {
  /** Push an event into the channel. */
  push(event: T): void
  /** Signal that no more events will be pushed. */
  close(): void
  /** Whether the channel has been closed. */
  readonly closed: boolean
}

export function createEventChannel<T>(): EventChannel<T> {
  const buffer: T[] = []
  let waiter: Deferred<T | typeof DONE> | null = null
  let isClosed = false

  const DONE = Symbol('DONE')

  const channel: EventChannel<T> = {
    push(event: T): void {
      if (isClosed) return
      if (waiter) {
        // Consumer is waiting — resolve immediately
        const w = waiter
        waiter = null
        w.resolve(event)
      } else {
        // No consumer waiting — buffer the event
        buffer.push(event)
      }
    },

    close(): void {
      if (isClosed) return
      isClosed = true
      if (waiter) {
        const w = waiter
        waiter = null
        w.resolve(DONE)
      }
    },

    get closed(): boolean {
      return isClosed
    },

    [Symbol.asyncIterator](): AsyncIterator<T> {
      return {
        async next(): Promise<IteratorResult<T>> {
          // Drain buffer first
          if (buffer.length > 0) {
            return { done: false, value: buffer.shift()! }
          }

          // Buffer empty and channel closed
          if (isClosed) {
            return { done: true, value: undefined }
          }

          // Wait for next push or close
          const deferred = createDeferred<T | typeof DONE>()
          waiter = deferred
          const result = await deferred.promise

          if (result === DONE) {
            return { done: true, value: undefined }
          }

          return { done: false, value: result as T }
        },
      }
    },
  }

  return channel
}
