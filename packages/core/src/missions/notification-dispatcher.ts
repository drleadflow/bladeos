import { notifications } from '@blade/db'
import { logger } from '@blade/shared'

export interface MissionNotification {
  eventType: string
  missionId: string
  title: string
  summary: string
  priority: number
  assignedEmployee: string
  dashboardUrl: string
}

export interface DispatcherConfig {
  notifyTelegram: (message: string) => Promise<void>
  dashboardUrl: string
}

let dispatcherConfig: DispatcherConfig | null = null

export function initDispatcher(config: DispatcherConfig): void {
  dispatcherConfig = config
}

export async function dispatchMissionNotification(notification: MissionNotification): Promise<void> {
  const { eventType, missionId, title, summary, assignedEmployee, dashboardUrl } = notification

  const typeMap: Record<string, string> = {
    mission_started: 'info',
    mission_completed: 'info',
    mission_pending_review: 'mission_review',
    mission_failed: 'mission_failed',
    mission_awaiting_input: 'mission_input',
    mission_approved: 'info',
    mission_rejected: 'info',
  }

  notifications.create({
    title: `[${assignedEmployee}] ${eventType.replace('mission_', '').replace('_', ' ')}`,
    message: `${title}: ${summary}`,
    type: typeMap[eventType] ?? 'info',
    employeeSlug: assignedEmployee,
  })

  if (!dispatcherConfig) {
    logger.warn('notification-dispatcher', 'Dispatcher not initialized — skipping Telegram')
    return
  }

  let telegramMessage = ''

  switch (eventType) {
    case 'mission_started':
      telegramMessage = `[${assignedEmployee}] Starting: ${title}`
      break
    case 'mission_completed':
      telegramMessage = `[${assignedEmployee}] Done: ${title} — ${summary}`
      break
    case 'mission_pending_review':
      telegramMessage = [
        `[${assignedEmployee}] Completed: ${title}`,
        '',
        `Summary: ${summary}`,
        '',
        `Review: ${dashboardUrl}/missions`,
      ].join('\n')
      break
    case 'mission_failed':
      telegramMessage = `[${assignedEmployee}] Failed: ${title} — ${summary}`
      break
    case 'mission_awaiting_input':
      telegramMessage = `[${assignedEmployee}] Question on "${title}": ${summary}`
      break
    default:
      telegramMessage = `[${assignedEmployee}] ${eventType}: ${title}`
  }

  await dispatcherConfig.notifyTelegram(telegramMessage).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn('notification-dispatcher', `Telegram send failed: ${msg}`)
  })
}
