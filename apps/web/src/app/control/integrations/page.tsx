'use client'

import { useState } from 'react'
import { PageShell, Panel, PanelHeader } from '@/components/dashboard/cockpit-ui'

interface Integration {
  id: string
  name: string
  description: string
  icon: string
  category: 'crm' | 'ads' | 'content' | 'data' | 'comms' | 'dev'
  connected: boolean
  lastSync: string | null
}

const INITIAL_INTEGRATIONS: Integration[] = [
  {
    id: 'ghl',
    name: 'GoHighLevel',
    description: 'CRM, pipelines, contacts, and campaign automation.',
    icon: '🏆',
    category: 'crm',
    connected: true,
    lastSync: '2025-04-09T08:14:00Z',
  },
  {
    id: 'meta',
    name: 'Meta Ads',
    description: 'Facebook & Instagram ad campaigns, spend, and ROAS.',
    icon: '📘',
    category: 'ads',
    connected: true,
    lastSync: '2025-04-09T07:00:00Z',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    description: 'Channel analytics, video performance, and comment monitoring.',
    icon: '▶️',
    category: 'content',
    connected: false,
    lastSync: null,
  },
  {
    id: 'airtable',
    name: 'Airtable',
    description: 'Structured data, content calendars, and project tracking.',
    icon: '🗃️',
    category: 'data',
    connected: true,
    lastSync: '2025-04-08T22:30:00Z',
  },
  {
    id: 'telegram',
    name: 'Telegram',
    description: 'Bot-based notifications and inbound command handling.',
    icon: '✈️',
    category: 'comms',
    connected: true,
    lastSync: '2025-04-09T08:45:00Z',
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Team alerts, workflow triggers, and agent status updates.',
    icon: '💬',
    category: 'comms',
    connected: false,
    lastSync: null,
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Repo management, PR automation, and code execution context.',
    icon: '🐙',
    category: 'dev',
    connected: true,
    lastSync: '2025-04-08T18:00:00Z',
  },
]

const CATEGORY_LABELS: Record<Integration['category'], string> = {
  crm: 'CRM',
  ads: 'Advertising',
  content: 'Content',
  data: 'Data',
  comms: 'Communications',
  dev: 'Development',
}

function formatSync(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return `${Math.floor(diffHr / 24)}d ago`
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>(INITIAL_INTEGRATIONS)

  function toggleConnection(id: string) {
    setIntegrations((prev) =>
      prev.map((i) =>
        i.id === id
          ? {
              ...i,
              connected: !i.connected,
              lastSync: !i.connected ? new Date().toISOString() : null,
            }
          : i
      )
    )
  }

  const grouped = integrations.reduce<Record<string, Integration[]>>((acc, item) => {
    const key = item.category
    return { ...acc, [key]: [...(acc[key] ?? []), item] }
  }, {})

  const connectedCount = integrations.filter((i) => i.connected).length

  return (
    <PageShell
      eyebrow="Control / Integrations"
      title="Connected services"
      description="Every external tool, platform, and data source Blade can reach. Connect or disconnect services at any time."
      actions={
        <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-zinc-300">
          <span style={{ color: '#94a3b8' }} className="font-semibold">{connectedCount}</span>
          <span className="text-zinc-500"> / {integrations.length} connected</span>
        </div>
      }
    >
      <div className="space-y-6">
        {Object.entries(grouped).map(([category, items]) => (
          <Panel key={category}>
            <PanelHeader eyebrow="Category" title={CATEGORY_LABELS[category as Integration['category']]} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((integration) => (
                <div
                  key={integration.id}
                  className={`rounded-[1.3rem] border bg-zinc-950/45 px-4 py-4 transition-colors ${
                    integration.connected
                      ? 'border-slate-400/20'
                      : 'border-white/10'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{integration.icon}</span>
                      <div>
                        <p className="text-sm font-semibold text-zinc-100">{integration.name}</p>
                        {integration.connected && integration.lastSync ? (
                          <p className="text-xs text-zinc-500">Synced {formatSync(integration.lastSync)}</p>
                        ) : (
                          <p className="text-xs text-zinc-600">Not connected</p>
                        )}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 h-2.5 w-2.5 rounded-full mt-1.5 ${
                        integration.connected ? 'bg-emerald-400' : 'bg-zinc-600'
                      }`}
                      style={integration.connected ? { boxShadow: '0 0 8px #34d399' } : {}}
                    />
                  </div>

                  <p className="text-xs leading-5 text-zinc-500 mb-4">{integration.description}</p>

                  <button
                    onClick={() => toggleConnection(integration.id)}
                    className={`w-full rounded-2xl py-2 text-xs font-semibold uppercase tracking-[0.15em] transition-colors ${
                      integration.connected
                        ? 'border border-rose-400/20 bg-rose-400/10 text-rose-300 hover:bg-rose-400/20'
                        : 'text-zinc-950 hover:opacity-90'
                    }`}
                    style={
                      !integration.connected
                        ? { background: 'linear-gradient(to right, #94a3b8, #64748b)' }
                        : {}
                    }
                  >
                    {integration.connected ? 'Disconnect' : 'Connect'}
                  </button>
                </div>
              ))}
            </div>
          </Panel>
        ))}
      </div>
    </PageShell>
  )
}
