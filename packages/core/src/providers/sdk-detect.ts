import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { logger } from '@blade/shared'

let cachedResult: boolean | null = null

/**
 * Detect whether the Claude Agent SDK can run on this machine.
 *
 * The SDK needs a valid OAuth session at ~/.claude/ — this only exists
 * on the developer's local machine, not on Railway/Docker/CI.
 *
 * Override with BLADE_USE_SDK=true|false to force behavior.
 *
 * Result is cached after first check.
 */
export function isSdkAvailable(): boolean {
  // Env var override — always wins
  const override = process.env.BLADE_USE_SDK
  if (override === 'true') return true
  if (override === 'false') return false

  // Return cached result if we've already checked
  if (cachedResult !== null) return cachedResult

  cachedResult = detectSdkAvailability()
  logger.info('SdkDetect', `SDK available: ${cachedResult}`)
  return cachedResult
}

function detectSdkAvailability(): boolean {
  const home = process.env.HOME ?? '/tmp'
  const claudeDir = join(home, '.claude')

  // No ~/.claude directory = no local auth
  if (!existsSync(claudeDir)) return false

  // Check for OAuth credentials — the SDK stores auth data in ~/.claude/
  // Look for any auth-related files (credentials.json, .credentials, etc.)
  try {
    const files = readdirSync(claudeDir)
    const hasAuth = files.some(f =>
      f.includes('credentials') ||
      f.includes('auth') ||
      f.includes('oauth') ||
      f === 'settings.json'
    )
    if (!hasAuth) return false
  } catch {
    return false
  }

  // Check we're not in a container (Railway, Docker)
  if (process.env.RAILWAY_SERVICE_NAME) return false
  if (existsSync('/.dockerenv')) return false

  return true
}

/**
 * Reset cached result — useful for testing or after config changes.
 */
export function resetSdkDetection(): void {
  cachedResult = null
}
