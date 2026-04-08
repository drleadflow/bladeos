import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export interface BladeConfig {
  /** Default AI model for chat */
  defaultModel: string
  /** Default AI model for coding jobs */
  codingModel: string
  /** Max iterations for agent loop */
  maxIterations: number
  /** Cost budget per task (USD), 0 = unlimited */
  costBudget: number
  /** Web UI port */
  port: number
  /** Path to skills directory */
  skillsDir: string
  /** Path to SQLite database */
  databasePath: string
}

const DEFAULT_CONFIG: BladeConfig = {
  defaultModel: 'claude-sonnet-4-20250514',
  codingModel: 'claude-sonnet-4-20250514',
  maxIterations: 25,
  costBudget: 0,
  port: 3000,
  skillsDir: join(homedir(), '.blade', 'skills'),
  databasePath: join(homedir(), '.blade', 'blade.db'),
}

export function loadConfig(configPath?: string): BladeConfig {
  const path = configPath ?? join(homedir(), '.blade', 'config.json')

  if (!existsSync(path)) {
    return { ...DEFAULT_CONFIG }
  }

  const raw = readFileSync(path, 'utf-8')
  const parsed = JSON.parse(raw) as Partial<BladeConfig>

  return { ...DEFAULT_CONFIG, ...parsed }
}
