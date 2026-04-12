/**
 * Blade Super Agent — Drizzle ORM Schema (PostgreSQL)
 *
 * Generated from migrations 0001–0016.
 * FTS5 virtual tables, VIEWs, and schema_migrations are excluded.
 */

import {
  pgTable,
  text,
  integer,
  real,
  serial,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'

// ── 0001: Core ──────────────────────────────────────────────────

export const conversations = pgTable('conversations', {
  id: text('id').primaryKey(),
  title: text('title'),
  workspaceId: text('workspace_id'),
  createdAt: text('created_at').notNull().default(sql`now()`),
  updatedAt: text('updated_at').notNull().default(sql`now()`),
}, (table) => [
  index('idx_conversations_workspace').on(table.workspaceId),
])

export const messages = pgTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content').notNull(),
  model: text('model'),
  inputTokens: integer('input_tokens').default(0),
  outputTokens: integer('output_tokens').default(0),
  createdAt: text('created_at').notNull().default(sql`now()`),
}, (table) => [
  index('idx_messages_conv').on(table.conversationId),
  index('idx_messages_conversation_created').on(table.conversationId, table.createdAt),
])

export const toolCalls = pgTable('tool_calls', {
  id: text('id').primaryKey(),
  messageId: text('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  conversationId: text('conversation_id').notNull(),
  toolName: text('tool_name').notNull(),
  inputJson: text('input_json').notNull(),
  success: integer('success').notNull().default(0),
  resultJson: text('result_json'),
  display: text('display'),
  durationMs: integer('duration_ms').default(0),
  createdAt: text('created_at').notNull().default(sql`now()`),
}, (table) => [
  index('idx_tool_calls_conv').on(table.conversationId),
  index('idx_tool_calls_name').on(table.toolName),
])

export const jobs = pgTable('jobs', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  status: text('status').notNull().default('queued'),
  repoUrl: text('repo_url').notNull(),
  branch: text('branch').notNull(),
  baseBranch: text('base_branch').notNull().default('main'),
  containerName: text('container_name'),
  prUrl: text('pr_url'),
  prNumber: integer('pr_number'),
  agentModel: text('agent_model').notNull().default('claude-sonnet-4-20250514'),
  totalCostUsd: real('total_cost_usd').default(0),
  totalToolCalls: integer('total_tool_calls').default(0),
  totalIterations: integer('total_iterations').default(0),
  error: text('error'),
  workspaceId: text('workspace_id'),
  createdAt: text('created_at').notNull().default(sql`now()`),
  updatedAt: text('updated_at').notNull().default(sql`now()`),
  completedAt: text('completed_at'),
}, (table) => [
  index('idx_jobs_status').on(table.status),
  index('idx_jobs_status_created').on(table.status, table.createdAt),
  index('idx_jobs_workspace').on(table.workspaceId),
])

export const jobLogs = pgTable('job_logs', {
  id: serial('id').primaryKey(),
  jobId: text('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  level: text('level').notNull().default('info'),
  message: text('message').notNull(),
  dataJson: text('data_json'),
  createdAt: text('created_at').notNull().default(sql`now()`),
}, (table) => [
  index('idx_job_logs_job').on(table.jobId),
])

export const memories = pgTable('memories', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  content: text('content').notNull(),
  tagsJson: text('tags_json').notNull().default('[]'),
  source: text('source').notNull(),
  confidence: real('confidence').notNull().default(0.5),
  accessCount: integer('access_count').notNull().default(0),
  lastAccessedAt: text('last_accessed_at'),
  workspaceId: text('workspace_id'),
  createdAt: text('created_at').notNull().default(sql`now()`),
  updatedAt: text('updated_at').notNull().default(sql`now()`),
}, (table) => [
  index('idx_memories_type').on(table.type),
  index('idx_memories_source').on(table.source),
  index('idx_memories_workspace').on(table.workspaceId),
])

export const skills = pgTable('skills', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description').notNull(),
  version: integer('version').notNull().default(1),
  systemPrompt: text('system_prompt').notNull(),
  toolsJson: text('tools_json').notNull().default('[]'),
  examplesJson: text('examples_json').notNull().default('[]'),
  successRate: real('success_rate').notNull().default(0.5),
  totalUses: integer('total_uses').notNull().default(0),
  source: text('source').notNull().default('builtin'),
  workspaceId: text('workspace_id'),
  createdAt: text('created_at').notNull().default(sql`now()`),
  updatedAt: text('updated_at').notNull().default(sql`now()`),
}, (table) => [
  index('idx_skills_usage').on(table.totalUses, table.successRate),
  index('idx_skills_workspace').on(table.workspaceId),
])

export const costEntries = pgTable('cost_entries', {
  id: serial('id').primaryKey(),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').notNull(),
  outputTokens: integer('output_tokens').notNull(),
  inputCostUsd: real('input_cost_usd').notNull(),
  outputCostUsd: real('output_cost_usd').notNull(),
  totalCostUsd: real('total_cost_usd').notNull(),
  jobId: text('job_id').references(() => jobs.id),
  conversationId: text('conversation_id').references(() => conversations.id),
  createdAt: text('created_at').notNull().default(sql`now()`),
}, (table) => [
  index('idx_cost_job').on(table.jobId),
  index('idx_cost_conv').on(table.conversationId),
  index('idx_cost_date').on(table.createdAt),
  index('idx_cost_entries_model').on(table.model),
])

export const employees = pgTable('employees', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  title: text('title').notNull(),
  pillar: text('pillar').notNull(),
  description: text('description').notNull(),
  icon: text('icon').notNull().default(''),
  active: integer('active').notNull().default(0),
  archetype: text('archetype'),
  onboardingAnswersJson: text('onboarding_answers_json').notNull().default('{}'),
  // Added in 0007
  department: text('department').default('general'),
  objective: text('objective'),
  managerId: text('manager_id'),
  allowedToolsJson: text('allowed_tools_json').default('[]'),
  blockedToolsJson: text('blocked_tools_json').default('[]'),
  modelPreference: text('model_preference').default('standard'),
  maxBudgetPerRun: real('max_budget_per_run').default(1.0),
  maxConcurrentRuns: integer('max_concurrent_runs').default(1),
  escalationPolicyJson: text('escalation_policy_json'),
  handoffRulesJson: text('handoff_rules_json').default('[]'),
  memoryScope: text('memory_scope').default('own'),
  outputChannelsJson: text('output_channels_json').default('["web"]'),
  status: text('status').default('active'),
  totalRuns: integer('total_runs').default(0),
  totalCostUsd: real('total_cost_usd').default(0),
  successRate: real('success_rate').default(0),
  createdAt: text('created_at').notNull().default(sql`now()`),
  updatedAt: text('updated_at').notNull().default(sql`now()`),
}, (table) => [
  index('idx_employees_active').on(table.active),
  index('idx_employees_pillar').on(table.pillar),
])

export const notifications = pgTable('notifications', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  type: text('type').notNull().default('info'),
  read: integer('read').notNull().default(0),
  employeeSlug: text('employee_slug'),
  workspaceId: text('workspace_id'),
  createdAt: text('created_at').notNull().default(sql`now()`),
}, (table) => [
  index('idx_notifications_read').on(table.read),
  index('idx_notifications_workspace').on(table.workspaceId),
])

// ── 0002: Employee System ───────────────────────────────────────

export const activeEmployees = pgTable('active_employees', {
  employeeId: text('employee_id').primaryKey(),
  activatedAt: text('activated_at').notNull().default(sql`now()`),
  archetype: text('archetype').notNull(),
  onboardingComplete: integer('onboarding_complete').notNull().default(0),
}, (table) => [
  index('idx_active_employees_employee_id').on(table.employeeId),
])

export const scorecardEntries = pgTable('scorecard_entries', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').notNull(),
  metricId: text('metric_id').notNull(),
  value: real('value').notNull(),
  status: text('status').notNull(),
  recordedAt: text('recorded_at').notNull().default(sql`now()`),
}, (table) => [
  index('idx_scorecard_employee').on(table.employeeId),
  index('idx_scorecard_metric').on(table.employeeId, table.metricId),
  index('idx_scorecard_employee_recorded').on(table.employeeId, table.recordedAt),
])

export const improvementQueue = pgTable('improvement_queue', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  description: text('description').notNull(),
  status: text('status').notNull().default('pending'),
  createdAt: text('created_at').notNull().default(sql`now()`),
  updatedAt: text('updated_at'),
}, (table) => [
  index('idx_improvement_status').on(table.status),
])

// ── 0003: Documents ─────────────────────────────────────────────

export const documents = pgTable('documents', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  source: text('source').notNull(),
  createdAt: text('created_at').notNull().default(sql`now()`),
})

export const documentChunks = pgTable('document_chunks', {
  id: text('id').primaryKey(),
  documentId: text('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  chunkIndex: integer('chunk_index').notNull().default(0),
}, (table) => [
  index('idx_document_chunks_document_id').on(table.documentId),
])

// ── 0004: Gamification ──────────────────────────────────────────

export const xpEvents = pgTable('xp_events', {
  id: text('id').primaryKey(),
  action: text('action').notNull(),
  xp: integer('xp').notNull(),
  employeeId: text('employee_id'),
  createdAt: text('created_at').notNull().default(sql`now()`),
}, (table) => [
  index('idx_xp_events_action').on(table.action),
  index('idx_xp_events_date').on(table.createdAt),
])

export const streaks = pgTable('streaks', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  currentStreak: integer('current_streak').notNull().default(0),
  longestStreak: integer('longest_streak').notNull().default(0),
  lastCheckedIn: text('last_checked_in').notNull(),
  employeeId: text('employee_id').notNull(),
}, (table) => [
  index('idx_streaks_employee').on(table.employeeId),
])

export const achievements = pgTable('achievements', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  unlockedAt: text('unlocked_at'),
})

export const userProfile = pgTable('user_profile', {
  id: text('id').primaryKey().default('default'),
  totalXp: integer('total_xp').notNull().default(0),
  level: integer('level').notNull().default(1),
  createdAt: text('created_at').notNull().default(sql`now()`),
})

// ── 0005: Evolution ─────────────────────────────────────────────

export const evolutionEvents = pgTable('evolution_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  description: text('description').notNull(),
  beforeValue: text('before_value'),
  afterValue: text('after_value'),
  impact: text('impact'),
  createdAt: text('created_at').notNull().default(sql`now()`),
}, (table) => [
  index('idx_evolution_type').on(table.type),
  index('idx_evolution_date').on(table.createdAt),
])

// ── 0006: Workflow Runs ─────────────────────────────────────────

export const workflowRuns = pgTable('workflow_runs', {
  id: text('id').primaryKey(),
  workflowId: text('workflow_id').notNull(),
  status: text('status').notNull().default('running'),
  stepResultsJson: text('step_results_json').notNull().default('{}'),
  totalCost: real('total_cost').notNull().default(0),
  startedAt: text('started_at').notNull().default(sql`now()`),
  completedAt: text('completed_at'),
}, (table) => [
  index('idx_workflow_runs_status').on(table.status),
])

export const handoffs = pgTable('handoffs', {
  id: text('id').primaryKey(),
  fromEmployee: text('from_employee').notNull(),
  toEmployee: text('to_employee').notNull(),
  reason: text('reason').notNull(),
  context: text('context').notNull(),
  priority: text('priority').notNull().default('medium'),
  status: text('status').notNull().default('pending'),
  createdAt: text('created_at').notNull().default(sql`now()`),
  completedAt: text('completed_at'),
}, (table) => [
  index('idx_handoffs_to').on(table.toEmployee, table.status),
  index('idx_handoffs_status').on(table.status),
])

export const dailyPriorities = pgTable('daily_priorities', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  emoji: text('emoji').default('⚡'),
  urgency: text('urgency').default('normal'),
  completed: integer('completed').notNull().default(0),
  date: text('date').notNull().default(sql`CURRENT_DATE`),
  createdAt: text('created_at').notNull().default(sql`now()`),
}, (table) => [
  index('idx_priorities_date').on(table.date),
])

// ── 0007: Control Plane ─────────────────────────────────────────

export const activityEvents = pgTable('activity_events', {
  id: serial('id').primaryKey(),
  eventType: text('event_type').notNull(),
  actorType: text('actor_type').notNull(),
  actorId: text('actor_id').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  summary: text('summary').notNull(),
  detailJson: text('detail_json'),
  conversationId: text('conversation_id'),
  jobId: text('job_id'),
  costUsd: real('cost_usd').default(0),
  createdAt: text('created_at').notNull().default(sql`now()`),
}, (table) => [
  index('idx_activity_type').on(table.eventType),
  index('idx_activity_actor').on(table.actorId),
  index('idx_activity_target').on(table.targetType, table.targetId),
  index('idx_activity_created').on(table.createdAt),
])

export const approvals = pgTable('approvals', {
  id: text('id').primaryKey(),
  requestedBy: text('requested_by').notNull(),
  action: text('action').notNull(),
  toolName: text('tool_name'),
  toolInputJson: text('tool_input_json'),
  context: text('context'),
  priority: text('priority').default('medium'),
  status: text('status').notNull().default('pending'),
  decidedBy: text('decided_by'),
  decidedAt: text('decided_at'),
  expiresAt: text('expires_at'),
  createdAt: text('created_at').notNull().default(sql`now()`),
}, (table) => [
  index('idx_approvals_status').on(table.status),
  index('idx_approvals_status_priority').on(table.status, table.priority, table.createdAt),
])

export const monitors = pgTable('monitors', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  employeeId: text('employee_id'),
  sourceType: text('source_type').notNull(),
  sourceConfigJson: text('source_config_json').notNull(),
  checkSchedule: text('check_schedule').notNull(),
  thresholdsJson: text('thresholds_json'),
  lastCheckedAt: text('last_checked_at'),
  lastValue: text('last_value'),
  lastStatus: text('last_status').default('unknown'),
  enabled: integer('enabled').notNull().default(1),
  createdAt: text('created_at').notNull().default(sql`now()`),
}, (table) => [
  index('idx_monitors_enabled').on(table.enabled),
])

export const monitorAlerts = pgTable('monitor_alerts', {
  id: serial('id').primaryKey(),
  monitorId: text('monitor_id').notNull().references(() => monitors.id),
  severity: text('severity').notNull(),
  message: text('message').notNull(),
  value: text('value'),
  acknowledged: integer('acknowledged').notNull().default(0),
  acknowledgedBy: text('acknowledged_by'),
  createdAt: text('created_at').notNull().default(sql`now()`),
}, (table) => [
  index('idx_alerts_monitor').on(table.monitorId),
  index('idx_alerts_severity').on(table.severity, table.acknowledged),
])

export const kpiDefinitions = pgTable('kpi_definitions', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  sourceJson: text('source_json').notNull(),
  target: real('target').notNull(),
  unit: text('unit').notNull().default('count'),
  frequency: text('frequency').notNull().default('weekly'),
  direction: text('direction').notNull().default('higher_is_better'),
  thresholdsJson: text('thresholds_json').notNull(),
  createdAt: text('created_at').notNull().default(sql`now()`),
}, (table) => [
  index('idx_kpi_employee').on(table.employeeId),
])

export const kpiMeasurements = pgTable('kpi_measurements', {
  id: serial('id').primaryKey(),
  kpiId: text('kpi_id').notNull().references(() => kpiDefinitions.id),
  employeeId: text('employee_id').notNull(),
  value: real('value').notNull(),
  status: text('status').notNull().default('green'),
  measuredAt: text('measured_at').notNull().default(sql`now()`),
  source: text('source'),
}, (table) => [
  index('idx_kpi_meas_kpi').on(table.kpiId),
  index('idx_kpi_meas_employee').on(table.employeeId),
  index('idx_kpi_meas_time').on(table.measuredAt),
])

export const routines = pgTable('routines', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  schedule: text('schedule').notNull(),
  task: text('task').notNull(),
  toolsJson: text('tools_json').default('[]'),
  outputChannel: text('output_channel').default('web'),
  timeoutSeconds: integer('timeout_seconds').default(300),
  enabled: integer('enabled').notNull().default(1),
  lastRunAt: text('last_run_at'),
  nextRunAt: text('next_run_at'),
  runCount: integer('run_count').notNull().default(0),
  lastStatus: text('last_status'),
  createdAt: text('created_at').notNull().default(sql`now()`),
}, (table) => [
  index('idx_routines_employee').on(table.employeeId),
  index('idx_routines_next').on(table.nextRunAt),
])

// ── 0008: Worker Sessions ───────────────────────────────────────

export const workerSessions = pgTable('worker_sessions', {
  id: text('id').primaryKey(),
  jobId: text('job_id').unique().references(() => jobs.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  workerType: text('worker_type').notNull().default('claude_code'),
  runtime: text('runtime').notNull().default('pending'),
  status: text('status').notNull().default('queued'),
  repoUrl: text('repo_url'),
  branch: text('branch'),
  containerName: text('container_name'),
  conversationId: text('conversation_id'),
  entrypoint: text('entrypoint'),
  latestSummary: text('latest_summary'),
  metadataJson: text('metadata_json').default('{}'),
  lastSeenAt: text('last_seen_at'),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  createdAt: text('created_at').notNull().default(sql`now()`),
  updatedAt: text('updated_at').notNull().default(sql`now()`),
}, (table) => [
  index('idx_worker_sessions_status').on(table.status),
  index('idx_worker_sessions_runtime').on(table.runtime),
  index('idx_worker_sessions_updated').on(table.updatedAt),
  index('idx_worker_sessions_job_id').on(table.jobId),
])

// ── 0009: Channel Links ─────────────────────────────────────────

export const channelLinks = pgTable('channel_links', {
  conversationId: text('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  channel: text('channel').notNull(),
  channelId: text('channel_id').notNull(),
  metadataJson: text('metadata_json').default('{}'),
  linkedAt: text('linked_at').notNull().default(sql`now()`),
}, (table) => [
  primaryKey({ columns: [table.channel, table.channelId] }),
  index('idx_channel_links_conversation').on(table.conversationId),
  index('idx_channel_links_channel').on(table.channel, table.channelId),
])

// ── 0010: Job Evaluations ───────────────────────────────────────

export const jobEvals = pgTable('job_evals', {
  id: serial('id').primaryKey(),
  jobId: text('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),

  // Outcome
  status: text('status').notNull().default('pending'),
  testsPassed: integer('tests_passed').default(0),
  testsFailed: integer('tests_failed').default(0),
  testsSkipped: integer('tests_skipped').default(0),
  fixCyclesUsed: integer('fix_cycles_used').default(0),
  maxFixCycles: integer('max_fix_cycles').default(3),

  // Quality signals
  lintErrors: integer('lint_errors').default(0),
  typeErrors: integer('type_errors').default(0),
  filesChanged: integer('files_changed').default(0),
  linesAdded: integer('lines_added').default(0),
  linesRemoved: integer('lines_removed').default(0),

  // Performance
  totalCostUsd: real('total_cost_usd').default(0),
  totalInputTokens: integer('total_input_tokens').default(0),
  totalOutputTokens: integer('total_output_tokens').default(0),
  totalToolCalls: integer('total_tool_calls').default(0),
  totalIterations: integer('total_iterations').default(0),
  durationMs: integer('duration_ms').default(0),
  codingDurationMs: integer('coding_duration_ms').default(0),
  testingDurationMs: integer('testing_duration_ms').default(0),

  // Context
  language: text('language'),
  repoUrl: text('repo_url'),
  agentModel: text('agent_model'),
  stopReason: text('stop_reason'),

  // PR outcome
  prMerged: integer('pr_merged').default(0),
  prReviewComments: integer('pr_review_comments').default(0),
  prTimeToMergeMs: integer('pr_time_to_merge_ms'),

  // Structured details
  detailsJson: text('details_json'),

  evaluatedAt: text('evaluated_at').notNull().default(sql`now()`),
  createdAt: text('created_at').notNull().default(sql`now()`),
}, (table) => [
  index('idx_job_evals_job').on(table.jobId),
  index('idx_job_evals_status').on(table.status),
  index('idx_job_evals_language').on(table.language),
  index('idx_job_evals_model').on(table.agentModel),
  index('idx_job_evals_evaluated').on(table.evaluatedAt),
])

// ── 0011: Client Accounts ───────────────────────────────────────

export const clientAccounts = pgTable('client_accounts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  status: text('status').notNull().default('active'),

  // Contact
  contactName: text('contact_name'),
  contactEmail: text('contact_email'),
  slackChannelId: text('slack_channel_id'),
  slackChannelName: text('slack_channel_name'),

  // Service context
  serviceType: text('service_type').notNull().default('ads'),
  industry: text('industry'),
  monthlyRetainerUsd: real('monthly_retainer_usd').default(0),

  // Platform credentials (encrypted JSON)
  platformsJson: text('platforms_json').notNull().default('{}'),

  // KPI targets
  kpiTargetsJson: text('kpi_targets_json').notNull().default('[]'),

  // Health tracking
  healthScore: integer('health_score').default(0),
  healthStatus: text('health_status').default('unknown'),
  lastHealthCheckAt: text('last_health_check_at'),
  lastReportAt: text('last_report_at'),
  lastAlertAt: text('last_alert_at'),

  // Notes
  notes: text('notes'),

  createdAt: text('created_at').notNull().default(sql`now()`),
  updatedAt: text('updated_at').notNull().default(sql`now()`),
}, (table) => [
  index('idx_client_accounts_status').on(table.status),
  index('idx_client_accounts_slug').on(table.slug),
  index('idx_client_accounts_health').on(table.healthStatus),
])

export const clientHealthSnapshots = pgTable('client_health_snapshots', {
  id: serial('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => clientAccounts.id, { onDelete: 'cascade' }),
  healthScore: integer('health_score').notNull(),
  healthStatus: text('health_status').notNull(),
  metricsJson: text('metrics_json').notNull().default('{}'),
  alertsJson: text('alerts_json'),
  checkedAt: text('checked_at').notNull().default(sql`now()`),
}, (table) => [
  index('idx_client_health_client').on(table.clientId),
  index('idx_client_health_checked').on(table.checkedAt),
])

export const csmEvals = pgTable('csm_evals', {
  id: serial('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => clientAccounts.id, { onDelete: 'cascade' }),
  evalDate: text('eval_date').notNull(),
  healthCheckRan: integer('health_check_ran').default(0),
  declineDetected: integer('decline_detected').default(0),
  declineDetectionLatencyHours: real('decline_detection_latency_hours'),
  alertDelivered: integer('alert_delivered').default(0),
  reportGenerated: integer('report_generated').default(0),
  costUsd: real('cost_usd').default(0),
  detailsJson: text('details_json'),
  createdAt: text('created_at').notNull().default(sql`now()`),
}, (table) => [
  index('idx_csm_evals_client').on(table.clientId),
  index('idx_csm_evals_date').on(table.evalDate),
])

// ── 0012: Workspaces ────────────────────────────────────────────

export const workspaces = pgTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  repoUrl: text('repo_url').notNull(),
  branch: text('branch').notNull().default('main'),
  localPath: text('local_path').notNull(),
  status: text('status').notNull().default('cloning'),
  ownerChatId: text('owner_chat_id'),

  // Tracking
  lastCommand: text('last_command'),
  lastCommandAt: text('last_command_at'),
  totalCommands: integer('total_commands').default(0),
  totalCommits: integer('total_commits').default(0),
  totalPrs: integer('total_prs').default(0),

  error: text('error'),
  createdAt: text('created_at').notNull().default(sql`now()`),
  updatedAt: text('updated_at').notNull().default(sql`now()`),
}, (table) => [
  index('idx_workspaces_owner').on(table.ownerChatId),
  index('idx_workspaces_status').on(table.status),
  index('idx_workspaces_repo').on(table.repoUrl),
])

export const activeWorkspaces = pgTable('active_workspaces', {
  chatId: text('chat_id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  activatedAt: text('activated_at').notNull().default(sql`now()`),
})

// ── 0013: Lead Tracking ─────────────────────────────────────────

export const leadEvents = pgTable('lead_events', {
  id: serial('id').primaryKey(),
  accountId: text('account_id').notNull(),
  accountName: text('account_name'),
  contactId: text('contact_id').notNull(),
  eventType: text('event_type').notNull(),
  channel: text('channel'),
  direction: text('direction'),
  handler: text('handler'),
  messageBody: text('message_body'),
  source: text('source'),
  metadataJson: text('metadata_json'),
  createdAt: text('created_at').notNull().default(sql`now()`),
}, (table) => [
  index('idx_lead_events_account').on(table.accountId),
  index('idx_lead_events_contact').on(table.contactId),
  index('idx_lead_events_type').on(table.eventType),
  index('idx_lead_events_created').on(table.createdAt),
  index('idx_lead_events_direction').on(table.direction),
])

export const leadEngagement = pgTable('lead_engagement', {
  id: serial('id').primaryKey(),
  accountId: text('account_id').notNull(),
  contactId: text('contact_id').notNull(),
  contactName: text('contact_name'),
  firstOutboundAt: text('first_outbound_at'),
  firstOutboundBody: text('first_outbound_body'),
  firstOutboundSource: text('first_outbound_source'),
  firstInboundAt: text('first_inbound_at'),
  repliedToIntro: integer('replied_to_intro').default(0),
  repliedToFollowup: integer('replied_to_followup').default(0),
  isResponded: integer('is_responded').default(0),
  isBooked: integer('is_booked').default(0),
  isDead: integer('is_dead').default(0),
  totalInbound: integer('total_inbound').default(0),
  totalOutbound: integer('total_outbound').default(0),
  engagementStatus: text('engagement_status').default('new'),
  workflowName: text('workflow_name'),
  updatedAt: text('updated_at').notNull().default(sql`now()`),
}, (table) => [
  uniqueIndex('idx_lead_engagement_unique').on(table.accountId, table.contactId),
  index('idx_lead_engagement_account').on(table.accountId),
  index('idx_lead_engagement_status').on(table.engagementStatus),
  index('idx_lead_engagement_responded').on(table.isResponded),
])

// ── 0015: Auth ──────────────────────────────────────────────────

export const authUser = pgTable('auth_user', {
  id: text('id').notNull().primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  role: text('role').notNull().default('user'),
  createdAt: text('created_at').notNull().default(sql`now()`),
  updatedAt: text('updated_at').notNull().default(sql`now()`),
}, (table) => [
  index('idx_auth_user_email').on(table.email),
])

export const authSession = pgTable('auth_session', {
  id: text('id').notNull().primaryKey(),
  expiresAt: integer('expires_at').notNull(),
  userId: text('user_id').notNull().references(() => authUser.id, { onDelete: 'cascade' }),
  activeWorkspaceId: text('active_workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
}, (table) => [
  index('idx_auth_session_user').on(table.userId),
])

export const authPassword = pgTable('auth_password', {
  userId: text('user_id').primaryKey().references(() => authUser.id, { onDelete: 'cascade' }),
  hashedPassword: text('hashed_password').notNull(),
  createdAt: text('created_at').notNull().default(sql`now()`),
  updatedAt: text('updated_at').notNull().default(sql`now()`),
})

export const userWorkspace = pgTable('user_workspace', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => authUser.id, { onDelete: 'cascade' }),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('member'),
  createdAt: text('created_at').notNull().default(sql`now()`),
}, (table) => [
  uniqueIndex('idx_user_workspace_unique').on(table.userId, table.workspaceId),
  index('idx_user_workspace_user').on(table.userId),
  index('idx_user_workspace_workspace').on(table.workspaceId),
])

// ── 0016: Content Studio ────────────────────────────────────────

export const contentProjects = pgTable('content_projects', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  status: text('status').notNull().default('draft'),
  videoCount: integer('video_count').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`now()`),
  updatedAt: text('updated_at').notNull().default(sql`now()`),
})

export const contentItems = pgTable('content_items', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => contentProjects.id),
  title: text('title'),
  status: text('status').notNull().default('uploaded'),
  videoUrl: text('video_url'),
  videoKey: text('video_key'),
  thumbnailUrl: text('thumbnail_url'),
  durationSeconds: real('duration_seconds'),
  fileSizeBytes: integer('file_size_bytes'),
  transcript: text('transcript'),
  transcriptSegments: text('transcript_segments'),
  createdAt: text('created_at').notNull().default(sql`now()`),
  updatedAt: text('updated_at').notNull().default(sql`now()`),
}, (table) => [
  index('idx_content_items_project').on(table.projectId),
])

export const contentCaptions = pgTable('content_captions', {
  id: text('id').primaryKey(),
  itemId: text('item_id').notNull().references(() => contentItems.id),
  platform: text('platform').notNull(),
  caption: text('caption').notNull(),
  hashtags: text('hashtags'),
  status: text('status').notNull().default('draft'),
  publishedAt: text('published_at'),
  publishedUrl: text('published_url'),
  createdAt: text('created_at').notNull().default(sql`now()`),
}, (table) => [
  index('idx_content_captions_item').on(table.itemId),
])

export const contentSchedule = pgTable('content_schedule', {
  id: text('id').primaryKey(),
  itemId: text('item_id').notNull().references(() => contentItems.id),
  captionId: text('caption_id').references(() => contentCaptions.id),
  platform: text('platform').notNull(),
  scheduledAt: text('scheduled_at').notNull(),
  status: text('status').notNull().default('pending'),
  error: text('error'),
  publishedUrl: text('published_url'),
  createdAt: text('created_at').notNull().default(sql`now()`),
}, (table) => [
  index('idx_content_schedule_status').on(table.status, table.scheduledAt),
])

// ── Relations ───────────────────────────────────────────────────

export const conversationsRelations = relations(conversations, ({ many }) => ({
  messages: many(messages),
  toolCalls: many(toolCalls),
  costEntries: many(costEntries),
  channelLinks: many(channelLinks),
}))

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, { fields: [messages.conversationId], references: [conversations.id] }),
  toolCalls: many(toolCalls),
}))

export const toolCallsRelations = relations(toolCalls, ({ one }) => ({
  message: one(messages, { fields: [toolCalls.messageId], references: [messages.id] }),
}))

export const jobsRelations = relations(jobs, ({ many }) => ({
  logs: many(jobLogs),
  evals: many(jobEvals),
  workerSessions: many(workerSessions),
}))

export const jobLogsRelations = relations(jobLogs, ({ one }) => ({
  job: one(jobs, { fields: [jobLogs.jobId], references: [jobs.id] }),
}))

export const jobEvalsRelations = relations(jobEvals, ({ one }) => ({
  job: one(jobs, { fields: [jobEvals.jobId], references: [jobs.id] }),
}))

export const workerSessionsRelations = relations(workerSessions, ({ one }) => ({
  job: one(jobs, { fields: [workerSessions.jobId], references: [jobs.id] }),
}))

export const costEntriesRelations = relations(costEntries, ({ one }) => ({
  job: one(jobs, { fields: [costEntries.jobId], references: [jobs.id] }),
  conversation: one(conversations, { fields: [costEntries.conversationId], references: [conversations.id] }),
}))

export const channelLinksRelations = relations(channelLinks, ({ one }) => ({
  conversation: one(conversations, { fields: [channelLinks.conversationId], references: [conversations.id] }),
}))

export const documentsRelations = relations(documents, ({ many }) => ({
  chunks: many(documentChunks),
}))

export const documentChunksRelations = relations(documentChunks, ({ one }) => ({
  document: one(documents, { fields: [documentChunks.documentId], references: [documents.id] }),
}))

export const monitorsRelations = relations(monitors, ({ many }) => ({
  alerts: many(monitorAlerts),
}))

export const monitorAlertsRelations = relations(monitorAlerts, ({ one }) => ({
  monitor: one(monitors, { fields: [monitorAlerts.monitorId], references: [monitors.id] }),
}))

export const kpiDefinitionsRelations = relations(kpiDefinitions, ({ many }) => ({
  measurements: many(kpiMeasurements),
}))

export const kpiMeasurementsRelations = relations(kpiMeasurements, ({ one }) => ({
  definition: one(kpiDefinitions, { fields: [kpiMeasurements.kpiId], references: [kpiDefinitions.id] }),
}))

export const clientAccountsRelations = relations(clientAccounts, ({ many }) => ({
  healthSnapshots: many(clientHealthSnapshots),
  csmEvals: many(csmEvals),
}))

export const clientHealthSnapshotsRelations = relations(clientHealthSnapshots, ({ one }) => ({
  client: one(clientAccounts, { fields: [clientHealthSnapshots.clientId], references: [clientAccounts.id] }),
}))

export const csmEvalsRelations = relations(csmEvals, ({ one }) => ({
  client: one(clientAccounts, { fields: [csmEvals.clientId], references: [clientAccounts.id] }),
}))

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  activeWorkspaces: many(activeWorkspaces),
  userWorkspaces: many(userWorkspace),
  sessions: many(authSession),
}))

export const activeWorkspacesRelations = relations(activeWorkspaces, ({ one }) => ({
  workspace: one(workspaces, { fields: [activeWorkspaces.workspaceId], references: [workspaces.id] }),
}))

export const authUserRelations = relations(authUser, ({ one, many }) => ({
  password: one(authPassword),
  sessions: many(authSession),
  workspaces: many(userWorkspace),
}))

export const authSessionRelations = relations(authSession, ({ one }) => ({
  user: one(authUser, { fields: [authSession.userId], references: [authUser.id] }),
  workspace: one(workspaces, { fields: [authSession.activeWorkspaceId], references: [workspaces.id] }),
}))

export const authPasswordRelations = relations(authPassword, ({ one }) => ({
  user: one(authUser, { fields: [authPassword.userId], references: [authUser.id] }),
}))

export const userWorkspaceRelations = relations(userWorkspace, ({ one }) => ({
  user: one(authUser, { fields: [userWorkspace.userId], references: [authUser.id] }),
  workspace: one(workspaces, { fields: [userWorkspace.workspaceId], references: [workspaces.id] }),
}))

export const contentProjectsRelations = relations(contentProjects, ({ many }) => ({
  items: many(contentItems),
}))

export const contentItemsRelations = relations(contentItems, ({ one, many }) => ({
  project: one(contentProjects, { fields: [contentItems.projectId], references: [contentProjects.id] }),
  captions: many(contentCaptions),
  schedules: many(contentSchedule),
}))

export const contentCaptionsRelations = relations(contentCaptions, ({ one }) => ({
  item: one(contentItems, { fields: [contentCaptions.itemId], references: [contentItems.id] }),
}))

export const contentScheduleRelations = relations(contentSchedule, ({ one }) => ({
  item: one(contentItems, { fields: [contentSchedule.itemId], references: [contentItems.id] }),
  caption: one(contentCaptions, { fields: [contentSchedule.captionId], references: [contentCaptions.id] }),
}))
