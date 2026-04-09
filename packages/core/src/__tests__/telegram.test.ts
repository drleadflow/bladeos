import { describe, it, expect } from 'vitest'
import { cleanResponse, splitMessage } from '../integrations/telegram.js'

describe('telegram: cleanResponse', () => {
  it('strips markdown bold', () => {
    expect(cleanResponse('Hello **world**')).toBe('Hello world')
  })

  it('strips markdown italic', () => {
    expect(cleanResponse('Hello *world*')).toBe('Hello world')
  })

  it('strips markdown headers', () => {
    expect(cleanResponse('## Hello\n### World')).toBe('Hello\nWorld')
  })

  it('strips inline code backticks', () => {
    expect(cleanResponse('Use `npm install`')).toBe('Use npm install')
  })

  it('strips code blocks but keeps content', () => {
    expect(cleanResponse('```js\nconsole.log("hi")\n```')).toBe('console.log("hi")')
  })

  it('strips Claude metadata lines', () => {
    expect(cleanResponse('Claude Code finished in 2.3s\nHello')).toBe('Hello')
  })

  it('strips reason lines', () => {
    expect(cleanResponse('Reason: completed\nHello')).toBe('Hello')
  })

  it('collapses multiple newlines', () => {
    expect(cleanResponse('Hello\n\n\n\nWorld')).toBe('Hello\n\nWorld')
  })

  it('handles empty string', () => {
    expect(cleanResponse('')).toBe('')
  })

  it('handles text with no markdown', () => {
    expect(cleanResponse('Just plain text here')).toBe('Just plain text here')
  })
})

describe('telegram: splitMessage', () => {
  it('returns single-element array for short messages', () => {
    expect(splitMessage('Hello')).toEqual(['Hello'])
  })

  it('returns single-element array for messages at exactly 4096 chars', () => {
    const msg = 'x'.repeat(4096)
    expect(splitMessage(msg)).toEqual([msg])
  })

  it('splits messages longer than 4096 chars', () => {
    const msg = 'x'.repeat(5000)
    const chunks = splitMessage(msg)
    expect(chunks.length).toBeGreaterThan(1)
    // All chunks should be <= 4096
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(4096)
    }
  })

  it('prefers splitting at newlines', () => {
    const part1 = 'a'.repeat(3000)
    const part2 = 'b'.repeat(3000)
    const msg = `${part1}\n${part2}`
    const chunks = splitMessage(msg)
    expect(chunks.length).toBe(2)
    expect(chunks[0]).toBe(part1)
    expect(chunks[1]).toBe(part2)
  })

  it('handles messages with no newlines', () => {
    const msg = 'x'.repeat(10000)
    const chunks = splitMessage(msg)
    expect(chunks.length).toBeGreaterThan(1)
    const rejoined = chunks.join('')
    expect(rejoined).toBe(msg)
  })

  it('returns empty array content for empty string', () => {
    expect(splitMessage('')).toEqual([''])
  })
})
