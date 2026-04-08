import { getDb } from '@blade/db'

export interface AchievementDefinition {
  id: string
  name: string
  description: string
  icon: string
  condition: string
}

export interface UnlockedAchievement extends AchievementDefinition {
  unlockedAt?: string
}

// ============================================================
// PRE-BUILT ACHIEVEMENTS
// ============================================================

export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  { id: 'first-chat', name: 'First Contact', description: 'Had your first conversation with Blade', icon: '\u{1F4AC}', condition: '1+ conversations' },
  { id: 'first-memory', name: 'Elephant Memory', description: 'Saved your first memory', icon: '\u{1F9E0}', condition: '1+ memories' },
  { id: 'first-job', name: 'Ship It', description: 'Completed your first coding job', icon: '\u{1F680}', condition: '1+ completed jobs' },
  { id: 'streak-7', name: 'On Fire', description: 'Maintained a 7-day streak', icon: '\u{1F525}', condition: '7-day streak' },
  { id: 'streak-30', name: 'Unstoppable', description: '30-day streak', icon: '\u26A1', condition: '30-day streak' },
  { id: 'team-3', name: 'Team Builder', description: 'Activated 3+ employees', icon: '\u{1F465}', condition: '3+ active employees' },
  { id: 'team-all', name: 'Full Squad', description: 'Activated all 11 employees', icon: '\u{1F3C6}', condition: 'All employees active' },
  { id: 'scorecard-green', name: 'Green Machine', description: 'All scorecard metrics green in one week', icon: '\u{1F49A}', condition: 'All green' },
  { id: 'fast-cash', name: 'Money Printer', description: 'Ran your first Fast Cash play', icon: '\u{1F4B0}', condition: '1+ fast cash plays' },
  { id: 'level-5', name: 'Legend Status', description: 'Reached Level 5', icon: '\u{1F451}', condition: 'Level 5' },
  { id: 'tools-10', name: 'Swiss Army Knife', description: 'Used 10 different tools', icon: '\u{1F527}', condition: '10+ unique tools used' },
  { id: 'handoff', name: 'Team Player', description: 'First employee handoff', icon: '\u{1F91D}', condition: '1+ handoffs' },
  { id: 'workflow', name: 'Automation King', description: 'Completed your first workflow', icon: '\u2699\uFE0F', condition: '1+ workflows completed' },
  { id: 'night-owl', name: 'Night Owl', description: 'Used Blade after midnight', icon: '\u{1F989}', condition: 'Activity after midnight' },
  { id: 'early-bird', name: 'Early Bird', description: 'Used Blade before 6 AM', icon: '\u{1F426}', condition: 'Activity before 6 AM' },
] as const

// ============================================================
// HELPERS
// ============================================================

function db() {
  return getDb()
}

function now(): string {
  return new Date().toISOString()
}

// ============================================================
// PUBLIC API
// ============================================================

export function getAchievements(): UnlockedAchievement[] {
  const unlocked = db().prepare(
    `SELECT id, unlocked_at as unlockedAt FROM achievements`
  ).all() as { id: string; unlockedAt: string }[]

  const unlockedMap = new Map(unlocked.map(a => [a.id, a.unlockedAt]))

  return ACHIEVEMENTS.map(def => ({
    ...def,
    unlockedAt: unlockedMap.get(def.id),
  }))
}

export function unlockAchievement(achievementId: string): UnlockedAchievement | null {
  const def = ACHIEVEMENTS.find(a => a.id === achievementId)
  if (!def) return null

  const existing = db().prepare(
    `SELECT id FROM achievements WHERE id = ?`
  ).get(achievementId) as { id: string } | undefined

  if (existing) {
    // Already unlocked
    return { ...def, unlockedAt: undefined }
  }

  const ts = now()
  db().prepare(
    `INSERT INTO achievements (id, name, unlocked_at) VALUES (?, ?, ?)`
  ).run(achievementId, def.name, ts)

  return { ...def, unlockedAt: ts }
}

export function checkAchievements(): UnlockedAchievement[] {
  const newlyUnlocked: UnlockedAchievement[] = []

  const alreadyUnlocked = new Set(
    (db().prepare(`SELECT id FROM achievements`).all() as { id: string }[]).map(a => a.id)
  )

  // Check: first-chat (1+ conversations)
  if (!alreadyUnlocked.has('first-chat')) {
    const row = db().prepare(`SELECT COUNT(*) as count FROM conversations`).get() as { count: number }
    if (row.count > 0) {
      const a = unlockAchievement('first-chat')
      if (a?.unlockedAt) newlyUnlocked.push(a)
    }
  }

  // Check: first-memory (1+ memories)
  if (!alreadyUnlocked.has('first-memory')) {
    const row = db().prepare(`SELECT COUNT(*) as count FROM memories`).get() as { count: number }
    if (row.count > 0) {
      const a = unlockAchievement('first-memory')
      if (a?.unlockedAt) newlyUnlocked.push(a)
    }
  }

  // Check: first-job (1+ completed jobs)
  if (!alreadyUnlocked.has('first-job')) {
    const row = db().prepare(`SELECT COUNT(*) as count FROM jobs WHERE status = 'completed'`).get() as { count: number }
    if (row.count > 0) {
      const a = unlockAchievement('first-job')
      if (a?.unlockedAt) newlyUnlocked.push(a)
    }
  }

  // Check: streak-7 (any streak >= 7)
  if (!alreadyUnlocked.has('streak-7')) {
    const row = db().prepare(`SELECT COUNT(*) as count FROM streaks WHERE longest_streak >= 7`).get() as { count: number }
    if (row.count > 0) {
      const a = unlockAchievement('streak-7')
      if (a?.unlockedAt) newlyUnlocked.push(a)
    }
  }

  // Check: streak-30 (any streak >= 30)
  if (!alreadyUnlocked.has('streak-30')) {
    const row = db().prepare(`SELECT COUNT(*) as count FROM streaks WHERE longest_streak >= 30`).get() as { count: number }
    if (row.count > 0) {
      const a = unlockAchievement('streak-30')
      if (a?.unlockedAt) newlyUnlocked.push(a)
    }
  }

  // Check: team-3 (3+ active employees)
  if (!alreadyUnlocked.has('team-3')) {
    const row = db().prepare(`SELECT COUNT(*) as count FROM employees WHERE active = 1`).get() as { count: number }
    if (row.count >= 3) {
      const a = unlockAchievement('team-3')
      if (a?.unlockedAt) newlyUnlocked.push(a)
    }
  }

  // Check: team-all (all 11 employees active)
  if (!alreadyUnlocked.has('team-all')) {
    const total = db().prepare(`SELECT COUNT(*) as count FROM employees`).get() as { count: number }
    const active = db().prepare(`SELECT COUNT(*) as count FROM employees WHERE active = 1`).get() as { count: number }
    if (total.count > 0 && active.count >= total.count) {
      const a = unlockAchievement('team-all')
      if (a?.unlockedAt) newlyUnlocked.push(a)
    }
  }

  // Check: tools-10 (10+ unique tools used)
  if (!alreadyUnlocked.has('tools-10')) {
    const row = db().prepare(`SELECT COUNT(DISTINCT tool_name) as count FROM tool_calls`).get() as { count: number }
    if (row.count >= 10) {
      const a = unlockAchievement('tools-10')
      if (a?.unlockedAt) newlyUnlocked.push(a)
    }
  }

  // Check: level-5 (user level >= 5)
  if (!alreadyUnlocked.has('level-5')) {
    const row = db().prepare(`SELECT level FROM user_profile WHERE id = 'default'`).get() as { level: number } | undefined
    if (row && row.level >= 5) {
      const a = unlockAchievement('level-5')
      if (a?.unlockedAt) newlyUnlocked.push(a)
    }
  }

  // Check: night-owl (activity after midnight, before 5am)
  if (!alreadyUnlocked.has('night-owl')) {
    const hour = new Date().getHours()
    if (hour >= 0 && hour < 5) {
      const a = unlockAchievement('night-owl')
      if (a?.unlockedAt) newlyUnlocked.push(a)
    }
  }

  // Check: early-bird (activity before 6am)
  if (!alreadyUnlocked.has('early-bird')) {
    const hour = new Date().getHours()
    if (hour >= 4 && hour < 6) {
      const a = unlockAchievement('early-bird')
      if (a?.unlockedAt) newlyUnlocked.push(a)
    }
  }

  return newlyUnlocked
}
