import crypto from 'node:crypto'
import { getEmployee } from './registry.js'
import { logger } from '@blade/shared'
import { handoffs as handoffRepo } from '@blade/db'

export interface HandoffRequest {
  id: string
  fromEmployee: string
  toEmployee: string
  reason: string
  context: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'pending' | 'accepted' | 'completed'
  createdAt: string
}

export function requestHandoff(handoff: Omit<HandoffRequest, 'id' | 'status' | 'createdAt'>): HandoffRequest {
  const fromEmployee = getEmployee(handoff.fromEmployee)
  if (!fromEmployee) {
    throw new Error(`Source employee "${handoff.fromEmployee}" not found`)
  }

  const toEmployee = getEmployee(handoff.toEmployee)
  if (!toEmployee) {
    throw new Error(`Target employee "${handoff.toEmployee}" not found`)
  }

  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()

  handoffRepo.create({
    id,
    fromEmployee: handoff.fromEmployee,
    toEmployee: handoff.toEmployee,
    reason: handoff.reason,
    context: handoff.context,
    priority: handoff.priority,
  })

  logger.info(
    'Collaboration',
    `Handoff from "${handoff.fromEmployee}" to "${handoff.toEmployee}": ${handoff.reason} [${handoff.priority}]`
  )

  return {
    ...handoff,
    id,
    status: 'pending',
    createdAt,
  }
}

export function getHandoffsForEmployee(employeeId: string): HandoffRequest[] {
  const rows = handoffRepo.listPendingForEmployee(employeeId)
  return rows.map(row => ({
    id: row.id,
    fromEmployee: row.fromEmployee,
    toEmployee: row.toEmployee,
    reason: row.reason,
    context: row.context,
    priority: row.priority as HandoffRequest['priority'],
    status: row.status as HandoffRequest['status'],
    createdAt: row.createdAt,
  }))
}

export function acceptHandoff(handoffId: string): void {
  handoffRepo.updateStatus(handoffId, 'accepted')
}

export function completeHandoff(handoffId: string): void {
  handoffRepo.updateStatus(handoffId, 'completed')
}

export function buildCollaborationContext(employeeId: string): string {
  const pendingHandoffs = getHandoffsForEmployee(employeeId)

  if (pendingHandoffs.length === 0) {
    return ''
  }

  const lines: string[] = [
    '--- Pending Handoffs ---',
    `You have ${pendingHandoffs.length} pending handoff(s) from other employees:`,
    '',
  ]

  for (const handoff of pendingHandoffs) {
    const from = getEmployee(handoff.fromEmployee)
    const fromName = from ? from.name : handoff.fromEmployee

    lines.push(`[${handoff.priority.toUpperCase()}] From ${fromName}:`)
    lines.push(`  Reason: ${handoff.reason}`)
    lines.push(`  Context: ${handoff.context}`)
    lines.push(`  Received: ${handoff.createdAt}`)
    lines.push('')
  }

  lines.push('Please address these handoffs as part of your response.')

  return lines.join('\n')
}

export function clearHandoffs(): void {
  handoffRepo.clear()
}
