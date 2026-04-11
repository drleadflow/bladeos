import { db, uuid, now } from './helpers.js'

// ============================================================
// LEAD EVENTS (GHL webhook ingestion)
// ============================================================

export const leadEvents = {
  ingest(params: {
    accountId: string
    accountName?: string
    contactId: string
    eventType: string
    channel?: string
    direction?: string
    handler?: string
    messageBody?: string
    source?: string
    metadata?: unknown
  }): number {
    const result = db().prepare(
      `INSERT INTO lead_events (account_id, account_name, contact_id, event_type, channel, direction, handler, message_body, source, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      params.accountId, params.accountName ?? null, params.contactId, params.eventType,
      params.channel ?? null, params.direction ?? null, params.handler ?? null,
      params.messageBody ?? null, params.source ?? null,
      params.metadata ? JSON.stringify(params.metadata) : null, now()
    )
    return Number(result.lastInsertRowid)
  },

  recent(params: { accountId?: string; eventType?: string; limit?: number } = {}) {
    const { limit = 50 } = params
    const where: string[] = []
    const values: unknown[] = []
    if (params.accountId) { where.push('account_id = ?'); values.push(params.accountId) }
    if (params.eventType) { where.push('event_type = ?'); values.push(params.eventType) }
    const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
    values.push(limit)
    return db().prepare(
      `SELECT id, account_id as accountId, contact_id as contactId, event_type as eventType,
       channel, direction, handler, message_body as messageBody, source, created_at as createdAt
       FROM lead_events ${clause} ORDER BY created_at DESC LIMIT ?`
    ).all(...values) as {
      id: number; accountId: string; contactId: string; eventType: string
      channel: string | null; direction: string | null; handler: string | null
      messageBody: string | null; source: string | null; createdAt: string
    }[]
  },

  countByAccount(days = 30) {
    const since = new Date(Date.now() - days * 86_400_000).toISOString()
    return db().prepare(
      `SELECT account_id as accountId, account_name as accountName,
       COUNT(*) as totalEvents,
       SUM(CASE WHEN direction = 'inbound' THEN 1 ELSE 0 END) as inbound,
       SUM(CASE WHEN direction = 'outbound' THEN 1 ELSE 0 END) as outbound
       FROM lead_events WHERE created_at >= ? GROUP BY account_id ORDER BY totalEvents DESC`
    ).all(since) as { accountId: string; accountName: string | null; totalEvents: number; inbound: number; outbound: number }[]
  },
}

// ============================================================
// LEAD ENGAGEMENT (computed state per contact)
// ============================================================

export const leadEngagement = {
  upsertFromEvent(params: {
    accountId: string
    contactId: string
    contactName?: string
    direction: string
    messageBody?: string
    source?: string
    workflowName?: string
  }): void {
    const existing = db().prepare(
      'SELECT * FROM lead_engagement WHERE account_id = ? AND contact_id = ?'
    ).get(params.accountId, params.contactId) as Record<string, unknown> | undefined

    if (!existing) {
      // New lead
      const isOutbound = params.direction === 'outbound'
      db().prepare(
        `INSERT INTO lead_engagement (account_id, contact_id, contact_name,
         first_outbound_at, first_outbound_body, first_outbound_source,
         first_inbound_at, is_responded, total_inbound, total_outbound,
         engagement_status, workflow_name, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'new', ?, ?)`
      ).run(
        params.accountId, params.contactId, params.contactName ?? null,
        isOutbound ? now() : null,
        isOutbound ? (params.messageBody ?? null) : null,
        isOutbound ? (params.source ?? null) : null,
        isOutbound ? null : now(),
        isOutbound ? 0 : 1,
        isOutbound ? 1 : 0,
        params.workflowName ?? null, now()
      )
      return
    }

    // Update existing
    if (params.direction === 'outbound') {
      // First outbound if none exists
      if (!existing.first_outbound_at) {
        db().prepare(
          `UPDATE lead_engagement SET first_outbound_at = ?, first_outbound_body = ?, first_outbound_source = ?,
           total_outbound = total_outbound + 1, workflow_name = COALESCE(?, workflow_name), updated_at = ?
           WHERE account_id = ? AND contact_id = ?`
        ).run(now(), params.messageBody ?? null, params.source ?? null, params.workflowName ?? null, now(), params.accountId, params.contactId)
      } else {
        db().prepare(
          'UPDATE lead_engagement SET total_outbound = total_outbound + 1, updated_at = ? WHERE account_id = ? AND contact_id = ?'
        ).run(now(), params.accountId, params.contactId)
      }
    } else if (params.direction === 'inbound') {
      const firstOutAt = existing.first_outbound_at as string | null
      const firstInAt = existing.first_inbound_at as string | null
      const totalOutbound = (existing.total_outbound as number) ?? 0

      // Determine if this is a reply to intro or follow-up
      let repliedToIntro = (existing.replied_to_intro as number) ?? 0
      let repliedToFollowup = (existing.replied_to_followup as number) ?? 0

      if (firstOutAt && !firstInAt) {
        // First inbound after an outbound — check if it's intro reply
        if (totalOutbound <= 1) {
          repliedToIntro = 1
        } else {
          repliedToFollowup = 1
        }
      }

      db().prepare(
        `UPDATE lead_engagement SET first_inbound_at = COALESCE(first_inbound_at, ?),
         is_responded = 1, replied_to_intro = ?, replied_to_followup = ?,
         total_inbound = total_inbound + 1, engagement_status = 'engaged', updated_at = ?
         WHERE account_id = ? AND contact_id = ?`
      ).run(now(), repliedToIntro, repliedToFollowup, now(), params.accountId, params.contactId)
    }
  },

  introResponseRate(params: { accountId?: string; days?: number } = {}) {
    const { days = 30 } = params
    const since = new Date(Date.now() - days * 86_400_000).toISOString()
    const where = ['first_outbound_at IS NOT NULL', 'first_outbound_at >= ?']
    const values: unknown[] = [since]
    if (params.accountId) { where.push('account_id = ?'); values.push(params.accountId) }
    const clause = where.join(' AND ')

    return db().prepare(
      `SELECT
        COUNT(*) as totalLeads,
        SUM(replied_to_intro) as repliedToIntro,
        SUM(replied_to_followup) as repliedToFollowup,
        SUM(CASE WHEN is_responded = 0 THEN 1 ELSE 0 END) as neverReplied,
        SUM(is_booked) as booked,
        ROUND(100.0 * SUM(replied_to_intro) / MAX(COUNT(*), 1), 1) as introResponsePct,
        ROUND(100.0 * SUM(is_responded) / MAX(COUNT(*), 1), 1) as overallResponsePct
       FROM lead_engagement WHERE ${clause}`
    ).get(...values) as {
      totalLeads: number; repliedToIntro: number; repliedToFollowup: number
      neverReplied: number; booked: number; introResponsePct: number; overallResponsePct: number
    }
  },

  byIntroTemplate(params: { accountId?: string; days?: number } = {}) {
    const { days = 30 } = params
    const since = new Date(Date.now() - days * 86_400_000).toISOString()
    const where = ['first_outbound_at IS NOT NULL', 'first_outbound_body IS NOT NULL', 'first_outbound_at >= ?']
    const values: unknown[] = [since]
    if (params.accountId) { where.push('account_id = ?'); values.push(params.accountId) }
    const clause = where.join(' AND ')

    return db().prepare(
      `SELECT
        SUBSTR(first_outbound_body, 1, 120) as template,
        first_outbound_source as source,
        COUNT(*) as sent,
        SUM(replied_to_intro) as repliedToIntro,
        SUM(CASE WHEN is_responded = 0 THEN 1 ELSE 0 END) as neverReplied,
        ROUND(100.0 * SUM(replied_to_intro) / MAX(COUNT(*), 1), 1) as introResponsePct
       FROM lead_engagement WHERE ${clause}
       GROUP BY template
       ORDER BY sent DESC`
    ).all(...values) as {
      template: string; source: string | null; sent: number
      repliedToIntro: number; neverReplied: number; introResponsePct: number
    }[]
  },
}

// ============================================================
// CLIENT ACCOUNTS (CSM Agent)
// ============================================================

export const clientAccounts = {
  create(params: {
    name: string
    slug: string
    serviceType?: string
    industry?: string
    contactName?: string
    contactEmail?: string
    slackChannelId?: string
    slackChannelName?: string
    monthlyRetainerUsd?: number
    platforms?: Record<string, unknown>
    kpiTargets?: Array<{ metric: string; target: number; warning: number; critical: number; direction: string }>
    notes?: string
  }): { id: string } {
    const id = uuid()
    db().prepare(
      `INSERT INTO client_accounts (id, name, slug, service_type, industry, contact_name, contact_email,
       slack_channel_id, slack_channel_name, monthly_retainer_usd, platforms_json, kpi_targets_json, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, params.name, params.slug, params.serviceType ?? 'ads', params.industry ?? null,
      params.contactName ?? null, params.contactEmail ?? null,
      params.slackChannelId ?? null, params.slackChannelName ?? null,
      params.monthlyRetainerUsd ?? 0,
      JSON.stringify(params.platforms ?? {}),
      JSON.stringify(params.kpiTargets ?? []),
      params.notes ?? null, now(), now()
    )
    return { id }
  },

  get(idOrSlug: string) {
    return db().prepare(
      `SELECT id, name, slug, status, contact_name as contactName, contact_email as contactEmail,
       slack_channel_id as slackChannelId, slack_channel_name as slackChannelName,
       service_type as serviceType, industry, monthly_retainer_usd as monthlyRetainerUsd,
       platforms_json as platformsJson, kpi_targets_json as kpiTargetsJson,
       health_score as healthScore, health_status as healthStatus,
       last_health_check_at as lastHealthCheckAt, last_report_at as lastReportAt,
       last_alert_at as lastAlertAt, notes, created_at as createdAt, updated_at as updatedAt
       FROM client_accounts WHERE id = ? OR slug = ?`
    ).get(idOrSlug, idOrSlug) as {
      id: string; name: string; slug: string; status: string
      contactName: string | null; contactEmail: string | null
      slackChannelId: string | null; slackChannelName: string | null
      serviceType: string; industry: string | null; monthlyRetainerUsd: number
      platformsJson: string; kpiTargetsJson: string
      healthScore: number; healthStatus: string
      lastHealthCheckAt: string | null; lastReportAt: string | null
      lastAlertAt: string | null; notes: string | null
      createdAt: string; updatedAt: string
    } | undefined
  },

  list(params: { status?: string; limit?: number } = {}) {
    const { status, limit = 50 } = params
    if (status) {
      return db().prepare(
        `SELECT id, name, slug, status, service_type as serviceType, industry,
         health_score as healthScore, health_status as healthStatus,
         monthly_retainer_usd as monthlyRetainerUsd,
         last_health_check_at as lastHealthCheckAt, created_at as createdAt
         FROM client_accounts WHERE status = ? ORDER BY name LIMIT ?`
      ).all(status, limit) as {
        id: string; name: string; slug: string; status: string; serviceType: string
        industry: string | null; healthScore: number; healthStatus: string
        monthlyRetainerUsd: number; lastHealthCheckAt: string | null; createdAt: string
      }[]
    }
    return db().prepare(
      `SELECT id, name, slug, status, service_type as serviceType, industry,
       health_score as healthScore, health_status as healthStatus,
       monthly_retainer_usd as monthlyRetainerUsd,
       last_health_check_at as lastHealthCheckAt, created_at as createdAt
       FROM client_accounts ORDER BY name LIMIT ?`
    ).all(limit) as {
      id: string; name: string; slug: string; status: string; serviceType: string
      industry: string | null; healthScore: number; healthStatus: string
      monthlyRetainerUsd: number; lastHealthCheckAt: string | null; createdAt: string
    }[]
  },

  updateHealth(id: string, params: { healthScore: number; healthStatus: string }): void {
    db().prepare(
      'UPDATE client_accounts SET health_score = ?, health_status = ?, last_health_check_at = ?, updated_at = ? WHERE id = ?'
    ).run(params.healthScore, params.healthStatus, now(), now(), id)
  },

  updateStatus(id: string, status: string): void {
    db().prepare('UPDATE client_accounts SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), id)
  },
}

// ============================================================
// CLIENT HEALTH SNAPSHOTS
// ============================================================

export const clientHealthSnapshots = {
  record(params: {
    clientId: string
    healthScore: number
    healthStatus: string
    metrics: Record<string, number>
    alerts?: Array<{ metric: string; value: number; target: number; severity: string }>
  }): number {
    const result = db().prepare(
      `INSERT INTO client_health_snapshots (client_id, health_score, health_status, metrics_json, alerts_json, checked_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      params.clientId, params.healthScore, params.healthStatus,
      JSON.stringify(params.metrics),
      params.alerts ? JSON.stringify(params.alerts) : null,
      now()
    )
    return Number(result.lastInsertRowid)
  },

  history(clientId: string, limit = 30) {
    return db().prepare(
      `SELECT id, health_score as healthScore, health_status as healthStatus,
       metrics_json as metricsJson, alerts_json as alertsJson, checked_at as checkedAt
       FROM client_health_snapshots WHERE client_id = ? ORDER BY checked_at DESC LIMIT ?`
    ).all(clientId, limit) as {
      id: number; healthScore: number; healthStatus: string
      metricsJson: string; alertsJson: string | null; checkedAt: string
    }[]
  },

  latest(clientId: string) {
    return db().prepare(
      `SELECT id, health_score as healthScore, health_status as healthStatus,
       metrics_json as metricsJson, alerts_json as alertsJson, checked_at as checkedAt
       FROM client_health_snapshots WHERE client_id = ? ORDER BY checked_at DESC LIMIT 1`
    ).get(clientId) as {
      id: number; healthScore: number; healthStatus: string
      metricsJson: string; alertsJson: string | null; checkedAt: string
    } | undefined
  },
}

// ============================================================
// CSM EVALS (Agent performance per client)
// ============================================================

export const csmEvals = {
  record(params: {
    clientId: string
    evalDate: string
    healthCheckRan?: boolean
    declineDetected?: boolean
    declineDetectionLatencyHours?: number
    alertDelivered?: boolean
    reportGenerated?: boolean
    costUsd?: number
    details?: unknown
  }): number {
    const result = db().prepare(
      `INSERT INTO csm_evals (client_id, eval_date, health_check_ran, decline_detected,
       decline_detection_latency_hours, alert_delivered, report_generated, cost_usd, details_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      params.clientId, params.evalDate,
      params.healthCheckRan ? 1 : 0, params.declineDetected ? 1 : 0,
      params.declineDetectionLatencyHours ?? null,
      params.alertDelivered ? 1 : 0, params.reportGenerated ? 1 : 0,
      params.costUsd ?? 0, params.details ? JSON.stringify(params.details) : null, now()
    )
    return Number(result.lastInsertRowid)
  },

  performance(clientId?: string, days = 30) {
    const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
    if (clientId) {
      return db().prepare(
        `SELECT COUNT(*) as totalDays,
         SUM(health_check_ran) as checksCompleted,
         ROUND(100.0 * SUM(health_check_ran) / MAX(COUNT(*), 1), 1) as checkCompletionPct,
         SUM(decline_detected) as declinesDetected,
         ROUND(AVG(decline_detection_latency_hours), 1) as avgDetectionLatencyHours,
         SUM(alert_delivered) as alertsDelivered,
         SUM(report_generated) as reportsGenerated,
         ROUND(SUM(cost_usd), 4) as totalCostUsd
         FROM csm_evals WHERE client_id = ? AND eval_date >= ?`
      ).get(clientId, since) as Record<string, number>
    }
    return db().prepare(
      `SELECT COUNT(*) as totalDays,
       SUM(health_check_ran) as checksCompleted,
       ROUND(100.0 * SUM(health_check_ran) / MAX(COUNT(*), 1), 1) as checkCompletionPct,
       SUM(decline_detected) as declinesDetected,
       SUM(alert_delivered) as alertsDelivered,
       SUM(report_generated) as reportsGenerated,
       ROUND(SUM(cost_usd), 4) as totalCostUsd
       FROM csm_evals WHERE eval_date >= ?`
    ).get(since) as Record<string, number>
  },
}
