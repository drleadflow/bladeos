'use client'

import { useState } from 'react'
import {
  Badge,
  MetricCard,
  PageShell,
  Panel,
  PanelHeader,
} from '@/components/dashboard/cockpit-ui'

type CronStatus = 'active' | 'disabled' | 'failed'

interface CronJob {
  id: string
  name: string
  schedule: string
  scheduleHuman: string
  lastRun: string | null
  nextRun: string
  status: CronStatus
  lastDurationMs: number | null
}

function statusTone(status: CronStatus): 'emerald' | 'neutral' | 'rose' {
  if (status === 'active') return 'emerald'
  if (status === 'failed') return 'rose'
  return 'neutral'
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) {
    const future = Math.abs(diff)
    const minutes = Math.floor(future / 60000)
    if (minutes < 60) return `in ${minutes}m`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `in ${hours}h`
    return `in ${Math.floor(hours / 24)}d`
  }
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

const CRON_JOBS: CronJob[] = [
  {
    id: 'cron-001',
    name: 'Daily Cost Digest',
    schedule: '0 8 * * *',
    scheduleHuman: 'Every day at 08:00 UTC',
    lastRun: new Date(Date.now() - 86400000).toISOString(),
    nextRun: new Date(Date.now() + 43200000).toISOString(),
    status: 'active',
    lastDurationMs: 2400,
  },
  {
    id: 'cron-002',
    name: 'Monitor Health Sweep',
    schedule: '*/15 * * * *',
    scheduleHuman: 'Every 15 minutes',
    lastRun: new Date(Date.now() - 720000).toISOString(),
    nextRun: new Date(Date.now() + 180000).toISOString(),
    status: 'active',
    lastDurationMs: 890,
  },
  {
    id: 'cron-003',
    name: 'Weekly KPI Report',
    schedule: '0 9 * * 1',
    scheduleHuman: 'Every Monday at 09:00 UTC',
    lastRun: new Date(Date.now() - 604800000).toISOString(),
    nextRun: new Date(Date.now() + 259200000).toISOString(),
    status: 'active',
    lastDurationMs: 18700,
  },
  {
    id: 'cron-004',
    name: 'Memory Store Prune',
    schedule: '0 2 * * 0',
    scheduleHuman: 'Every Sunday at 02:00 UTC',
    lastRun: new Date(Date.now() - 1209600000).toISOString(),
    nextRun: new Date(Date.now() + 432000000).toISOString(),
    status: 'disabled',
    lastDurationMs: 45200,
  },
  {
    id: 'cron-005',
    name: 'GHL Contact Sync',
    schedule: '0 */6 * * *',
    scheduleHuman: 'Every 6 hours',
    lastRun: new Date(Date.now() - 7200000).toISOString(),
    nextRun: new Date(Date.now() + 14400000).toISOString(),
    status: 'failed',
    lastDurationMs: 1200,
  },
]

export default function CronJobsPage() {
  const [jobs] = useState<CronJob[]>(CRON_JOBS)

  const activeCount = jobs.filter((j) => j.status === 'active').length
  const failedCount = jobs.filter((j) => j.status === 'failed').length
  const disabledCount = jobs.filter((j) => j.status === 'disabled').length

  return (
    <PageShell
      eyebrow="Operations / Cron"
      title="Cron jobs"
      description="Scheduled recurring jobs — last run, next run, duration, and status at a glance."
    >
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Active" value={activeCount} hint="Jobs that are currently enabled and running on schedule." accent="emerald" />
        <MetricCard label="Failed" value={failedCount} hint="Jobs whose last run ended in an error." accent={failedCount > 0 ? 'rose' : 'emerald'} />
        <MetricCard label="Disabled" value={disabledCount} hint="Jobs that are paused and not executing." accent="blue" />
      </div>

      <div className="mt-4">
        <Panel glow="amber">
          <PanelHeader
            eyebrow="Schedule"
            title="Registered cron jobs"
            description="Each entry is a time-triggered job. Failed jobs should be investigated and re-enabled after the root cause is resolved."
          />

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="pb-3 pr-4 text-left text-xs uppercase tracking-[0.18em] text-zinc-500">Job Name</th>
                  <th className="pb-3 pr-4 text-left text-xs uppercase tracking-[0.18em] text-zinc-500">Schedule</th>
                  <th className="pb-3 pr-4 text-left text-xs uppercase tracking-[0.18em] text-zinc-500">Last Run</th>
                  <th className="pb-3 pr-4 text-left text-xs uppercase tracking-[0.18em] text-zinc-500">Next Run</th>
                  <th className="pb-3 pr-4 text-left text-xs uppercase tracking-[0.18em] text-zinc-500">Status</th>
                  <th className="pb-3 text-left text-xs uppercase tracking-[0.18em] text-zinc-500">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {jobs.map((job) => (
                  <tr key={job.id} className="transition-colors hover:bg-white/[0.03]">
                    <td className="py-3 pr-4">
                      <p className="text-sm font-medium text-zinc-200">{job.name}</p>
                      <p className="mt-0.5 font-mono text-xs text-zinc-600">{job.id}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <p className="font-mono text-xs text-zinc-400">{job.schedule}</p>
                      <p className="mt-0.5 text-xs text-zinc-600">{job.scheduleHuman}</p>
                    </td>
                    <td className="py-3 pr-4 text-xs text-zinc-500">{relativeTime(job.lastRun)}</td>
                    <td className="py-3 pr-4 text-xs text-zinc-400">{relativeTime(job.nextRun)}</td>
                    <td className="py-3 pr-4">
                      <Badge tone={statusTone(job.status)}>{job.status}</Badge>
                    </td>
                    <td className="py-3 font-mono text-xs text-zinc-400">{formatDuration(job.lastDurationMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </PageShell>
  )
}
