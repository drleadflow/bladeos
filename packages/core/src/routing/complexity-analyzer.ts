import type { TaskComplexity } from '../model-provider.js'

export type ExtendedComplexity = TaskComplexity | 'acknowledgment'

/**
 * Analyze message text to determine task complexity.
 * Used for auto-routing to the cheapest capable model.
 */
export function analyzeComplexity(message: string): ExtendedComplexity {
  const trimmed = message.trim()

  // Tier 0: Acknowledgments — route to cheapest model
  if (isAcknowledgment(trimmed)) return 'acknowledgment'

  // Estimate token count (rough: 1 token ≈ 4 chars)
  const estimatedTokens = Math.ceil(trimmed.length / 4)

  // Tier: large-context — very large messages
  if (estimatedTokens > 25000) return 'large-context'

  // Check for code indicators
  const hasCodeBlock = /```[\s\S]*?```/.test(trimmed)
  const hasInlineCode = /`[^`]+`/.test(trimmed)
  const hasCodeKeywords = /\b(implement|refactor|debug|build|deploy|fix bug|write code|create endpoint|add feature|unit test|integration test)\b/i.test(trimmed)

  // Check for complexity indicators
  const hasMultiStep = /\b(then|after that|next|also|and then|step \d|first.*then|additionally)\b/i.test(trimmed)
  const hasAnalysis = /\b(analyze|compare|evaluate|design|architect|plan|strategy|tradeoff)\b/i.test(trimmed)
  const questionCount = (trimmed.match(/\?/g) ?? []).length

  // Tier: heavy — complex tasks
  if (
    hasCodeBlock ||
    (hasCodeKeywords && estimatedTokens > 200) ||
    hasAnalysis ||
    questionCount >= 3 ||
    hasMultiStep
  ) {
    return 'heavy'
  }

  // Suppress unused variable warning — hasInlineCode used for future expansion
  void hasInlineCode

  // Tier: light — simple questions/tasks
  if (estimatedTokens < 50 && !hasCodeBlock && !hasCodeKeywords && !hasMultiStep && questionCount <= 1) {
    return 'light'
  }

  // Default: standard
  return 'standard'
}

const ACKNOWLEDGMENT_PATTERNS: readonly RegExp[] = [
  /^(ok|okay|k|kk)\.?$/i,
  /^(thanks|thank you|thx|ty)\.?!?$/i,
  /^(got it|understood|noted|roger|copy)\.?$/i,
  /^(sure|yes|no|yep|nope|yeah|nah|yup)\.?!?$/i,
  /^(cool|great|nice|perfect|awesome|good|fine|sounds good)\.?!?$/i,
  /^(👍|✅|🙏|👌|💪|🔥|✨)$/u,
  /^(lol|haha|lmao)$/i,
]

function isAcknowledgment(text: string): boolean {
  return ACKNOWLEDGMENT_PATTERNS.some(pattern => pattern.test(text))
}
