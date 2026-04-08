import type { Skill } from '../types.js'

/**
 * Select the best matching skill for a given task description
 * using simple keyword matching. Returns null if no skill matches
 * well enough (threshold: 2 matching words).
 *
 * Intentionally simple — can be upgraded to LLM-based matching later.
 */
export function selectSkill(
  taskDescription: string,
  availableSkills: Skill[]
): Skill | null {
  if (availableSkills.length === 0) {
    return null
  }

  const taskWords = taskDescription
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2)

  let bestSkill: Skill | null = null
  let bestScore = 0

  for (const skill of availableSkills) {
    const skillText = `${skill.name} ${skill.description}`.toLowerCase()
    let score = 0

    for (const word of taskWords) {
      if (skillText.includes(word)) {
        score++
      }
    }

    if (score > bestScore) {
      bestScore = score
      bestSkill = skill
    }
  }

  // Minimum threshold of 2 matching words
  return bestScore >= 2 ? bestSkill : null
}
