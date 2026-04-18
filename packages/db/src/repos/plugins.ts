import { db, uuid, now } from './helpers.js'

export interface PluginRecord {
  id: string
  name: string
  version: string
  type: string
  description: string | null
  entryPoint: string
  configSchemaJson: string | null
  configJson: string
  enabled: number
  crashCount: number
  installedAt: string
  updatedAt: string
}

export interface PluginEventRecord {
  id: number
  pluginId: string
  eventType: string
  status: string
  detailJson: string | null
  createdAt: string
}

export interface InstallPluginParams {
  name: string
  version: string
  type: string
  description?: string
  entryPoint: string
  configSchema?: Record<string, unknown>
  config?: Record<string, unknown>
}

const PLUGIN_FIELDS = `
  id, name, version, type, description,
  entry_point as entryPoint,
  config_schema_json as configSchemaJson,
  config_json as configJson,
  enabled, crash_count as crashCount,
  installed_at as installedAt,
  updated_at as updatedAt
`

export const plugins = {
  install(params: InstallPluginParams): PluginRecord {
    const id = uuid()
    const ts = now()
    db().prepare(
      `INSERT INTO plugins (id, name, version, type, description, entry_point, config_schema_json, config_json, enabled, installed_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(name) DO UPDATE SET
         version = excluded.version,
         entry_point = excluded.entry_point,
         config_schema_json = excluded.config_schema_json,
         updated_at = excluded.updated_at`
    ).run(
      id, params.name, params.version, params.type,
      params.description ?? null,
      params.entryPoint,
      params.configSchema ? JSON.stringify(params.configSchema) : null,
      JSON.stringify(params.config ?? {}),
      ts, ts
    )
    return plugins.get(params.name)!
  },

  get(name: string): PluginRecord | undefined {
    return db().prepare(`SELECT ${PLUGIN_FIELDS} FROM plugins WHERE name = ?`).get(name) as PluginRecord | undefined
  },

  getById(id: string): PluginRecord | undefined {
    return db().prepare(`SELECT ${PLUGIN_FIELDS} FROM plugins WHERE id = ?`).get(id) as PluginRecord | undefined
  },

  list(filters?: { type?: string; enabled?: boolean }): PluginRecord[] {
    const conditions: string[] = []
    const params: unknown[] = []
    if (filters?.type) { conditions.push('type = ?'); params.push(filters.type) }
    if (filters?.enabled !== undefined) { conditions.push('enabled = ?'); params.push(filters.enabled ? 1 : 0) }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    return db().prepare(`SELECT ${PLUGIN_FIELDS} FROM plugins ${where} ORDER BY name`).all(...params) as PluginRecord[]
  },

  enable(name: string): void {
    db().prepare('UPDATE plugins SET enabled = 1, updated_at = ? WHERE name = ?').run(now(), name)
  },

  disable(name: string): void {
    db().prepare('UPDATE plugins SET enabled = 0, updated_at = ? WHERE name = ?').run(now(), name)
  },

  uninstall(name: string): void {
    db().prepare('DELETE FROM plugins WHERE name = ?').run(name)
  },

  recordCrash(name: string): number {
    db().prepare('UPDATE plugins SET crash_count = crash_count + 1, updated_at = ? WHERE name = ?').run(now(), name)
    const record = plugins.get(name)
    return record?.crashCount ?? 0
  },

  resetCrashCount(name: string): void {
    db().prepare('UPDATE plugins SET crash_count = 0, updated_at = ? WHERE name = ?').run(now(), name)
  },

  updateConfig(name: string, config: Record<string, unknown>): void {
    db().prepare('UPDATE plugins SET config_json = ?, updated_at = ? WHERE name = ?').run(JSON.stringify(config), now(), name)
  },

  logEvent(pluginId: string, eventType: string, status: string, detail?: Record<string, unknown>): void {
    db().prepare(
      'INSERT INTO plugin_events (plugin_id, event_type, status, detail_json, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(pluginId, eventType, status, detail ? JSON.stringify(detail) : null, now())
  },

  getEvents(pluginId: string, limit = 50): PluginEventRecord[] {
    return db().prepare(
      'SELECT id, plugin_id as pluginId, event_type as eventType, status, detail_json as detailJson, created_at as createdAt FROM plugin_events WHERE plugin_id = ? ORDER BY created_at DESC LIMIT ?'
    ).all(pluginId, limit) as PluginEventRecord[]
  },
}
