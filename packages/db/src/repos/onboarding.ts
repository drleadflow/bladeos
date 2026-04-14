import { db, uuid, now } from './helpers.js'

// ============================================================
// ONBOARDING SESSIONS
// ============================================================

export interface OnboardingSessionRow {
  id: string
  channel: string
  channelId: string
  state: string
  vertical: string | null
  selectedEmployees: string
  answers: string
  currentEmployeeIndex: number
  currentQuestionIndex: number
  createdAt: string
  completedAt: string | null
}

export const onboarding = {
  create(channel: string, channelId: string): OnboardingSessionRow {
    const id = uuid()
    const ts = now()
    db().prepare(
      `INSERT INTO onboarding_sessions (id, channel, channel_id, state, selected_employees, answers, current_employee_index, current_question_index, created_at)
       VALUES (?, ?, ?, 'welcome', '[]', '{}', 0, 0, ?)`
    ).run(id, channel, channelId, ts)
    return {
      id,
      channel,
      channelId,
      state: 'welcome',
      vertical: null,
      selectedEmployees: '[]',
      answers: '{}',
      currentEmployeeIndex: 0,
      currentQuestionIndex: 0,
      createdAt: ts,
      completedAt: null,
    }
  },

  get(id: string): OnboardingSessionRow | undefined {
    return db().prepare(
      `SELECT id, channel, channel_id as channelId, state, vertical,
       selected_employees as selectedEmployees, answers,
       current_employee_index as currentEmployeeIndex,
       current_question_index as currentQuestionIndex,
       created_at as createdAt, completed_at as completedAt
       FROM onboarding_sessions WHERE id = ?`
    ).get(id) as OnboardingSessionRow | undefined
  },

  getByChannel(channel: string, channelId: string): OnboardingSessionRow | undefined {
    return db().prepare(
      `SELECT id, channel, channel_id as channelId, state, vertical,
       selected_employees as selectedEmployees, answers,
       current_employee_index as currentEmployeeIndex,
       current_question_index as currentQuestionIndex,
       created_at as createdAt, completed_at as completedAt
       FROM onboarding_sessions WHERE channel = ? AND channel_id = ? AND completed_at IS NULL
       ORDER BY created_at DESC LIMIT 1`
    ).get(channel, channelId) as OnboardingSessionRow | undefined
  },

  update(id: string, updates: Partial<{
    state: string
    vertical: string | null
    selectedEmployees: string
    answers: string
    currentEmployeeIndex: number
    currentQuestionIndex: number
  }>): void {
    const fields: string[] = []
    const values: unknown[] = []

    if (updates.state !== undefined) {
      fields.push('state = ?')
      values.push(updates.state)
    }
    if (updates.vertical !== undefined) {
      fields.push('vertical = ?')
      values.push(updates.vertical)
    }
    if (updates.selectedEmployees !== undefined) {
      fields.push('selected_employees = ?')
      values.push(updates.selectedEmployees)
    }
    if (updates.answers !== undefined) {
      fields.push('answers = ?')
      values.push(updates.answers)
    }
    if (updates.currentEmployeeIndex !== undefined) {
      fields.push('current_employee_index = ?')
      values.push(updates.currentEmployeeIndex)
    }
    if (updates.currentQuestionIndex !== undefined) {
      fields.push('current_question_index = ?')
      values.push(updates.currentQuestionIndex)
    }

    if (fields.length === 0) return

    values.push(id)
    db().prepare(`UPDATE onboarding_sessions SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  },

  complete(id: string): void {
    db().prepare(
      `UPDATE onboarding_sessions SET state = 'complete', completed_at = ? WHERE id = ?`
    ).run(now(), id)
  },
}
