import Database from 'better-sqlite3'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

let _db: Database.Database | null = null

export function getDb(dbPath?: string): Database.Database {
  if (_db) return _db

  const path = dbPath ?? join(process.env.BLADE_DATA_DIR ?? process.cwd(), 'blade.db')
  const dir = dirname(path)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  _db = new Database(path)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')

  return _db
}

export function initializeDb(dbPath?: string): Database.Database {
  const db = getDb(dbPath)

  // Create migration tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const migrationFiles = ['0001_init.sql', '0002_employees.sql', '0003_documents.sql', '0004_gamification.sql', '0005_evolution.sql', '0006_workflow_runs.sql', '0007_control_plane.sql', '0008_worker_sessions.sql', '0009_channel_links.sql', '0010_job_evals.sql', '0011_client_accounts.sql', '0012_workspaces.sql', '0013_lead_tracking.sql', '0014_indexes.sql', '0015_auth.sql', '0016_content_studio.sql', '0017_skill_packs.sql', '0018_onboarding_sessions.sql', '0019_memory_overhaul.sql', '0020_missions.sql']

  const applied = new Set(
    (db.prepare('SELECT filename FROM schema_migrations').all() as { filename: string }[])
      .map(r => r.filename)
  )

  for (const file of migrationFiles) {
    if (applied.has(file)) continue

    const migrationPath = join(__dirname, '..', 'src', 'migrations', file)

    let sql: string
    if (existsSync(migrationPath)) {
      sql = readFileSync(migrationPath, 'utf-8')
    } else {
      // Fallback: try relative to dist
      const distPath = join(__dirname, 'migrations', file)
      if (existsSync(distPath)) {
        sql = readFileSync(distPath, 'utf-8')
      } else {
        throw new Error(`Migration file not found at ${migrationPath} or ${distPath}`)
      }
    }

    db.exec(sql)
    db.prepare('INSERT INTO schema_migrations (filename) VALUES (?)').run(file)
  }

  return db
}

export function closeDb(): void {
  if (_db) {
    _db.close()
    _db = null
  }
}
