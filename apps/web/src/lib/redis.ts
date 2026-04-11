import IORedis from 'ioredis'

let _redis: IORedis | null = null

export function getRedis(): IORedis {
  if (_redis) return _redis

  const url = process.env.UPSTASH_REDIS_URL ?? process.env.REDIS_URL

  if (!url) {
    throw new Error(
      'Redis not configured. Set UPSTASH_REDIS_URL or REDIS_URL environment variable.'
    )
  }

  _redis = new IORedis(url, {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
    tls: url.startsWith('rediss://') ? {} : undefined,
  })

  _redis.on('error', (err) => {
    console.error('[Redis] Connection error:', err.message)
  })

  return _redis
}

export function closeRedis(): void {
  if (_redis) {
    _redis.disconnect()
    _redis = null
  }
}
