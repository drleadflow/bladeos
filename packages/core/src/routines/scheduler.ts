/**
 * RoutineScheduler — Runs employee routines on their cron schedules.
 *
 * Architecture:
 * - On start, loads all enabled routines from DB
 * - Creates a cron job for each routine
 * - When triggered, runs the routine's task through the agent loop
 *   with the employee's allowed tools and personality
 * - Records results in activity timeline
 * - Updates routine run count and status
 */

import cron, { type ScheduledTask } from 'node-cron'
import { routines, activityEvents, employees as employeesRepo } from '@blade/db'
import { runAgentLoop } from '../agent-loop.js'
import { getEmployee } from '../employees/registry.js'
import { loadPersonality } from '../personality.js'
import {
  getAllToolDefinitions,
  createFilteredScope,
  getScopedToolDefinitions,
  destroyToolScope,
} from '../tool-registry.js'
import { resolveModelConfig } from '../model-provider.js'
import { logger } from '@blade/shared'
import { getNextRun, isValidCron } from './cron-utils.js'

interface ScheduledRoutine {
  task: ScheduledTask
  routineId: string
  routineName: string
}

export interface RoutineExecutor {
  replySync(request: {
    message: string
    channel: 'routine'
    userId: string
    employeeId?: string
    systemPromptOverride?: string
    maxIterations?: number
    costBudget?: number
  }): Promise<{
    conversationId: string
    responseText: string
    cost: number
    toolCalls: number
  }>
}

export class RoutineScheduler {
  private readonly _jobs: Map<string, ScheduledRoutine> = new Map()
  private readonly _executor: RoutineExecutor | null

  constructor(executor?: RoutineExecutor) {
    this._executor = executor ?? null
  }

  /**
   * Load all enabled routines from the database and create cron jobs for each.
   */
  start(): void {
    const enabled = routines.listEnabled()

    for (const routine of enabled) {
      this._scheduleRoutine(routine)
    }

    logger.info('RoutineScheduler', `Started with ${this._jobs.size} routine(s)`)
  }

  /**
   * Stop all active cron jobs and clear the internal map.
   */
  stop(): void {
    for (const [id, scheduled] of this._jobs) {
      scheduled.task.stop()
      logger.info('RoutineScheduler', `Stopped routine: ${scheduled.routineName} (${id})`)
    }
    this._jobs.clear()
  }

  /**
   * Manually trigger a specific routine by ID (ignores cron schedule).
   */
  async runRoutine(routineId: string): Promise<void> {
    await this._executeRoutine(routineId)
  }

  /**
   * Return the count of currently scheduled cron jobs.
   */
  getScheduledCount(): number {
    return this._jobs.size
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _scheduleRoutine(routine: {
    id: string
    employeeId: string
    name: string
    schedule: string
    task: string
    toolsJson: string
    timeoutSeconds: number
    nextRunAt: string | null
  }): void {
    if (!isValidCron(routine.schedule)) {
      logger.error(
        'RoutineScheduler',
        `Invalid cron expression for routine ${routine.id}: ${routine.schedule}`,
      )
      return
    }

    const scheduledTask = cron.schedule(routine.schedule, () => {
      void this._executeRoutine(routine.id)
    })

    this._jobs.set(routine.id, {
      task: scheduledTask,
      routineId: routine.id,
      routineName: routine.name,
    })

    logger.info(
      'RoutineScheduler',
      `Scheduled routine: ${routine.name} (${routine.id}) [${routine.schedule}]`,
    )
  }

  private async _executeRoutine(routineId: string): Promise<void> {
    const startTime = Date.now()
    let toolScopeId: string | undefined

    try {
      // 1. Get the routine from DB (fresh read to capture any changes)
      const allEnabled = routines.listEnabled()
      const routine = allEnabled.find(r => r.id === routineId)
      if (!routine) {
        logger.warn('RoutineScheduler', `Routine ${routineId} not found or disabled — skipping`)
        return
      }

      logger.info('RoutineScheduler', `Executing routine: ${routine.name} (${routineId})`)

      // 2. Get the employee definition (try in-memory registry first, then DB)
      const employeeDef = getEmployee(routine.employeeId)
      const employeeDb = employeesRepo.get(routine.employeeId)
      const employeeName = employeeDef?.name ?? employeeDb?.name ?? routine.employeeId

      // 3. Build system prompt: personality + routine task description
      const personality = employeeDef?.systemPrompt?.operator ?? loadPersonality()
      const systemPrompt = [
        personality,
        '',
        `## Current Routine: ${routine.name}`,
        '',
        `You are executing a scheduled routine. Complete the following task:`,
        routine.task,
      ].join('\n')

      // 4. Get tool definitions — use employee's allowed tools if specified
      let allowedTools: string[] = []
      try {
        const parsed: unknown = JSON.parse(routine.toolsJson)
        if (Array.isArray(parsed)) {
          allowedTools = parsed.filter((t): t is string => typeof t === 'string')
        }
      } catch {
        // invalid JSON — use all tools
      }

      let tools
      if (allowedTools.length > 0) {
        toolScopeId = createFilteredScope(allowedTools)
        tools = getScopedToolDefinitions(toolScopeId)
      } else if (employeeDef && employeeDef.tools.length > 0) {
        toolScopeId = createFilteredScope(employeeDef.tools)
        tools = getScopedToolDefinitions(toolScopeId)
      } else {
        tools = getAllToolDefinitions()
      }

      // 5. Create execution context
      const conversationId = `routine-${routineId}-${Date.now()}`
      const modelConfig = resolveModelConfig()
      const maxIterations = Math.min(
        Math.ceil(routine.timeoutSeconds / 30),
        25,
      )

      // 6. Run through ConversationEngine if available, otherwise fall back to agent loop
      if (this._executor) {
        const engineResult = await this._executor.replySync({
          message: routine.task,
          channel: 'routine',
          userId: 'routine-scheduler',
          employeeId: routine.employeeId,
          systemPromptOverride: systemPrompt,
          maxIterations,
          costBudget: 0,
        })

        const status = 'success'
        const nextRunAt = getNextRun(routine.schedule)
        routines.recordRun(routineId, status, nextRunAt)

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
        logger.info(
          'RoutineScheduler',
          `Routine completed: ${routine.name} (${routineId}) — ${status} in ${elapsed}s`,
        )

        activityEvents.emit({
          eventType: 'routine_run',
          actorType: 'employee',
          actorId: routine.employeeId,
          summary: `Routine "${routine.name}" ${status} (${elapsed}s, ${engineResult.toolCalls} tool calls)`,
          targetType: 'routine',
          targetId: routineId,
          conversationId: engineResult.conversationId,
          detail: {
            routineName: routine.name,
            status,
            elapsedSeconds: Number(elapsed),
            toolCalls: engineResult.toolCalls,
            stopReason: 'end_turn',
            totalCost: engineResult.cost,
          },
          costUsd: engineResult.cost,
        })
        return
      }

      const result = await runAgentLoop({
        systemPrompt,
        messages: [{ role: 'user', content: routine.task }],
        tools,
        context: {
          conversationId,
          userId: 'routine-scheduler',
          modelId: modelConfig.modelId,
          modelConfig,
          maxIterations,
          costBudget: 0,
          toolScopeId,
        },
      })

      // 7. Record run — success
      const status = result.stopReason === 'error' ? 'failed' : 'success'
      const nextRunAt = getNextRun(routine.schedule)
      routines.recordRun(routineId, status, nextRunAt)

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      logger.info(
        'RoutineScheduler',
        `Routine completed: ${routine.name} (${routineId}) — ${status} in ${elapsed}s`,
      )

      // 8. Emit activity event
      activityEvents.emit({
        eventType: 'routine_run',
        actorType: 'employee',
        actorId: routine.employeeId,
        summary: `Routine "${routine.name}" ${status} (${elapsed}s, ${result.totalToolCalls} tool calls)`,
        targetType: 'routine',
        targetId: routineId,
        conversationId,
        detail: {
          routineName: routine.name,
          status,
          elapsedSeconds: Number(elapsed),
          toolCalls: result.totalToolCalls,
          stopReason: result.stopReason,
          totalCost: result.totalCost,
        },
        costUsd: result.totalCost,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      logger.error('RoutineScheduler', `Routine failed: ${routineId} — ${message}`)

      // Record failure so the scheduler keeps going
      try {
        const allEnabled = routines.listEnabled()
        const routine = allEnabled.find(r => r.id === routineId)
        if (routine) {
          const nextRunAt = getNextRun(routine.schedule)
          routines.recordRun(routineId, 'failed', nextRunAt)

          activityEvents.emit({
            eventType: 'routine_run',
            actorType: 'employee',
            actorId: routine.employeeId,
            summary: `Routine "${routine.name}" failed: ${message}`,
            targetType: 'routine',
            targetId: routineId,
            detail: { error: message },
          })
        }
      } catch (innerError: unknown) {
        const innerMsg = innerError instanceof Error ? innerError.message : 'Unknown error'
        logger.error('RoutineScheduler', `Failed to record routine failure: ${innerMsg}`)
      }
    } finally {
      // 9. Clean up tool scope if created
      if (toolScopeId) {
        destroyToolScope(toolScopeId)
      }
    }
  }
}
