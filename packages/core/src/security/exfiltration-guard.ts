import { logger } from '@blade/shared'

export interface ExfiltrationCheckResult {
  hasSecrets: boolean
  sanitizedText: string
  detectedTypes: string[]
  redactionCount: number
}

const SECRET_PATTERNS: Array<{ pattern: RegExp; name: string; replacement: string }> = [
  // Anthropic
  { pattern: /sk-ant-[a-zA-Z0-9_-]{20,}/g, name: 'anthropic_key', replacement: '[REDACTED:anthropic_key]' },

  // OpenAI
  { pattern: /sk-proj-[a-zA-Z0-9_-]{20,}/g, name: 'openai_project_key', replacement: '[REDACTED:openai_key]' },
  { pattern: /sk-[a-zA-Z0-9]{40,}/g, name: 'openai_key', replacement: '[REDACTED:openai_key]' },

  // GitHub
  { pattern: /ghp_[a-zA-Z0-9]{36}/g, name: 'github_pat', replacement: '[REDACTED:github_token]' },
  { pattern: /gho_[a-zA-Z0-9]{36}/g, name: 'github_oauth', replacement: '[REDACTED:github_token]' },
  { pattern: /github_pat_[a-zA-Z0-9_]{22,}/g, name: 'github_fine_pat', replacement: '[REDACTED:github_token]' },

  // Slack
  { pattern: /xoxb-[0-9]+-[a-zA-Z0-9]+/g, name: 'slack_bot', replacement: '[REDACTED:slack_token]' },
  { pattern: /xoxp-[0-9]+-[a-zA-Z0-9]+/g, name: 'slack_user', replacement: '[REDACTED:slack_token]' },
  { pattern: /xoxs-[0-9]+-[a-zA-Z0-9]+/g, name: 'slack_session', replacement: '[REDACTED:slack_token]' },

  // AWS
  { pattern: /AKIA[0-9A-Z]{16}/g, name: 'aws_access_key', replacement: '[REDACTED:aws_key]' },

  // Google
  { pattern: /AIza[0-9A-Za-z_-]{35}/g, name: 'google_api_key', replacement: '[REDACTED:google_key]' },

  // Telegram
  { pattern: /[0-9]{8,10}:[A-Za-z0-9_-]{35}/g, name: 'telegram_bot_token', replacement: '[REDACTED:telegram_token]' },

  // Stripe
  { pattern: /sk_live_[a-zA-Z0-9]{20,}/g, name: 'stripe_live_key', replacement: '[REDACTED:stripe_key]' },
  { pattern: /rk_live_[a-zA-Z0-9]{20,}/g, name: 'stripe_restricted_key', replacement: '[REDACTED:stripe_key]' },

  // Private keys
  { pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, name: 'private_key', replacement: '[REDACTED:private_key]' },

  // Generic high-entropy secrets (64 hex chars)
  { pattern: /(?<![a-zA-Z0-9])[a-f0-9]{64}(?![a-zA-Z0-9])/gi, name: 'hex_secret_64', replacement: '[REDACTED:hex_token]' },

  // JWT tokens
  { pattern: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, name: 'jwt_token', replacement: '[REDACTED:jwt]' },

  // Connection strings
  { pattern: /(?:mongodb|postgres|mysql|redis):\/\/[^\s"']+/gi, name: 'connection_string', replacement: '[REDACTED:connection_string]' },
]

function getProtectedEnvValues(): Array<{ name: string; value: string }> {
  const protectedSuffixes = ['_KEY', '_SECRET', '_TOKEN', '_PASSWORD', '_API_KEY']
  const results: Array<{ name: string; value: string }> = []

  for (const [name, value] of Object.entries(process.env)) {
    if (!value || value.length < 8) continue
    if (protectedSuffixes.some(suffix => name.toUpperCase().endsWith(suffix))) {
      results.push({ name, value })
    }
  }

  return results
}

export function scanForSecrets(text: string): ExfiltrationCheckResult {
  let sanitized = text
  const detectedTypes: string[] = []
  let redactionCount = 0

  for (const { pattern, name, replacement } of SECRET_PATTERNS) {
    pattern.lastIndex = 0
    const matches = sanitized.match(pattern)
    if (matches) {
      detectedTypes.push(name)
      redactionCount += matches.length
      sanitized = sanitized.replace(pattern, replacement)
      pattern.lastIndex = 0
    }
  }

  const protectedVars = getProtectedEnvValues()
  for (const { name, value } of protectedVars) {
    if (sanitized.includes(value)) {
      detectedTypes.push(`env:${name}`)
      redactionCount++
      sanitized = sanitized.split(value).join(`[REDACTED:${name}]`)
    }
    const b64 = Buffer.from(value).toString('base64')
    if (b64.length > 10 && sanitized.includes(b64)) {
      detectedTypes.push(`env_b64:${name}`)
      redactionCount++
      sanitized = sanitized.split(b64).join(`[REDACTED:${name}_b64]`)
    }
  }

  const hasSecrets = detectedTypes.length > 0

  if (hasSecrets) {
    logger.warn('ExfiltrationGuard', `Detected ${redactionCount} secrets in output: ${detectedTypes.join(', ')}`)
  }

  return { hasSecrets, sanitizedText: sanitized, detectedTypes, redactionCount }
}

export function getSecretPatternCount(): number {
  return SECRET_PATTERNS.length
}
