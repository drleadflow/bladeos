import { approvals, activityEvents } from '@blade/db'
import { logger } from '@blade/shared'

// ============================================================
// APPROVAL GATES — Controls which tool calls need human approval
// ============================================================

/** Tools that write to external systems — always require approval */
const ALWAYS_APPROVE: ReadonlySet<string> = new Set([
  'deploy_vercel',
  'github_create_issue',
  'github_close_issue',
  'github_comment_issue',
  'slack_send_message',
])

/** Tools that may be destructive — require approval based on input */
const CONDITIONAL_APPROVE: ReadonlySet<string> = new Set([
  'run_command',
])

/** Read-only tools — never require approval */
const NEVER_APPROVE: ReadonlySet<string> = new Set([
  'read_file',
  'write_file',
  'list_files',
  'search_code',
  'search_web',
  'recall_memory',
  'save_memory',
  'github_list_issues',
  'github_read_issue',
  'slack_list_channels',
  'slack_read_messages',
  'review_pull_request',
])

/** Dangerous shell patterns that escalate run_command to approval */
const DANGEROUS_SHELL_PATTERNS = [
  /\brm\s+-r/i,
  /\bgit\s+push/i,
  /\bgit\s+reset/i,
  /\bcurl\b.*\|\s*sh/i,
  /\bwget\b.*\|\s*sh/i,
  /\bnpm\s+publish/i,
  /\bdocker\s+push/i,
  /\bkubectl\s+(delete|apply)/i,
]

function determinePriority(toolName: string, input: Record<string, unknown>): 'urgent' | 'high' | 'medium' | 'low' {
  if (toolName === 'deploy_vercel') return 'urgent'
  if (toolName === 'github_close_issue') return 'high'
  if (ALWAYS_APPROVE.has(toolName)) return 'high'
  if (toolName === 'run_command') return 'medium'
  return 'low'
}

/**
 * Check if a tool call requires human approval before execution.
 * Returns false for read-only/safe tools, true for external writes.
 */
export function requiresApproval(
  toolName: string,
  input: Record<string, unknown>,
): boolean {
  // Explicit bypass
  if (NEVER_APPROVE.has(toolName)) return false

  // Always-approve tools
  if (ALWAYS_APPROVE.has(toolName)) return true

  // Conditional: shell commands with dangerous patterns
  if (CONDITIONAL_APPROVE.has(toolName)) {
    const command = String(input.command ?? '')
    return DANGEROUS_SHELL_PATTERNS.some(pattern => pattern.test(command))
  }

  // Unknown tools — don't block by default (fail open for new tools)
  return false
}

/**
 * Request approval for a tool call. Creates a pending approval record
 * and emits an activity event. Returns the approval ID.
 */
export function requestApproval(params: {
  toolName: string
  toolInput: Record<string, unknown>
  userId: string
  conversationId: string
}): string {
  const { id } = approvals.create({
    requestedBy: params.userId,
    action: 'tool_execution',
    toolName: params.toolName,
    toolInput: params.toolInput,
    context: `Conversation: ${params.conversationId}`,
    priority: determinePriority(params.toolName, params.toolInput),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(), // 1 hour
  })

  activityEvents.emit({
    eventType: 'approval.requested',
    actorType: 'agent',
    actorId: params.userId,
    summary: `Approval needed: ${params.toolName}`,
    targetType: 'approval',
    targetId: id,
    detail: {
      toolName: params.toolName,
      toolInput: params.toolInput,
      priority: determinePriority(params.toolName, params.toolInput),
    },
    conversationId: params.conversationId,
  })

  logger.info('ApprovalChecker', `Approval requested for "${params.toolName}" → ${id}`)
  return id
}

/**
 * Poll for approval decision. Returns true if approved, false if rejected or timed out.
 * Polls every 2 seconds up to the timeout.
 */
export async function waitForApproval(
  approvalId: string,
  timeoutMs: number = 300_000, // 5 minutes default
): Promise<{ approved: boolean; decidedBy?: string }> {
  const pollIntervalMs = 2_000
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const record = approvals.get(approvalId)
    if (!record) {
      return { approved: false }
    }

    if (record.status === 'approved') {
      logger.info('ApprovalChecker', `Approval ${approvalId} approved by ${record.decidedBy}`)
      return { approved: true, decidedBy: record.decidedBy ?? undefined }
    }

    if (record.status === 'rejected') {
      logger.info('ApprovalChecker', `Approval ${approvalId} rejected by ${record.decidedBy}`)
      return { approved: false, decidedBy: record.decidedBy ?? undefined }
    }

    // Check if expired
    if (record.expiresAt && new Date(record.expiresAt).getTime() < Date.now()) {
      approvals.decide(approvalId, 'rejected', 'system-timeout')
      logger.info('ApprovalChecker', `Approval ${approvalId} expired`)
      return { approved: false, decidedBy: 'system-timeout' }
    }

    await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
  }

  // Timeout
  approvals.decide(approvalId, 'rejected', 'system-timeout')
  logger.info('ApprovalChecker', `Approval ${approvalId} timed out after ${timeoutMs}ms`)
  return { approved: false, decidedBy: 'system-timeout' }
}
