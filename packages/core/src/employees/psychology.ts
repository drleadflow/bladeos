// Buyer archetype detection keywords
const VALIDATOR_KEYWORDS = ['testimonial', 'case study', 'proof', 'results', 'guarantee', 'reviews', 'social proof', 'who else']
const INVESTIGATOR_KEYWORDS = ['how does', 'explain', 'details', 'specs', 'compare', 'features', 'data', 'research', 'evidence']
const SKEPTIC_KEYWORDS = ['scam', 'too good', 'catch', 'why should', 'doubt', 'suspicious', 'really', 'honestly', 'prove it']

// Motivation keywords
const ACHIEVEMENT_KEYWORDS = ['goal', 'win', 'top', 'best', 'first', 'crush it', 'dominate', 'outperform', 'excel', 'scale']
const SECURITY_KEYWORDS = ['safe', 'protect', 'risk', 'stable', 'reliable', 'insurance', 'backup', 'consistent', 'guaranteed']
const GROWTH_KEYWORDS = ['learn', 'grow', 'improve', 'develop', 'evolve', 'expand', 'level up', 'transform', 'better']

// Emotional state keywords
const STRESSED_KEYWORDS = ['overwhelmed', 'stressed', 'too much', 'behind', 'drowning', 'exhausted', 'burned out', 'deadline', 'urgent']
const EXCITED_KEYWORDS = ['amazing', 'excited', 'love', 'perfect', 'awesome', 'incredible', 'can\'t wait', 'thrilled', 'pumped']
const FRUSTRATED_KEYWORDS = ['frustrated', 'annoyed', 'broken', 'doesn\'t work', 'stuck', 'confused', 'waste', 'terrible', 'hate']

function countKeywordMatches(text: string, keywords: string[]): number {
  const lower = text.toLowerCase()
  return keywords.filter(kw => lower.includes(kw)).length
}

export function detectBuyerArchetype(messages: string[]): 'validator' | 'investigator' | 'skeptic' | null {
  const combined = messages.join(' ')

  const scores = {
    validator: countKeywordMatches(combined, VALIDATOR_KEYWORDS),
    investigator: countKeywordMatches(combined, INVESTIGATOR_KEYWORDS),
    skeptic: countKeywordMatches(combined, SKEPTIC_KEYWORDS),
  }

  const max = Math.max(scores.validator, scores.investigator, scores.skeptic)
  if (max === 0) return null

  if (scores.validator === max) return 'validator'
  if (scores.investigator === max) return 'investigator'
  return 'skeptic'
}

export function detectMotivation(messages: string[]): 'achievement' | 'security' | 'growth' | null {
  const combined = messages.join(' ')

  const scores = {
    achievement: countKeywordMatches(combined, ACHIEVEMENT_KEYWORDS),
    security: countKeywordMatches(combined, SECURITY_KEYWORDS),
    growth: countKeywordMatches(combined, GROWTH_KEYWORDS),
  }

  const max = Math.max(scores.achievement, scores.security, scores.growth)
  if (max === 0) return null

  if (scores.achievement === max) return 'achievement'
  if (scores.security === max) return 'security'
  return 'growth'
}

export function detectEmotionalState(message: string): 'stressed' | 'excited' | 'frustrated' | 'neutral' {
  const scores = {
    stressed: countKeywordMatches(message, STRESSED_KEYWORDS),
    excited: countKeywordMatches(message, EXCITED_KEYWORDS),
    frustrated: countKeywordMatches(message, FRUSTRATED_KEYWORDS),
  }

  const max = Math.max(scores.stressed, scores.excited, scores.frustrated)
  if (max === 0) return 'neutral'

  if (scores.stressed === max) return 'stressed'
  if (scores.excited === max) return 'excited'
  return 'frustrated'
}

export function getClarityCompass(
  decision: string,
  context: { companyGoals: string; customerProfile: string; values: string; advantages: string }
): string {
  const lines: string[] = []
  lines.push('=== CLARITY COMPASS ===')
  lines.push('')
  lines.push(`DECISION: ${decision}`)
  lines.push('')
  lines.push('NORTH - Company Goals:')
  lines.push(`  ${context.companyGoals}`)
  lines.push(`  Alignment: Does this decision move toward these goals?`)
  lines.push('')
  lines.push('EAST - Customer Profile:')
  lines.push(`  ${context.customerProfile}`)
  lines.push(`  Alignment: Does this serve who we serve best?`)
  lines.push('')
  lines.push('SOUTH - Core Values:')
  lines.push(`  ${context.values}`)
  lines.push(`  Alignment: Does this reflect what we stand for?`)
  lines.push('')
  lines.push('WEST - Unique Advantages:')
  lines.push(`  ${context.advantages}`)
  lines.push(`  Alignment: Does this leverage our unfair advantages?`)
  lines.push('')
  lines.push('VERDICT: Review each quadrant. If 3+ align, proceed. If 2 or fewer, reconsider.')
  lines.push('=== END COMPASS ===')

  return lines.join('\n')
}

export function getValueEquation(
  offer: { dreamOutcome: string; likelihood: string; timeDelay: string; effort: string }
): string {
  const lines: string[] = []
  lines.push('=== VALUE EQUATION ===')
  lines.push('Value = (Dream Outcome x Perceived Likelihood) / (Time Delay x Effort & Sacrifice)')
  lines.push('')
  lines.push('NUMERATOR (maximize these):')
  lines.push(`  Dream Outcome: ${offer.dreamOutcome}`)
  lines.push(`  Perceived Likelihood: ${offer.likelihood}`)
  lines.push('')
  lines.push('DENOMINATOR (minimize these):')
  lines.push(`  Time Delay: ${offer.timeDelay}`)
  lines.push(`  Effort & Sacrifice: ${offer.effort}`)
  lines.push('')
  lines.push('TO INCREASE VALUE:')
  lines.push('  1. Paint a bigger dream outcome (what does life look like after?)')
  lines.push('  2. Increase perceived likelihood (proof, guarantees, testimonials)')
  lines.push('  3. Reduce time delay (faster results, quick wins)')
  lines.push('  4. Reduce effort (done-for-you, simple steps, automation)')
  lines.push('=== END EQUATION ===')

  return lines.join('\n')
}
