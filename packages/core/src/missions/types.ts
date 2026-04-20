export interface MissionResult {
  summary: string
  findings: string
  artifacts: string[]
  confidence: number
  tokensUsed: number
  costUsd: number
  employeeModel: string
  durationMs: number
}

export interface WorkerConfig {
  pollIntervalMs: number
  clarificationTimeoutMs: number
  maxRetriesPerMission: number
  defaultCostBudget: number
  dashboardUrl: string
  notifyTelegram: (message: string) => Promise<void>
}

export const DEFAULT_WORKER_CONFIG: Partial<WorkerConfig> = {
  pollIntervalMs: 10_000,
  clarificationTimeoutMs: 5 * 60 * 1000,
  maxRetriesPerMission: 3,
  defaultCostBudget: 1.0,
}
