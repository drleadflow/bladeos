import { db, uuid, now } from './helpers.js'

// ============================================================
// XP EVENTS
// ============================================================

export const xpEvents = {
  record(params: { action: string; xp: number; employeeId?: string }): { id: string } {
    const id = uuid()
    db().prepare(
      'INSERT INTO xp_events (id, action, xp, employee_id, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, params.action, params.xp, params.employeeId ?? null, now())
    return { id }
  },

  total(): number {
    const row = db().prepare('SELECT COALESCE(SUM(xp), 0) as total FROM xp_events').get() as { total: number }
    return row.total
  },

  recent(limit = 20) {
    return db().prepare(
      `SELECT id, action, xp, employee_id as employeeId, created_at as createdAt
       FROM xp_events ORDER BY created_at DESC LIMIT ?`
    ).all(limit) as { id: string; action: string; xp: number; employeeId: string | null; createdAt: string }[]
  },
}

// ============================================================
// STREAKS
// ============================================================

export const streaks = {
  get(id: string) {
    return db().prepare(
      `SELECT id, name, current_streak as currentStreak, longest_streak as longestStreak,
       last_checked_in as lastCheckedIn, employee_id as employeeId
       FROM streaks WHERE id = ?`
    ).get(id) as { id: string; name: string; currentStreak: number; longestStreak: number; lastCheckedIn: string; employeeId: string } | undefined
  },

  upsert(params: { id: string; name: string; currentStreak: number; longestStreak: number; lastCheckedIn: string; employeeId: string }): void {
    db().prepare(
      `INSERT INTO streaks (id, name, current_streak, longest_streak, last_checked_in, employee_id)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         current_streak = excluded.current_streak,
         longest_streak = excluded.longest_streak,
         last_checked_in = excluded.last_checked_in`
    ).run(params.id, params.name, params.currentStreak, params.longestStreak, params.lastCheckedIn, params.employeeId)
  },

  list(employeeId?: string) {
    if (employeeId) {
      return db().prepare(
        `SELECT id, name, current_streak as currentStreak, longest_streak as longestStreak,
         last_checked_in as lastCheckedIn, employee_id as employeeId
         FROM streaks WHERE employee_id = ? ORDER BY name`
      ).all(employeeId) as { id: string; name: string; currentStreak: number; longestStreak: number; lastCheckedIn: string; employeeId: string }[]
    }
    return db().prepare(
      `SELECT id, name, current_streak as currentStreak, longest_streak as longestStreak,
       last_checked_in as lastCheckedIn, employee_id as employeeId
       FROM streaks ORDER BY name`
    ).all() as { id: string; name: string; currentStreak: number; longestStreak: number; lastCheckedIn: string; employeeId: string }[]
  },
}

// ============================================================
// ACHIEVEMENTS
// ============================================================

export const achievements = {
  unlock(id: string, name: string): void {
    db().prepare(
      `INSERT OR IGNORE INTO achievements (id, name, unlocked_at) VALUES (?, ?, ?)`
    ).run(id, name, now())
  },

  list() {
    return db().prepare(
      `SELECT id, name, unlocked_at as unlockedAt FROM achievements ORDER BY unlocked_at DESC`
    ).all() as { id: string; name: string; unlockedAt: string }[]
  },

  isUnlocked(id: string): boolean {
    const row = db().prepare('SELECT id FROM achievements WHERE id = ?').get(id)
    return !!row
  },
}

// ============================================================
// USER PROFILE
// ============================================================

export const userProfile = {
  get() {
    return db().prepare(
      `SELECT id, total_xp as totalXp, level, created_at as createdAt
       FROM user_profile WHERE id = 'default'`
    ).get() as { id: string; totalXp: number; level: number; createdAt: string } | undefined
  },

  update(params: { totalXp: number; level: number }): void {
    db().prepare(
      `INSERT INTO user_profile (id, total_xp, level, created_at)
       VALUES ('default', ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         total_xp = excluded.total_xp,
         level = excluded.level`
    ).run(params.totalXp, params.level, now())
  },
}
