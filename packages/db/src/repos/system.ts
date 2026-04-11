import { db, uuid, now } from './helpers.js'

// ============================================================
// COST ENTRIES
// ============================================================

export const costEntries = {
  record(params: { model: string; inputTokens: number; outputTokens: number; inputCostUsd: number; outputCostUsd: number; totalCostUsd: number; jobId?: string; conversationId?: string }): void {
    db().prepare(
      'INSERT INTO cost_entries (model, input_tokens, output_tokens, input_cost_usd, output_cost_usd, total_cost_usd, job_id, conversation_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(params.model, params.inputTokens, params.outputTokens, params.inputCostUsd, params.outputCostUsd, params.totalCostUsd, params.jobId ?? null, params.conversationId ?? null, now())
  },

  summary(days = 30) {
    const since = new Date(Date.now() - days * 86400000).toISOString()
    const rows = db().prepare(
      `SELECT model, SUM(input_tokens) as inputTokens, SUM(output_tokens) as outputTokens,
       SUM(total_cost_usd) as totalUsd, DATE(created_at) as day
       FROM cost_entries WHERE created_at >= ? GROUP BY model, day ORDER BY day DESC`
    ).all(since) as { model: string; inputTokens: number; outputTokens: number; totalUsd: number; day: string }[]

    const byModel: Record<string, number> = {}
    const byDay: Record<string, number> = {}
    let totalUsd = 0
    let totalInput = 0
    let totalOutput = 0

    for (const row of rows) {
      byModel[row.model] = (byModel[row.model] ?? 0) + row.totalUsd
      byDay[row.day] = (byDay[row.day] ?? 0) + row.totalUsd
      totalUsd += row.totalUsd
      totalInput += row.inputTokens
      totalOutput += row.outputTokens
    }

    return { totalUsd, byModel, byDay, tokenCount: { input: totalInput, output: totalOutput } }
  },
}

// ============================================================
// NOTIFICATIONS
// ============================================================

export const notifications = {
  create(params: { title: string; message: string; type?: string; employeeSlug?: string }): { id: string } {
    const id = uuid()
    db().prepare(
      'INSERT INTO notifications (id, title, message, type, employee_slug, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, params.title, params.message, params.type ?? 'info', params.employeeSlug ?? null, now())
    return { id }
  },

  list(limit = 50) {
    return db().prepare(
      `SELECT id, title, message, type, read, employee_slug as employeeSlug, created_at as createdAt
       FROM notifications ORDER BY created_at DESC LIMIT ?`
    ).all(limit) as { id: string; title: string; message: string; type: string; read: number; employeeSlug: string | null; createdAt: string }[]
  },

  markRead(id: string): void {
    db().prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(id)
  },

  markAllRead(): void {
    db().prepare('UPDATE notifications SET read = 1 WHERE read = 0').run()
  },

  unreadCount(): number {
    const row = db().prepare('SELECT COUNT(*) as count FROM notifications WHERE read = 0').get() as { count: number }
    return row.count
  },
}

// ============================================================
// ACTIVITY EVENTS (v2 control plane)
// ============================================================

export const activityEvents = {
  emit(params: {
    eventType: string
    actorType: string
    actorId: string
    summary: string
    targetType?: string
    targetId?: string
    detail?: unknown
    conversationId?: string
    jobId?: string
    costUsd?: number
  }): number {
    const result = db().prepare(
      `INSERT INTO activity_events (event_type, actor_type, actor_id, target_type, target_id, summary, detail_json, conversation_id, job_id, cost_usd, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      params.eventType, params.actorType, params.actorId,
      params.targetType ?? null, params.targetId ?? null,
      params.summary, params.detail ? JSON.stringify(params.detail) : null,
      params.conversationId ?? null, params.jobId ?? null,
      params.costUsd ?? 0, now()
    )
    return Number(result.lastInsertRowid)
  },

  list(params: { limit?: number; offset?: number; eventType?: string; actorId?: string; targetType?: string; targetId?: string; since?: string } = {}) {
    const { limit = 50, offset = 0, eventType, actorId, targetType, targetId, since } = params
    const where: string[] = []
    const values: unknown[] = []

    if (eventType) { where.push('event_type = ?'); values.push(eventType) }
    if (actorId) { where.push('actor_id = ?'); values.push(actorId) }
    if (targetType) { where.push('target_type = ?'); values.push(targetType) }
    if (targetId) { where.push('target_id = ?'); values.push(targetId) }
    if (since) { where.push('created_at >= ?'); values.push(since) }

    const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
    values.push(limit, offset)

    return db().prepare(
      `SELECT id, event_type as eventType, actor_type as actorType, actor_id as actorId,
       target_type as targetType, target_id as targetId, summary, detail_json as detailJson,
       conversation_id as conversationId, job_id as jobId, cost_usd as costUsd,
       created_at as createdAt
       FROM activity_events ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...values) as {
      id: number; eventType: string; actorType: string; actorId: string
      targetType: string | null; targetId: string | null; summary: string
      detailJson: string | null; conversationId: string | null; jobId: string | null
      costUsd: number; createdAt: string
    }[]
  },

  countSince(since: string): number {
    const row = db().prepare('SELECT COUNT(*) as count FROM activity_events WHERE created_at >= ?').get(since) as { count: number }
    return row.count
  },
}

// ============================================================
// APPROVALS (v2 control plane)
// ============================================================

export const approvals = {
  create(params: {
    requestedBy: string
    action: string
    toolName?: string
    toolInput?: unknown
    context?: string
    priority?: string
    expiresAt?: string
  }): { id: string } {
    const id = uuid()
    db().prepare(
      `INSERT INTO approvals (id, requested_by, action, tool_name, tool_input_json, context, priority, status, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
    ).run(id, params.requestedBy, params.action, params.toolName ?? null,
      params.toolInput ? JSON.stringify(params.toolInput) : null,
      params.context ?? null, params.priority ?? 'medium', params.expiresAt ?? null, now())
    return { id }
  },

  get(id: string) {
    return db().prepare(
      `SELECT id, requested_by as requestedBy, action, tool_name as toolName,
       tool_input_json as toolInputJson, context, priority, status,
       decided_by as decidedBy, decided_at as decidedAt, expires_at as expiresAt,
       created_at as createdAt
       FROM approvals WHERE id = ?`
    ).get(id) as {
      id: string; requestedBy: string; action: string; toolName: string | null
      toolInputJson: string | null; context: string | null; priority: string; status: string
      decidedBy: string | null; decidedAt: string | null; expiresAt: string | null; createdAt: string
    } | undefined
  },

  listPending(limit = 50) {
    return db().prepare(
      `SELECT id, requested_by as requestedBy, action, tool_name as toolName, context, priority, status,
       expires_at as expiresAt, created_at as createdAt
       FROM approvals WHERE status = 'pending' ORDER BY
       CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       created_at ASC LIMIT ?`
    ).all(limit) as {
      id: string; requestedBy: string; action: string; toolName: string | null
      context: string | null; priority: string; status: string
      expiresAt: string | null; createdAt: string
    }[]
  },

  decide(id: string, status: 'approved' | 'rejected', decidedBy: string): void {
    db().prepare(
      'UPDATE approvals SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?'
    ).run(status, decidedBy, now(), id)
  },

  countPending(): number {
    const row = db().prepare("SELECT COUNT(*) as count FROM approvals WHERE status = 'pending'").get() as { count: number }
    return row.count
  },

  listByEmployee(employeeSlug: string, limit = 20) {
    return db().prepare(
      `SELECT id, requested_by as requestedBy, action, tool_name as toolName, context, priority, status,
       decided_by as decidedBy, decided_at as decidedAt, expires_at as expiresAt, created_at as createdAt
       FROM approvals WHERE requested_by = ? ORDER BY
       CASE status WHEN 'pending' THEN 0 ELSE 1 END,
       CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       created_at DESC LIMIT ?`
    ).all(employeeSlug, limit) as {
      id: string; requestedBy: string; action: string; toolName: string | null
      context: string | null; priority: string; status: string
      decidedBy: string | null; decidedAt: string | null
      expiresAt: string | null; createdAt: string
    }[]
  },
}

// ============================================================
// MONITORS (v2 control plane)
// ============================================================

export const monitors = {
  create(params: {
    name: string
    description?: string
    employeeId?: string
    sourceType: string
    sourceConfig: unknown
    checkSchedule: string
    thresholds?: unknown
  }): { id: string } {
    const id = uuid()
    db().prepare(
      `INSERT INTO monitors (id, name, description, employee_id, source_type, source_config_json, check_schedule, thresholds_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, params.name, params.description ?? null, params.employeeId ?? null,
      params.sourceType, JSON.stringify(params.sourceConfig), params.checkSchedule,
      params.thresholds ? JSON.stringify(params.thresholds) : null, now())
    return { id }
  },

  get(id: string) {
    return db().prepare(
      `SELECT id, name, description, employee_id as employeeId, source_type as sourceType,
       source_config_json as sourceConfigJson, check_schedule as checkSchedule,
       thresholds_json as thresholdsJson, last_checked_at as lastCheckedAt,
       last_value as lastValue, last_status as lastStatus, enabled,
       created_at as createdAt
       FROM monitors WHERE id = ?`
    ).get(id) as {
      id: string; name: string; description: string | null; employeeId: string | null
      sourceType: string; sourceConfigJson: string; checkSchedule: string
      thresholdsJson: string | null; lastCheckedAt: string | null
      lastValue: string | null; lastStatus: string; enabled: number; createdAt: string
    } | undefined
  },

  list() {
    return db().prepare(
      `SELECT id, name, description, employee_id as employeeId, source_type as sourceType,
       last_status as lastStatus, last_checked_at as lastCheckedAt, enabled,
       created_at as createdAt
       FROM monitors ORDER BY name`
    ).all() as {
      id: string; name: string; description: string | null; employeeId: string | null
      sourceType: string; lastStatus: string; lastCheckedAt: string | null
      enabled: number; createdAt: string
    }[]
  },

  updateCheck(id: string, value: string, status: string): void {
    db().prepare(
      'UPDATE monitors SET last_value = ?, last_status = ?, last_checked_at = ? WHERE id = ?'
    ).run(value, status, now(), id)
  },

  toggle(id: string, enabled: boolean): void {
    db().prepare('UPDATE monitors SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id)
  },
}

// ============================================================
// MONITOR ALERTS (v2 control plane)
// ============================================================

export const monitorAlerts = {
  create(params: { monitorId: string; severity: string; message: string; value?: string }): number {
    const result = db().prepare(
      'INSERT INTO monitor_alerts (monitor_id, severity, message, value, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(params.monitorId, params.severity, params.message, params.value ?? null, now())
    return Number(result.lastInsertRowid)
  },

  listByMonitor(monitorId: string, limit = 50) {
    return db().prepare(
      `SELECT id, monitor_id as monitorId, severity, message, value, acknowledged,
       acknowledged_by as acknowledgedBy, created_at as createdAt
       FROM monitor_alerts WHERE monitor_id = ? ORDER BY created_at DESC LIMIT ?`
    ).all(monitorId, limit) as {
      id: number; monitorId: string; severity: string; message: string
      value: string | null; acknowledged: number; acknowledgedBy: string | null; createdAt: string
    }[]
  },

  listRecent(limit = 50) {
    return db().prepare(
      `SELECT ma.id, ma.monitor_id as monitorId, m.name as monitorName, ma.severity, ma.message,
       ma.value, ma.acknowledged, ma.created_at as createdAt
       FROM monitor_alerts ma
       JOIN monitors m ON ma.monitor_id = m.id
       ORDER BY ma.created_at DESC LIMIT ?`
    ).all(limit) as {
      id: number; monitorId: string; monitorName: string; severity: string; message: string
      value: string | null; acknowledged: number; createdAt: string
    }[]
  },

  acknowledge(id: number, by: string): void {
    db().prepare('UPDATE monitor_alerts SET acknowledged = 1, acknowledged_by = ? WHERE id = ?').run(by, id)
  },

  countUnacknowledged(): number {
    const row = db().prepare('SELECT COUNT(*) as count FROM monitor_alerts WHERE acknowledged = 0').get() as { count: number }
    return row.count
  },
}
