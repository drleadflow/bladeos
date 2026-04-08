// ---------------------------------------------------------------------------
// Emotional Awareness Engine
// ---------------------------------------------------------------------------
// Detects emotional context from recent message patterns using pure heuristics.
// No LLM calls — signal detection via keyword matching, message structure
// analysis, and temporal patterns.
// ---------------------------------------------------------------------------

export interface EmotionalContext {
  state: 'calm' | 'stressed' | 'frustrated' | 'excited' | 'overwhelmed' | 'burned_out'
  confidence: number // 0-1
  suggestedArchetypeShift?: 'coach' | 'operator'
  supportMessage?: string
}

// ---------------------------------------------------------------------------
// Signal word lists
// ---------------------------------------------------------------------------

const STRESS_WORDS = [
  'stressed', 'stress', 'anxious', 'anxiety', 'worried', 'pressure',
  'deadline', 'urgent', 'asap', 'hurry', 'rush', 'behind',
]

const FRUSTRATION_WORDS = [
  'frustrated', 'frustrating', 'annoying', 'annoyed', 'broken', 'stupid',
  'ridiculous', 'ugh', 'wtf', 'damn', 'hate', 'sick of', 'fed up',
  "doesn't work", "won't work", 'failing', 'failed again',
]

const EXCITEMENT_WORDS = [
  'amazing', 'awesome', 'incredible', 'fantastic', 'great', 'love',
  'excited', 'thrilled', 'nailed', 'crushed it', 'let\'s go', 'yes',
  'perfect', 'brilliant', 'won', 'closed', 'landed',
]

const OVERWHELM_WORDS = [
  'overwhelmed', 'too much', 'can\'t keep up', 'drowning', 'swamped',
  'buried', 'overloaded', 'where do i start', 'so many', 'everything',
  'don\'t know what to do', 'lost', 'confused', 'help',
]

const BURNOUT_WORDS = [
  'tired', 'exhausted', 'burned out', 'burnout', 'burnt out', 'drained',
  'can\'t anymore', 'giving up', 'no energy', 'depleted', 'done',
  'need a break', 'running on empty',
]

const POSITIVE_WORDS = [
  'good', 'nice', 'happy', 'glad', 'pleased', 'satisfied', 'calm',
  'peaceful', 'relaxed', 'steady', 'fine', 'well', 'better',
]

// ---------------------------------------------------------------------------
// Analysis helpers
// ---------------------------------------------------------------------------

function countMatches(text: string, words: string[]): number {
  const lower = text.toLowerCase()
  let count = 0
  for (const word of words) {
    if (lower.includes(word)) count++
  }
  return count
}

function averageLength(messages: string[]): number {
  if (messages.length === 0) return 0
  return messages.reduce((sum, m) => sum + m.length, 0) / messages.length
}

function exclamationRatio(messages: string[]): number {
  if (messages.length === 0) return 0
  const withExcl = messages.filter(m => m.includes('!')).length
  return withExcl / messages.length
}

function questionRatio(messages: string[]): number {
  if (messages.length === 0) return 0
  const withQ = messages.filter(m => m.includes('?')).length
  return withQ / messages.length
}

function capsRatio(messages: string[]): number {
  const all = messages.join(' ')
  if (all.length === 0) return 0
  const caps = all.replace(/[^A-Z]/g, '').length
  const letters = all.replace(/[^a-zA-Z]/g, '').length
  if (letters === 0) return 0
  return caps / letters
}

function isLateNight(): boolean {
  const hour = new Date().getHours()
  return hour >= 22 || hour < 5
}

// ---------------------------------------------------------------------------
// Main detection function
// ---------------------------------------------------------------------------

export function detectEmotionalContext(recentMessages: string[]): EmotionalContext {
  if (recentMessages.length === 0) {
    return { state: 'calm', confidence: 0.3 }
  }

  const combined = recentMessages.join(' ')
  const avgLen = averageLength(recentMessages)
  const exclRatio = exclamationRatio(recentMessages)
  const qRatio = questionRatio(recentMessages)
  const capsR = capsRatio(recentMessages)

  // Score each state
  const scores: Record<EmotionalContext['state'], number> = {
    calm: 0,
    stressed: 0,
    frustrated: 0,
    excited: 0,
    overwhelmed: 0,
    burned_out: 0,
  }

  // Direct keyword signals (strongest)
  scores.stressed += countMatches(combined, STRESS_WORDS) * 2
  scores.frustrated += countMatches(combined, FRUSTRATION_WORDS) * 2.5
  scores.excited += countMatches(combined, EXCITEMENT_WORDS) * 2
  scores.overwhelmed += countMatches(combined, OVERWHELM_WORDS) * 2.5
  scores.burned_out += countMatches(combined, BURNOUT_WORDS) * 3
  scores.calm += countMatches(combined, POSITIVE_WORDS) * 1.5

  // Structural signals
  // Short, terse messages = stressed/frustrated
  if (avgLen < 20 && recentMessages.length >= 3) {
    scores.stressed += 2
    scores.frustrated += 1
  }

  // Lots of exclamation marks + positive words = excited
  if (exclRatio > 0.4) {
    const positiveCount = countMatches(combined, EXCITEMENT_WORDS) + countMatches(combined, POSITIVE_WORDS)
    if (positiveCount > 0) {
      scores.excited += 3
    } else {
      scores.frustrated += 2
    }
  }

  // Many questions without resolution = overwhelmed
  if (qRatio > 0.5 && recentMessages.length >= 3) {
    scores.overwhelmed += 2
  }

  // CAPS LOCK = stressed or frustrated
  if (capsR > 0.3) {
    scores.stressed += 1.5
    scores.frustrated += 1.5
  }

  // Late-night + negative signals = burnout risk
  if (isLateNight()) {
    scores.burned_out += 1.5
    scores.stressed += 1
  }

  // Baseline calm score so it wins when nothing else is detected
  scores.calm += 3

  // Find the winner
  let maxState: EmotionalContext['state'] = 'calm'
  let maxScore = 0
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0)

  for (const [state, score] of Object.entries(scores) as Array<[EmotionalContext['state'], number]>) {
    if (score > maxScore) {
      maxScore = score
      maxState = state
    }
  }

  const confidence = Math.min(maxScore / Math.max(totalScore, 1), 0.95)

  // Build response
  const result: EmotionalContext = {
    state: maxState,
    confidence: Math.round(confidence * 100) / 100,
  }

  switch (maxState) {
    case 'burned_out':
      result.suggestedArchetypeShift = 'coach'
      result.supportMessage = 'You seem depleted. Let\'s slow down — what\'s the ONE thing that would make tomorrow feel lighter?'
      break
    case 'stressed':
      result.suggestedArchetypeShift = 'coach'
      result.supportMessage = 'I can feel the pressure. Let\'s take a breath and prioritize — what\'s the most important thing right now?'
      break
    case 'frustrated':
      result.supportMessage = 'That sounds frustrating. Want me to help break this problem down into smaller pieces?'
      break
    case 'excited':
      result.supportMessage = 'Love the energy! Let\'s channel this momentum — what\'s the next move to capitalize on this win?'
      break
    case 'overwhelmed':
      result.supportMessage = 'There\'s a lot going on. Let me help you narrow it down to your top 3 priorities right now.'
      break
    case 'calm':
      // No shift needed
      break
  }

  return result
}
