import { activityEvents } from '@blade/db'
import { logger } from '@blade/shared'

export interface LogActivityParams {
  employeeSlug: string
  eventType: string
  summary: string
  targetType?: string
  targetId?: string
  detail?: Record<string, unknown>
  conversationId?: string
  jobId?: string
  costUsd?: number
}

/**
 * Log an employee activity to the Hive Mind.
 * Other employees will see this in their collaboration context.
 */
export function logEmployeeActivity(params: LogActivityParams): number {
  const eventId = activityEvents.emit({
    eventType: params.eventType,
    actorType: 'employee',
    actorId: params.employeeSlug,
    summary: params.summary,
    targetType: params.targetType,
    targetId: params.targetId,
    detail: params.detail,
    conversationId: params.conversationId,
    jobId: params.jobId,
    costUsd: params.costUsd,
  })

  logger.debug('HiveMind', `[${params.employeeSlug}] ${params.summary}`)
  return eventId
}

/**
 * Get recent team activity for a specific employee (excludes their own).
 */
export function getTeamActivity(
  currentEmployeeSlug: string,
  options?: { hoursBack?: number; limit?: number }
): Array<{ employeeSlug: string; summary: string; eventType: string; createdAt: string }> {
  const hoursBack = options?.hoursBack ?? 2
  const limit = options?.limit ?? 20
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString()

  const events = activityEvents.list({ since, limit })

  return events
    .filter(e => e.actorType === 'employee' && e.actorId !== currentEmployeeSlug)
    .map(e => ({
      employeeSlug: e.actorId,
      summary: e.summary,
      eventType: e.eventType,
      createdAt: e.createdAt,
    }))
}
