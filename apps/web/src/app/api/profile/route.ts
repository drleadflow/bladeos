import { NextResponse } from 'next/server'
import { initializeDb } from '@blade/db'
import {
  getUserLevel,
  getStreaks,
  getAchievements,
  checkAchievements,
  getRecentXP,
} from '@blade/core'

export const runtime = 'nodejs'

export async function GET() {
  try {
    initializeDb()

    // Check for newly unlocked achievements on each profile load
    const newlyUnlocked = checkAchievements()

    const level = getUserLevel()
    const streaks = getStreaks()
    const achievements = getAchievements()
    const recentXP = getRecentXP(20)

    return NextResponse.json({
      success: true,
      data: {
        level,
        xp: {
          total: level.totalXP,
          current: level.currentXP,
          nextLevel: level.nextLevelXP,
          progressPercent: level.nextLevelXP > 0
            ? Math.round((level.currentXP / level.nextLevelXP) * 100)
            : 100,
        },
        streaks,
        achievements,
        recentXP,
        newlyUnlocked,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
