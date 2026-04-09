import { describe, expect, it } from 'vitest'
import { cleanTelegramResponse, splitTelegramMessage } from '../index.js'

describe('telegram-bot: cleanTelegramResponse', () => {
  it('strips markdown and internal metadata', () => {
    const text = 'Claude Code finished in 2.3s\nReason: completed\n**Hello** `world`'
    expect(cleanTelegramResponse(text)).toBe('Hello world')
  })

  it('collapses excessive whitespace', () => {
    expect(cleanTelegramResponse('Hello\n\n\nWorld')).toBe('Hello\n\nWorld')
  })
})

describe('telegram-bot: splitTelegramMessage', () => {
  it('returns one chunk for short text', () => {
    expect(splitTelegramMessage('Hello')).toEqual(['Hello'])
  })

  it('splits oversized text safely', () => {
    const chunks = splitTelegramMessage('x'.repeat(5000))
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(4096)
    }
  })
})
