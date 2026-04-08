import { registerTool } from '../tool-registry.js'
import { requestHandoff } from '../employees/collaboration.js'
import type { ToolCallResult, ExecutionContext } from '../types.js'

function makeResult(
  toolName: string,
  input: Record<string, unknown>,
  success: boolean,
  data: unknown,
  display: string
): ToolCallResult {
  return {
    toolUseId: '',
    toolName,
    input,
    success,
    data,
    display,
    durationMs: 0,
    timestamp: new Date().toISOString(),
  }
}

registerTool(
  {
    name: 'handoff_to_employee',
    description:
      'Hand off a task or alert to another AI employee. Use when you detect something outside your expertise.',
    input_schema: {
      type: 'object',
      properties: {
        employee: {
          type: 'string',
          description:
            'Target employee id (e.g. "closer", "support-rep", "wellness-coach")',
        },
        reason: {
          type: 'string',
          description: 'Why you are handing off',
        },
        context: {
          type: 'string',
          description: 'Relevant context for the receiving employee',
        },
        priority: {
          type: 'string',
          description: 'Priority level',
          enum: ['low', 'medium', 'high', 'urgent'],
        },
      },
      required: ['employee', 'reason', 'context'],
    },
    category: 'system',
  },
  async (
    input: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<ToolCallResult> => {
    const employee = input.employee as string
    const reason = input.reason as string
    const handoffContext = input.context as string
    const priority = (input.priority as string) ?? 'medium'

    try {
      const handoff = requestHandoff({
        fromEmployee: context.userId,
        toEmployee: employee,
        reason,
        context: handoffContext,
        priority: priority as 'low' | 'medium' | 'high' | 'urgent',
      })

      return makeResult(
        'handoff_to_employee',
        input,
        true,
        { handoffId: handoff.id, status: handoff.status },
        `Handoff created to "${employee}" [${priority}]: ${reason}`
      )
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return makeResult(
        'handoff_to_employee',
        input,
        false,
        null,
        `Handoff failed: ${message}`
      )
    }
  }
)
