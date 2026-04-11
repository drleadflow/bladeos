import type Database from 'better-sqlite3'
import { getDb } from '../sqlite.js'

export function db(): Database.Database {
  return getDb()
}

export function uuid(): string {
  return crypto.randomUUID()
}

export function now(): string {
  return new Date().toISOString()
}

export function sanitizeFtsQuery(query: string): string {
  // Remove FTS5 special operators and wrap each word in quotes
  return query
    .replace(/[*"{}()^~<>:]/g, '') // Strip FTS5 special chars
    .split(/\s+/)
    .filter(w => w.length > 0)
    .map(w => `"${w}"`)  // Quote each term for literal matching
    .join(' ')
}
