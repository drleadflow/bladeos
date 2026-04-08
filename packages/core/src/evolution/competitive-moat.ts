import { getDb } from '@blade/db'
import { logger } from '@blade/shared'

function db() {
  return getDb()
}

export interface UsageReport {
  totalConversations: number
  totalToolCalls: number
  totalMemories: number
  totalSkillsLearned: number
  totalEvolutionEvents: number
  topSkills: { name: string; uses: number }[]
  topTools: { name: string; uses: number }[]
  streakDays: number
  level: string
  uniqueInsight: string
}

// Level thresholds based on total XP
const LEVELS: { threshold: number; name: string }[] = [
  { threshold: 0, name: 'Apprentice' },
  { threshold: 100, name: 'Journeyman' },
  { threshold: 500, name: 'Adept' },
  { threshold: 1500, name: 'Expert' },
  { threshold: 5000, name: 'Master' },
  { threshold: 15000, name: 'Grandmaster' },
  { threshold: 50000, name: 'Legendary' },
]

/**
 * Generate a comprehensive usage/value report showing how much Blade
 * has learned about the user. This creates switching cost awareness.
 * Never throws.
 */
export function generateUsageReport(): UsageReport {
  try {
    // Total conversations
    const convRow = db().prepare('SELECT COUNT(*) as count FROM conversations').get() as { count: number }
    const totalConversations = convRow.count

    // Total tool calls
    const toolRow = db().prepare('SELECT COUNT(*) as count FROM tool_calls').get() as { count: number }
    const totalToolCalls = toolRow.count

    // Total memories
    const memRow = db().prepare('SELECT COUNT(*) as count FROM memories').get() as { count: number }
    const totalMemories = memRow.count

    // Total learned skills
    const skillRow = db().prepare("SELECT COUNT(*) as count FROM skills WHERE source = 'learned'").get() as { count: number }
    const totalSkillsLearned = skillRow.count

    // Total evolution events
    let totalEvolutionEvents = 0
    try {
      const evoRow = db().prepare('SELECT COUNT(*) as count FROM evolution_events').get() as { count: number }
      totalEvolutionEvents = evoRow.count
    } catch {
      // Table may not exist yet
    }

    // Top skills by usage
    const topSkills = db().prepare(
      `SELECT name, total_uses as uses FROM skills
       WHERE total_uses > 0
       ORDER BY total_uses DESC LIMIT 5`
    ).all() as { name: string; uses: number }[]

    // Top tools by usage
    const topTools = db().prepare(
      `SELECT tool_name as name, COUNT(*) as uses FROM tool_calls
       GROUP BY tool_name
       ORDER BY uses DESC LIMIT 5`
    ).all() as { name: string; uses: number }[]

    // Longest streak
    let streakDays = 0
    try {
      const streakRow = db().prepare(
        'SELECT MAX(longest_streak) as maxStreak FROM streaks'
      ).get() as { maxStreak: number | null }
      streakDays = streakRow.maxStreak ?? 0
    } catch {
      // streaks table may not exist
    }

    // User level from XP
    let totalXp = 0
    try {
      const xpRow = db().prepare("SELECT total_xp as totalXp FROM user_profile WHERE id = 'default'").get() as { totalXp: number } | undefined
      totalXp = xpRow?.totalXp ?? 0
    } catch {
      // user_profile may not exist
    }

    let level = LEVELS[0].name
    for (const l of LEVELS) {
      if (totalXp >= l.threshold) {
        level = l.name
      }
    }

    // Generate a unique insight based on usage patterns
    const uniqueInsight = generateInsight(totalConversations, totalToolCalls, totalMemories, totalSkillsLearned)

    return {
      totalConversations,
      totalToolCalls,
      totalMemories,
      totalSkillsLearned,
      totalEvolutionEvents,
      topSkills,
      topTools,
      streakDays,
      level,
      uniqueInsight,
    }
  } catch (err) {
    logger.debug('CompetitiveMoat', `Report generation failed: ${err}`)

    return {
      totalConversations: 0,
      totalToolCalls: 0,
      totalMemories: 0,
      totalSkillsLearned: 0,
      totalEvolutionEvents: 0,
      topSkills: [],
      topTools: [],
      streakDays: 0,
      level: 'Apprentice',
      uniqueInsight: 'Start using Blade to build your personalized AI assistant.',
    }
  }
}

function generateInsight(
  conversations: number,
  toolCalls: number,
  memories: number,
  skillsLearned: number
): string {
  // Estimate hours saved: ~2 min per tool call, ~5 min per conversation with tool use
  const estimatedMinutesSaved = (toolCalls * 2) + (conversations * 3)
  const hoursSaved = Math.round(estimatedMinutesSaved / 60)

  if (hoursSaved > 0 && memories > 0) {
    return `You've saved an estimated ${hoursSaved} hours with Blade. With ${memories} memories and ${skillsLearned} learned skills, Blade is uniquely tuned to how you work.`
  }

  if (memories > 10) {
    return `Blade knows ${memories} things about your preferences, tools, and patterns that no other agent has learned.`
  }

  if (skillsLearned > 0) {
    return `Blade has learned ${skillsLearned} custom skill(s) from your workflow. These are unique to you.`
  }

  if (conversations > 0) {
    return `You've had ${conversations} conversation(s) with Blade. Keep going to unlock personalized insights.`
  }

  return 'Start using Blade to build your personalized AI assistant.'
}
