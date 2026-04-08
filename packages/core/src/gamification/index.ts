export {
  awardXP,
  getUserLevel,
  getStreaks,
  checkInStreak,
  createStreak,
  getRecentXP,
  XP_AWARDS,
} from './xp-system.js'

export type {
  XPEvent,
  UserLevel,
  Streak,
  Achievement,
} from './xp-system.js'

export {
  getAchievements,
  unlockAchievement,
  checkAchievements,
  ACHIEVEMENTS,
} from './achievements.js'

export type {
  AchievementDefinition,
  UnlockedAchievement,
} from './achievements.js'
