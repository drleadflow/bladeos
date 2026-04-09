import { runAgentLoop } from '../agent-loop.js'
import { getAllToolDefinitions } from '../tool-registry.js'
import { getEmployee } from '../employees/registry.js'
import { logger } from '@blade/shared'
import { initializeDb, workflowRuns } from '@blade/db'
import type { AgentMessage, ExecutionContext } from '../types.js'

export interface WorkflowStep {
  id: string
  employeeId: string
  task: string
  dependsOn?: string[]
  condition?: string
}

export interface Workflow {
  id: string
  name: string
  description: string
  trigger: 'manual' | 'webhook' | 'cron' | 'employee_handoff'
  steps: WorkflowStep[]
}

export interface StepResult {
  stepId: string
  status: 'completed' | 'failed' | 'skipped'
  output: string
  cost: number
  durationMs: number
}

export interface WorkflowRun {
  id: string
  workflowId: string
  status: 'running' | 'completed' | 'failed' | 'paused'
  stepResults: Record<string, StepResult>
  startedAt: string
  completedAt?: string
  totalCost: number
}

const _workflows: Map<string, Workflow> = new Map()

export function defineWorkflow(workflow: Workflow): void {
  _workflows.set(workflow.id, workflow)
}

export function listWorkflows(): Workflow[] {
  return [..._workflows.values()]
}

export function getWorkflowRun(runId: string): WorkflowRun | undefined {
  initializeDb()
  const row = workflowRuns.get(runId)
  if (!row) return undefined
  return {
    id: row.id,
    workflowId: row.workflowId,
    status: row.status as WorkflowRun['status'],
    stepResults: JSON.parse(row.stepResultsJson),
    startedAt: row.startedAt,
    completedAt: row.completedAt ?? undefined,
    totalCost: row.totalCost,
  }
}

function getReadySteps(workflow: Workflow, completedSteps: Set<string>): WorkflowStep[] {
  return workflow.steps.filter(step => {
    if (completedSteps.has(step.id)) return false
    if (!step.dependsOn || step.dependsOn.length === 0) return true
    return step.dependsOn.every(dep => completedSteps.has(dep))
  })
}

function buildStepContext(step: WorkflowStep, previousResults: Record<string, StepResult>): string {
  const deps = step.dependsOn ?? []
  if (deps.length === 0) return ''

  const context = deps
    .filter(depId => previousResults[depId])
    .map(depId => `[${depId}]: ${previousResults[depId].output.slice(0, 500)}`)
    .join('\n\n')

  return context ? `\n\nContext from previous steps:\n${context}` : ''
}

export async function runWorkflow(
  workflowId: string,
  input?: Record<string, unknown>
): Promise<WorkflowRun> {
  const workflow = _workflows.get(workflowId)
  if (!workflow) throw new Error(`Workflow "${workflowId}" not found`)

  initializeDb()
  const runId = crypto.randomUUID()
  const run: WorkflowRun = {
    id: runId,
    workflowId,
    status: 'running',
    stepResults: {},
    startedAt: new Date().toISOString(),
    totalCost: 0,
  }
  workflowRuns.create({ id: runId, workflowId })

  logger.info('Workflow', `Starting workflow "${workflow.name}" (run: ${runId})`)

  // Validate all dependency references before executing
  const allStepIds = new Set(workflow.steps.map(s => s.id))
  for (const step of workflow.steps) {
    for (const dep of step.dependsOn ?? []) {
      if (!allStepIds.has(dep)) {
        throw new Error(`Step "${step.id}" depends on non-existent step "${dep}"`)
      }
    }
  }

  // Detect cycles via DFS before executing
  const visited = new Set<string>()
  const visiting = new Set<string>()
  function hasCycle(stepId: string): boolean {
    if (visiting.has(stepId)) return true
    if (visited.has(stepId)) return false
    visiting.add(stepId)
    const step = workflow!.steps.find(s => s.id === stepId)
    for (const dep of step?.dependsOn ?? []) {
      if (hasCycle(dep)) return true
    }
    visiting.delete(stepId)
    visited.add(stepId)
    return false
  }
  for (const step of workflow.steps) {
    if (hasCycle(step.id)) {
      throw new Error(`Circular dependency detected involving step "${step.id}"`)
    }
  }

  const completedSteps = new Set<string>()
  const failedSteps = new Set<string>()
  const MAX_WORKFLOW_ITERATIONS = workflow.steps.length * 3
  let loopCount = 0

  while (true) {
    if (++loopCount > MAX_WORKFLOW_ITERATIONS) {
      throw new Error(`Workflow exceeded maximum iterations (${MAX_WORKFLOW_ITERATIONS}). Possible deadlock.`)
    }
    const readySteps = getReadySteps(workflow, new Set([...completedSteps, ...failedSteps]))
    if (readySteps.length === 0) break

    // Run ready steps in parallel
    const results = await Promise.allSettled(
      readySteps.map(async (step) => {
        const employee = getEmployee(step.employeeId)
        const archetype = 'operator' // default
        const systemPrompt = employee
          ? (employee.systemPrompt[archetype] ?? employee.systemPrompt.coach)
          : 'You are a helpful AI assistant.'

        const previousContext = buildStepContext(step, run.stepResults)
        const inputContext = input ? `\n\nWorkflow input: ${JSON.stringify(input)}` : ''
        const fullTask = `${step.task}${previousContext}${inputContext}`

        if (step.condition) {
          // Simple condition check — if condition mentions a previous step's output
          const conditionMet = evaluateCondition(step.condition, run.stepResults)
          if (!conditionMet) {
            return { stepId: step.id, status: 'skipped' as const, output: `Condition not met: ${step.condition}`, cost: 0, durationMs: 0 }
          }
        }

        const STEP_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes per step
        const start = performance.now()
        const context: ExecutionContext = {
          conversationId: `workflow-${runId}-${step.id}`,
          userId: 'workflow',
          modelId: 'claude-sonnet-4-20250514',
          maxIterations: 15,
          costBudget: 2.0,
        }

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Step "${step.id}" timed out after ${STEP_TIMEOUT_MS / 1000}s`)),
            STEP_TIMEOUT_MS
          )
        )

        const result = await Promise.race([
          runAgentLoop({
            systemPrompt,
            messages: [{ role: 'user', content: fullTask }] as AgentMessage[],
            tools: getAllToolDefinitions(),
            context,
          }),
          timeoutPromise,
        ])

        return {
          stepId: step.id,
          status: 'completed' as const,
          output: result.finalResponse,
          cost: result.totalCost,
          durationMs: Math.round(performance.now() - start),
        }
      })
    )

    for (const settled of results) {
      if (settled.status === 'fulfilled') {
        const result = settled.value as StepResult
        run.stepResults[result.stepId] = result
        run.totalCost += result.cost

        if (result.status === 'completed' || result.status === 'skipped') {
          completedSteps.add(result.stepId)
        } else {
          failedSteps.add(result.stepId)
        }
      } else {
        // Promise rejected — mark step as failed
        const step = readySteps.find(s => !run.stepResults[s.id])
        if (step) {
          run.stepResults[step.id] = {
            stepId: step.id,
            status: 'failed',
            output: settled.reason instanceof Error ? settled.reason.message : String(settled.reason),
            cost: 0,
            durationMs: 0,
          }
          failedSteps.add(step.id)
        }
      }
    }

    // Persist intermediate progress to DB
    workflowRuns.update(runId, {
      stepResultsJson: JSON.stringify(run.stepResults),
      totalCost: run.totalCost,
    })

    // Check if all steps are done
    if (completedSteps.size + failedSteps.size >= workflow.steps.length) break
  }

  run.status = failedSteps.size > 0 ? 'failed' : 'completed'
  run.completedAt = new Date().toISOString()

  // Persist final state to DB
  workflowRuns.update(runId, {
    status: run.status,
    stepResultsJson: JSON.stringify(run.stepResults),
    totalCost: run.totalCost,
    completedAt: run.completedAt,
  })

  logger.info('Workflow', `Workflow "${workflow.name}" ${run.status} — $${run.totalCost.toFixed(4)}`)

  return run
}

function evaluateCondition(condition: string, results: Record<string, StepResult>): boolean {
  // Simple condition evaluation
  const lower = condition.toLowerCase()

  // Check "only if step X completed"
  const stepMatch = lower.match(/only if (\w+) completed/)
  if (stepMatch && results[stepMatch[1]]?.status !== 'completed') return false

  // Check "if lead score > N" — look in previous results for score mentions
  const scoreMatch = lower.match(/score\s*>\s*(\d+)/)
  if (scoreMatch) {
    const threshold = parseInt(scoreMatch[1], 10)
    const allOutputs = Object.values(results).map(r => r.output).join(' ')
    const foundScore = allOutputs.match(/score[:\s]*(\d+)/i)
    if (foundScore && parseInt(foundScore[1], 10) <= threshold) return false
  }

  return true
}
