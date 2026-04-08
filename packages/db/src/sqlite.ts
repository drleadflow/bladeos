import Database from 'better-sqlite3'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

let _db: Database.Database | null = null

export function getDb(dbPath?: string): Database.Database {
  if (_db) return _db

  const path = dbPath ?? join(process.cwd(), 'blade.db')
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

  const migrationPath = join(__dirname, '..', 'src', 'migrations', '0001_init.sql')

  let sql: string
  if (existsSync(migrationPath)) {
    sql = readFileSync(migrationPath, 'utf-8')
  } else {
    // Fallback: try relative to dist
    const distPath = join(__dirname, 'migrations', '0001_init.sql')
    if (existsSync(distPath)) {
      sql = readFileSync(distPath, 'utf-8')
    } else {
      throw new Error(`Migration file not found at ${migrationPath} or ${distPath}`)
    }
  }

  db.exec(sql)
  return db
}

export function closeDb(): void {
  if (_db) {
    _db.close()
    _db = null
  }
}
