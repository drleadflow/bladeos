/**
 * Mission Router — uses Gemini Flash to pick the best employee
 * for a given mission based on employee skills, title, and tools.
 *
 * Falls back to round-robin if Gemini is unavailable.
 */

import { employees, missions } from '@blade/db'
import { logger } from '@blade/shared'

const ROUTING_PROMPT = `You are a task router for an AI workforce. Given a task description and a list of available employees with their titles and skills, pick the single best employee to handle this task.

Return ONLY the employee slug (e.g., "sdr" or "growth-lead"). No explanation, no quotes, just the slug.

If no employee is a clear fit, return the slug of the most general-purpose employee.`

interface EmployeeSummary {
  slug: string
  name: string
  title: string
  department: string
  objective: string | null
}

/**
 * Auto-assign a mission to the best employee using Gemini Flash.
 * Returns the assigned employee slug.
 */
export async function autoAssignMission(missionId: string): Promise<string> {
  const mission = missions.get(missionId)
  if (!mission) throw new Error(`Mission ${missionId} not found`)

  // Get active employees
  const allEmployees = employees.list() as unknown as (EmployeeSummary & { active: number })[]
  const activeEmployees = allEmployees.filter(e => e.active !== 0)

  if (activeEmployees.length === 0) {
    throw new Error('No active employees available for assignment')
  }

  // Try Gemini Flash for smart routing
  const bestSlug = await routeWithGemini(mission.title, mission.description ?? '', activeEmployees)

  if (bestSlug) {
    missions.assign(missionId, bestSlug)
    logger.info('MissionRouter', `Auto-assigned mission "${mission.title}" to ${bestSlug}`)
    return bestSlug
  }

  // Fallback: assign to employee with fewest active missions
  const missionCounts = missions.countByEmployee()
  const countMap = new Map(missionCounts.map(m => [m.assignedEmployee, m.count]))

  const sorted = [...activeEmployees].sort((a, b) => {
    const aCount = countMap.get(a.slug) ?? 0
    const bCount = countMap.get(b.slug) ?? 0
    return aCount - bCount
  })

  const fallbackSlug = sorted[0].slug
  missions.assign(missionId, fallbackSlug)
  logger.info('MissionRouter', `Fallback-assigned mission "${mission.title}" to ${fallbackSlug}`)
  return fallbackSlug
}

async function routeWithGemini(
  title: string,
  description: string,
  employeeList: EmployeeSummary[]
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    const employeeContext = employeeList.map(e =>
      `- ${e.slug}: ${e.name} (${e.title}, ${e.department}) — ${e.objective ?? 'general purpose'}`
    ).join('\n')

    const userContent = `Task: ${title}\n${description ? `Details: ${description}\n` : ''}\nAvailable employees:\n${employeeContext}`

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: userContent }] }],
      systemInstruction: { role: 'system', parts: [{ text: ROUTING_PROMPT }] },
      generationConfig: { maxOutputTokens: 50, temperature: 0 },
    })

    const slug = result.response.text().trim().toLowerCase().replace(/['"]/g, '')

    // Validate the returned slug exists
    const valid = employeeList.some(e => e.slug === slug)
    if (valid) return slug

    logger.warn('MissionRouter', `Gemini returned invalid slug "${slug}", falling back`)
    return null
  } catch (err) {
    logger.warn('MissionRouter', `Gemini routing failed: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}
