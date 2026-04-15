import { registerTool } from '../tool-registry.js'
import type { ToolCallResult, ExecutionContext } from '../types.js'
import { logger } from '@blade/shared'

// ============================================================
// CREATE MISSION
// ============================================================

registerTool(
  {
    name: 'create_mission',
    description: 'Create a new mission (task) and optionally assign it to the best agent. Use when the user wants to delegate work to a specific agent or when a task should be tracked in the mission queue.',
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Short title for the mission (e.g. "Create thumbnail for YouTube video")',
        },
        description: {
          type: 'string',
          description: 'Detailed description of what needs to be done',
        },
        priority: {
          type: 'string',
          description: 'Priority level',
          enum: ['critical', 'high', 'medium', 'low'],
        },
        auto_assign: {
          type: 'string',
          description: 'Set to "true" to auto-assign to the best agent',
          enum: ['true', 'false'],
        },
      },
      required: ['title'],
    },
    category: 'mission',
  },
  async (input: Record<string, unknown>, _context: ExecutionContext): Promise<ToolCallResult> => {
    const { missions } = await import('@blade/db')
    const { autoAssignMission } = await import('../missions/mission-router.js')

    const title = input.title as string
    const description = input.description as string | undefined
    const priority = input.priority as string | undefined
    const shouldAutoAssign = input.auto_assign === 'true'

    const mission = missions.create({
      title,
      description,
      priority,
      createdBy: 'agent',
    })

    let assignedTo: string | undefined
    if (shouldAutoAssign) {
      try {
        assignedTo = await autoAssignMission(mission.id)
      } catch (err) {
        logger.warn('MissionTools', `Auto-assign failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    const display = assignedTo
      ? `Created mission "${title}" and auto-assigned to ${assignedTo}`
      : `Created mission "${title}" (queued, not yet assigned)`

    return {
      toolUseId: '',
      toolName: 'create_mission',
      input,
      success: true,
      data: { id: mission.id, assignedTo },
      display,
      durationMs: 0,
      timestamp: new Date().toISOString(),
    }
  }
)

// ============================================================
// COMPLETE MISSION
// ============================================================

registerTool(
  {
    name: 'complete_mission',
    description: 'Mark a mission as completed with a result summary. Use when you have finished the work assigned by a mission.',
    input_schema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The mission ID to complete',
        },
        result: {
          type: 'string',
          description: 'The result or deliverable of the completed mission',
        },
        summary: {
          type: 'string',
          description: 'A brief one-line summary of what was accomplished',
        },
      },
      required: ['id', 'result'],
    },
    category: 'mission',
  },
  async (input: Record<string, unknown>, _context: ExecutionContext): Promise<ToolCallResult> => {
    const { missions, activityEvents } = await import('@blade/db')

    const id = input.id as string
    const result = input.result as string
    const summary = input.summary as string | undefined

    missions.complete(id, result, summary)
    const mission = missions.get(id)

    if (mission) {
      activityEvents.emit({
        eventType: 'mission_done',
        actorType: 'employee',
        actorId: mission.assignedEmployee ?? 'unknown',
        summary: `Completed: ${mission.title}`,
        targetType: 'mission',
        targetId: id,
        detail: { resultSummary: summary ?? result.slice(0, 100) },
      })
    }

    return {
      toolUseId: '',
      toolName: 'complete_mission',
      input,
      success: true,
      data: { id, status: 'done' },
      display: `Mission completed: "${mission?.title ?? id}"`,
      durationMs: 0,
      timestamp: new Date().toISOString(),
    }
  }
)

// ============================================================
// QUERY HIVE MIND
// ============================================================

registerTool(
  {
    name: 'query_hive_mind',
    description: 'Query the hive mind — see what other agents have been doing. Returns recent activity across all agents including completed missions, tool calls, and conversations. Use when you need context about team activity or what other agents have accomplished.',
    input_schema: {
      type: 'object',
      properties: {
        agent: {
          type: 'string',
          description: 'Filter to a specific agent slug (e.g. "sdr", "growth-lead"). Omit to see all agents.',
        },
        event_type: {
          type: 'string',
          description: 'Filter by event type (e.g. "mission_done", "conversation_reply", "tool_call")',
        },
        limit: {
          type: 'string',
          description: 'Number of events to return (default: 20)',
        },
      },
      required: [],
    },
    category: 'mission',
  },
  async (input: Record<string, unknown>, _context: ExecutionContext): Promise<ToolCallResult> => {
    const { activityEvents } = await import('@blade/db')

    const agent = input.agent as string | undefined
    const eventType = input.event_type as string | undefined
    const limit = parseInt(input.limit as string ?? '20', 10)

    const events = activityEvents.list({
      actorId: agent,
      eventType,
      limit,
    })

    const display = events.length > 0
      ? `Hive mind — ${events.length} recent events:\n${(events as { actorId: string; eventType: string; summary: string; createdAt: string }[]).map((e, i) =>
          `${i + 1}. [${e.actorId}] ${e.eventType}: ${e.summary} (${e.createdAt})`
        ).join('\n')}`
      : 'No recent activity in the hive mind.'

    return {
      toolUseId: '',
      toolName: 'query_hive_mind',
      input,
      success: true,
      data: events,
      display,
      durationMs: 0,
      timestamp: new Date().toISOString(),
    }
  }
)

// ============================================================
// LIST MISSIONS
// ============================================================

registerTool(
  {
    name: 'list_missions',
    description: 'List missions in the task queue. Shows all active, queued, and recent missions with their status and assigned agent.',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filter by status',
          enum: ['queued', 'live', 'done', 'failed'],
        },
      },
      required: [],
    },
    category: 'mission',
  },
  async (input: Record<string, unknown>, _context: ExecutionContext): Promise<ToolCallResult> => {
    const { missions } = await import('@blade/db')

    const status = input.status as string | undefined
    const list = missions.list({ status, limit: 20 })

    const display = list.length > 0
      ? `${list.length} missions:\n${list.map((m, i) =>
          `${i + 1}. [${m.status}] ${m.title} → ${m.assignedEmployee ?? 'unassigned'} (${m.priority})`
        ).join('\n')}`
      : `No missions${status ? ` with status "${status}"` : ''}.`

    return {
      toolUseId: '',
      toolName: 'list_missions',
      input,
      success: true,
      data: list,
      display,
      durationMs: 0,
      timestamp: new Date().toISOString(),
    }
  }
)
