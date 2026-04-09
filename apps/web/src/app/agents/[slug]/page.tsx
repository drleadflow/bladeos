'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

interface AgentDetail {
  id: string
  slug: string
  name: string
  title: string
  pillar: string
  department: string | null
  description: string
  icon: string
  objective: string | null
  status: string | null
  allowedTools: string[]
  modelPreference: string | null
  totalRuns: number | null
  totalCostUsd: number | null
  successRate: number | null
  active: boolean
  archetype: string | null
  managerId: string | null
  onboardingAnswers: Record<string, string>
  createdAt: string
  updatedAt: string
}

interface KpiDefinition {
  id: string
  employeeId: string
  name: string
  description: string | null
  target: number
  unit: string
  frequency: string
  direction: string
  thresholds: { green: number; yellow: number; red: number }
}

interface KpiMeasurement {
  kpiId: string
  name: string
  value: number
  status: string
  measuredAt: string
}

interface Routine {
  id: string
  name: string
  description: string | null
  schedule: string
  task: string
  enabled: boolean
  lastRunAt: string | null
  nextRunAt: string | null
  runCount: number
  lastStatus: string | null
}

interface ActivityEvent {
  id: number
  eventType: string
  actorType: string
  actorId: string
  targetType: string | null
  targetId: string | null
  summary: string
  detailJson: string | null
  conversationId: string | null
  jobId: string | null
  costUsd: number
  createdAt: string
}

const EVENT_TYPE_STYLES: Record<string, { icon: string; badge: string }> = {
  conversation: { icon: '\u{1F4AC}', badge: 'bg-blue-600 text-blue-100' },
  tool_call: { icon: '\u{1F527}', badge: 'bg-purple-600 text-purple-100' },
  approval: { icon: '\u{2705}', badge: 'bg-green-600 text-green-100' },
  error: { icon: '\u{1F6A8}', badge: 'bg-red-600 text-red-100' },
  job_start: { icon: '\u{1F680}', badge: 'bg-cyan-600 text-cyan-100' },
  job_complete: { icon: '\u{1F389}', badge: 'bg-green-600 text-green-100' },
  job_fail: { icon: '\u{274C}', badge: 'bg-red-600 text-red-100' },
  cost: { icon: '\u{1F4B0}', badge: 'bg-yellow-600 text-yellow-100' },
}

const DEFAULT_STYLE = { icon: '\u{26A1}', badge: 'bg-zinc-600 text-zinc-200' }

function getEventStyle(eventType: string): { icon: string; badge: string } {
  return EVENT_TYPE_STYLES[eventType] ?? DEFAULT_STYLE
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function formatCost(usd: number | null): string {
  if (usd == null) return '--'
  return `$${usd.toFixed(4)}`
}

function cronToHuman(cron: string): string {
  const parts = cron.split(/\s+/)
  if (parts.length < 5) return cron

  const [min, hour, dayOfMonth, month, dayOfWeek] = parts

  if (min === '0' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return 'Every hour'
  }
  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    if (hour === '*') return `Every hour at :${min.padStart(2, '0')}`
    return `Daily at ${hour}:${min.padStart(2, '0')}`
  }
  if (dayOfWeek !== '*' && dayOfMonth === '*') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const dayName = days[Number(dayOfWeek)] ?? dayOfWeek
    return `${dayName} at ${hour}:${min.padStart(2, '0')}`
  }

  return cron
}

function getKpiStatusColor(status: string): string {
  switch (status) {
    case 'green': return 'bg-green-500'
    case 'yellow': return 'bg-yellow-500'
    case 'red': return 'bg-red-500'
    default: return 'bg-zinc-500'
  }
}

export default function AgentDetailPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

  const [agent, setAgent] = useState<AgentDetail | null>(null)
  const [kpis, setKpis] = useState<KpiDefinition[]>([])
  const [measurements, setMeasurements] = useState<KpiMeasurement[]>([])
  const [agentRoutines, setAgentRoutines] = useState<Routine[]>([])
  const [activity, setActivity] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAgent = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${slug}`)
      const json = await res.json()
      if (json.success === false) {
        setError(json.error ?? 'Agent not found')
        return
      }
      setAgent(json.agent)
      setKpis(json.kpis ?? [])
      setMeasurements(json.latestMeasurements ?? [])
      setAgentRoutines(json.routines ?? [])
      setActivity(json.recentActivity ?? [])
    } catch {
      setError('Failed to load agent')
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    fetchAgent()
  }, [fetchAgent])

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    )
  }

  if (error || !agent) {
    return (
      <div className="min-h-screen bg-zinc-950 p-6">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => router.push('/agents')}
            className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors mb-6"
          >
            &larr; Back to Agents
          </button>
          <div className="text-center py-16 text-zinc-500">
            <p className="text-lg">{error ?? 'Agent not found'}</p>
          </div>
        </div>
      </div>
    )
  }

  const measurementMap = new Map(measurements.map((m) => [m.kpiId, m]))

  return (
    <div className="min-h-screen bg-zinc-950 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Back button */}
        <button
          onClick={() => router.push('/agents')}
          className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors mb-6"
        >
          &larr; Back to Agents
        </button>

        {/* Agent header */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 mb-6">
          <div className="flex items-start gap-4">
            <span className="text-3xl" role="img" aria-label={agent.name}>
              {agent.icon || '\u{1F916}'}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold text-zinc-100">{agent.name}</h1>
                {agent.department && (
                  <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-600 text-blue-100">
                    {agent.department}
                  </span>
                )}
                {agent.status && (
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-block h-2 w-2 rounded-full ${
                      agent.status === 'active' ? 'bg-green-500' :
                      agent.status === 'idle' ? 'bg-yellow-500' :
                      agent.status === 'suspended' ? 'bg-red-500' : 'bg-zinc-500'
                    }`} />
                    <span className="text-xs text-zinc-400">{agent.status}</span>
                  </div>
                )}
              </div>
              <p className="text-sm text-zinc-400 mb-2">{agent.title}</p>
              {agent.objective && (
                <p className="text-sm text-zinc-300">{agent.objective}</p>
              )}
              <div className="flex items-center gap-6 mt-4 text-sm">
                <div>
                  <span className="text-zinc-500">Runs:</span>{' '}
                  <span className="text-zinc-300">{agent.totalRuns ?? 0}</span>
                </div>
                <div>
                  <span className="text-zinc-500">Cost:</span>{' '}
                  <span className="text-zinc-300">{formatCost(agent.totalCostUsd)}</span>
                </div>
                <div>
                  <span className="text-zinc-500">Success:</span>{' '}
                  <span className="text-zinc-300">
                    {agent.successRate != null ? `${agent.successRate.toFixed(0)}%` : '--'}
                  </span>
                </div>
                {agent.archetype && (
                  <div>
                    <span className="text-zinc-500">Archetype:</span>{' '}
                    <span className="text-zinc-300">{agent.archetype}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* KPIs Section */}
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase mb-3">KPIs</h2>
          {kpis.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center text-zinc-500 text-sm">
              No KPIs defined
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {kpis.map((kpi) => {
                const measurement = measurementMap.get(kpi.id)
                return (
                  <div
                    key={kpi.id}
                    className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`inline-block h-2 w-2 rounded-full ${
                        measurement ? getKpiStatusColor(measurement.status) : 'bg-zinc-500'
                      }`} />
                      <span className="text-sm font-medium text-zinc-100">{kpi.name}</span>
                    </div>
                    {kpi.description && (
                      <p className="text-xs text-zinc-500 mb-2">{kpi.description}</p>
                    )}
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-bold text-zinc-100">
                        {measurement ? measurement.value : '--'}
                      </span>
                      <span className="text-xs text-zinc-500">{kpi.unit}</span>
                      <span className="text-xs text-zinc-600 ml-auto">
                        target: {kpi.target} {kpi.unit}
                      </span>
                    </div>
                    {measurement && (
                      <div className="text-xs text-zinc-600 mt-1">
                        {relativeTime(measurement.measuredAt)}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Routines Section */}
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase mb-3">Routines</h2>
          {agentRoutines.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center text-zinc-500 text-sm">
              No routines configured
            </div>
          ) : (
            <div className="space-y-2">
              {agentRoutines.map((routine) => (
                <div
                  key={routine.id}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-zinc-100">{routine.name}</span>
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          routine.enabled ? 'bg-green-600 text-green-100' : 'bg-zinc-700 text-zinc-400'
                        }`}>
                          {routine.enabled ? 'enabled' : 'disabled'}
                        </span>
                      </div>
                      {routine.description && (
                        <p className="text-xs text-zinc-500 mb-1">{routine.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-zinc-500">
                        <span>Schedule: {cronToHuman(routine.schedule)}</span>
                        <span>Runs: {routine.runCount}</span>
                        {routine.lastStatus && (
                          <span className={`${
                            routine.lastStatus === 'success' ? 'text-green-400' :
                            routine.lastStatus === 'error' ? 'text-red-400' : 'text-zinc-400'
                          }`}>
                            Last: {routine.lastStatus}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right text-xs text-zinc-500 shrink-0">
                      {routine.lastRunAt && (
                        <div>Last run: {relativeTime(routine.lastRunAt)}</div>
                      )}
                      {routine.nextRunAt && (
                        <div className="mt-1">Next: {new Date(routine.nextRunAt).toLocaleString()}</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity Section */}
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase mb-3">Recent Activity</h2>
          {activity.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center text-zinc-500 text-sm">
              No recent activity
            </div>
          ) : (
            <div className="space-y-2">
              {activity.map((event) => {
                const style = getEventStyle(event.eventType)
                return (
                  <div
                    key={event.id}
                    className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-base" role="img" aria-label={event.eventType}>
                            {style.icon}
                          </span>
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${style.badge}`}
                          >
                            {event.eventType.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <p className="text-sm text-zinc-300 mt-1">{event.summary}</p>
                        {event.jobId && (
                          <p className="text-xs text-zinc-600 mt-1">Job: {event.jobId}</p>
                        )}
                      </div>
                      <div className="text-right text-xs text-zinc-500 whitespace-nowrap shrink-0">
                        <div>{relativeTime(event.createdAt)}</div>
                        {event.costUsd > 0 && (
                          <div className="mt-1 text-yellow-500">{formatCost(event.costUsd)}</div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Policy Section */}
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase mb-3">Policy</h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-4">
            <div>
              <h4 className="text-xs font-semibold text-zinc-400 uppercase mb-2">Allowed Tools</h4>
              {agent.allowedTools.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {agent.allowedTools.map((tool) => (
                    <span
                      key={tool}
                      className="inline-block px-2.5 py-1 rounded-md text-xs font-mono bg-zinc-800 text-zinc-300 border border-zinc-700"
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-500">No tool restrictions (all tools allowed)</p>
              )}
            </div>

            {agent.modelPreference && (
              <div>
                <h4 className="text-xs font-semibold text-zinc-400 uppercase mb-1">Model Preference</h4>
                <span className="text-sm text-zinc-300">{agent.modelPreference}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-zinc-500">Budget used:</span>{' '}
                <span className="text-zinc-300">{formatCost(agent.totalCostUsd)}</span>
              </div>
              <div>
                <span className="text-zinc-500">Manager:</span>{' '}
                <span className="text-zinc-300">{agent.managerId ?? 'None (top-level)'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
