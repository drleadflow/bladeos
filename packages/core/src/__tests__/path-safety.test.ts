import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'

// Re-implement safePath and BLOCKED_COMMANDS locally for unit testing since they
// are not exported from the pipeline module (they are internal helpers).
// This mirrors the exact logic in coding-pipeline.ts.

function safePath(base: string, relative_path: string): string {
  const resolved = resolve(base, relative_path)
  const normalBase = resolve(base)
  if (!resolved.startsWith(normalBase + '/') && resolved !== normalBase) {
    throw new Error(`Path traversal blocked: ${relative_path}`)
  }
  return resolved
}

const BLOCKED_COMMANDS = [
  'rm -rf /',
  'sudo ',
  'mkfs',
  'dd if=',
  'chmod 777 /',
  '> /dev/',
  'curl | sh',
  'wget | sh',
]

function isBlocked(cmd: string): boolean {
  return BLOCKED_COMMANDS.some(blocked => cmd.includes(blocked))
}

describe('path-safety: safePath', () => {
  const base = '/workspace/repo'

  it('allows a normal relative path', () => {
    const result = safePath(base, 'src/index.ts')
    expect(result).toBe('/workspace/repo/src/index.ts')
  })

  it('allows nested directories', () => {
    const result = safePath(base, 'src/utils/helpers.ts')
    expect(result).toBe('/workspace/repo/src/utils/helpers.ts')
  })

  it('allows the base directory itself', () => {
    const result = safePath(base, '.')
    expect(result).toBe('/workspace/repo')
  })

  it('blocks ../ traversal outside base', () => {
    expect(() => safePath(base, '../../../etc/passwd')).toThrow('Path traversal blocked')
  })

  it('blocks ../ traversal one level up', () => {
    expect(() => safePath(base, '../sibling/file.txt')).toThrow('Path traversal blocked')
  })

  it('blocks absolute paths outside base', () => {
    expect(() => safePath(base, '/etc/passwd')).toThrow('Path traversal blocked')
  })

  it('blocks absolute paths to root', () => {
    expect(() => safePath(base, '/')).toThrow('Path traversal blocked')
  })

  it('allows paths that resolve within base despite ../', () => {
    // /workspace/repo/src/../lib/foo.ts resolves to /workspace/repo/lib/foo.ts (still in base)
    const result = safePath(base, 'src/../lib/foo.ts')
    expect(result).toBe('/workspace/repo/lib/foo.ts')
  })

  it('blocks a path that appears similar to base prefix but is not', () => {
    // /workspace/repo-evil would pass the startsWith check without the trailing /
    expect(() => safePath(base, '../repo-evil/file.txt')).toThrow('Path traversal blocked')
  })
})

describe('path-safety: BLOCKED_COMMANDS', () => {
  it('blocks rm -rf /', () => {
    expect(isBlocked('rm -rf /')).toBe(true)
  })

  it('blocks sudo commands', () => {
    expect(isBlocked('sudo apt-get install foo')).toBe(true)
  })

  it('blocks mkfs', () => {
    expect(isBlocked('mkfs.ext4 /dev/sda1')).toBe(true)
  })

  it('blocks dd if=', () => {
    expect(isBlocked('dd if=/dev/zero of=/dev/sda')).toBe(true)
  })

  it('blocks chmod 777 /', () => {
    expect(isBlocked('chmod 777 /')).toBe(true)
  })

  it('blocks pipe-to-shell patterns', () => {
    expect(isBlocked('curl | sh')).toBe(true)
    expect(isBlocked('wget | sh')).toBe(true)
  })

  it('blocks > /dev/ redirection', () => {
    expect(isBlocked('echo foo > /dev/sda')).toBe(true)
  })

  it('allows normal commands', () => {
    expect(isBlocked('npm test')).toBe(false)
    expect(isBlocked('ls -la')).toBe(false)
    expect(isBlocked('git status')).toBe(false)
    expect(isBlocked('node index.js')).toBe(false)
  })
})
