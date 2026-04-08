import { getDb } from '@blade/db'

// ============================================================
// TYPES
// ============================================================

export interface XPEvent {
  action: string
  xp: number
  employeeId?: string
}

export interface UserLevel {
  level: number
  title: string
  currentXP: number
  nextLevelXP: number
  totalXP: number
}

export interface Streak {
  id: string
  name: string
  currentStreak: number
  longestStreak: number
  lastCheckedIn: string
  employeeId: string
}

export interface Achievement {
  id: string
  name: string
  description: string
  icon: string
  unlockedAt?: string
  condition: string
}

// ============================================================
// CONSTANTS
// ============================================================

export const XP_AWARDS = {
  completed_task: 10,
  hit_scorecard_green: 25,
  maintained_streak_7: 50,
  first_tool_use_of_day: 5,
  first_employee_use: 100,
  completed_workflow: 75,
  hit_milestone: 200,
} as const

const LEVELS: readonly { level: number; title: string; minXP: number; maxXP: number }[] = [
  { level: 1, title: 'Rookie', minXP: 0, maxXP: 100 },
  { level: 2, title: 'Hustler', minXP: 100, maxXP: 500 },
  { level: 3, title: 'Operator', minXP: 500, maxXP: 1500 },
  { level: 4, title: 'Commander', minXP: 1500, maxXP: 5000 },
  { level: 5, title: 'Legend', minXP: 5000, maxXP: 15000 },
  { level: 6, title: 'Blade Master', minXP: 15000, maxXP: Infinity },
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

function computeLevel(totalXP: number): UserLevel {
  const matched = LEVELS.find(l => totalXP >= l.minXP && totalXP < l.maxXP) ?? LEVELS[LEVELS.length - 1]
  return {
    level: matched.level,
    title: matched.title,
    currentXP: totalXP - matched.minXP,
    nextLevelXP: matched.maxXP === Infinity ? 0 : matched.maxXP - matched.minXP,
    totalXP,
  }
}

function ensureUserProfile(): void {
  db().prepare(
    `INSERT OR IGNORE INTO user_profile (id, total_xp, level, created_at)
     VALUES ('default', 0, 1, ?)`
  ).run(now())
}

// ============================================================
// PUBLIC API
// ============================================================

export function awardXP(event: XPEvent): UserLevel {
  ensureUserProfile()

  const id = crypto.randomUUID()
  db().prepare(
    `INSERT INTO xp_events (id, action, xp, employee_id, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run(id, event.action, event.xp, event.employeeId ?? null, now())

  db().prepare(
    `UPDATE user_profile SET total_xp = total_xp + ? WHERE id = 'default'`
  ).run(event.xp)

  const row = db().prepare(
    `SELECT total_xp FROM user_profile WHERE id = 'default'`
  ).get() as { total_xp: number }

  const level = computeLevel(row.total_xp)

  db().prepare(
    `UPDATE user_profile SET level = ? WHERE id = 'default'`
  ).run(level.level)

  return level
}

export function getUserLevel(): UserLevel {
  ensureUserProfile()

  const row = db().prepare(
    `SELECT total_xp FROM user_profile WHERE id = 'default'`
  ).get() as { total_xp: number }

  return computeLevel(row.total_xp)
}

export function getStreaks(employeeId?: string): Streak[] {
  if (employeeId) {
    return db().prepare(
      `SELECT id, name, current_streak as currentStreak, longest_streak as longestStreak,
       last_checked_in as lastCheckedIn, employee_id as employeeId
       FROM streaks WHERE employee_id = ? ORDER BY name`
    ).all(employeeId) as Streak[]
  }

  return db().prepare(
    `SELECT id, name, current_streak as currentStreak, longest_streak as longestStreak,
     last_checked_in as lastCheckedIn, employee_id as employeeId
     FROM streaks ORDER BY name`
  ).all() as Streak[]
}

export function checkInStreak(streakId: string): Streak {
  const existing = db().prepare(
    `SELECT id, name, current_streak, longest_streak, last_checked_in, employee_id
     FROM streaks WHERE id = ?`
  ).get(streakId) as { id: string; name: string; current_streak: number; longest_streak: number; last_checked_in: string; employee_id: string } | undefined

  if (!existing) {
    throw new Error(`Streak not found: ${streakId}`)
  }

  const today = new Date().toISOString().slice(0, 10)
  const lastDate = existing.last_checked_in ? existing.last_checked_in.slice(0, 10) : ''

  if (lastDate === today) {
    // Already checked in today
    return {
      id: existing.id,
      name: existing.name,
      currentStreak: existing.current_streak,
      longestStreak: existing.longest_streak,
      lastCheckedIn: existing.last_checked_in,
      employeeId: existing.employee_id,
    }
  }

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const isConsecutive = lastDate === yesterday

  const newCurrent = isConsecutive ? existing.current_streak + 1 : 1
  const newLongest = Math.max(newCurrent, existing.longest_streak)
  const checkedIn = now()

  db().prepare(
    `UPDATE streaks SET current_streak = ?, longest_streak = ?, last_checked_in = ? WHERE id = ?`
  ).run(newCurrent, newLongest, checkedIn, streakId)

  // Award XP for 7-day streak milestones
  if (newCurrent > 0 && newCurrent % 7 === 0) {
    awardXP({ action: 'maintained_streak_7', xp: XP_AWARDS.maintained_streak_7, employeeId: existing.employee_id })
  }

  return {
    id: existing.id,
    name: existing.name,
    currentStreak: newCurrent,
    longestStreak: newLongest,
    lastCheckedIn: checkedIn,
    employeeId: existing.employee_id,
  }
}

export function createStreak(params: { name: string; employeeId: string }): Streak {
  const id = crypto.randomUUID()
  const ts = now()

  db().prepare(
    `INSERT INTO streaks (id, name, current_streak, longest_streak, last_checked_in, employee_id)
     VALUES (?, ?, 0, 0, ?, ?)`
  ).run(id, params.name, ts, params.employeeId)

  return {
    id,
    name: params.name,
    currentStreak: 0,
    longestStreak: 0,
    lastCheckedIn: ts,
    employeeId: params.employeeId,
  }
}

export function getRecentXP(limit = 20): { action: string; xp: number; employeeId: string | null; createdAt: string }[] {
  return db().prepare(
    `SELECT action, xp, employee_id as employeeId, created_at as createdAt
     FROM xp_events ORDER BY created_at DESC LIMIT ?`
  ).all(limit) as { action: string; xp: number; employeeId: string | null; createdAt: string }[]
}
