'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Badge,
  MetricCard,
  PageShell,
  Panel,
  PanelHeader,
  StatusDot,
  EmptyState,
} from '@/components/dashboard/cockpit-ui'

interface Client {
  id: string
  name: string
  slug: string
  status: string
  serviceType: string
  industry: string | null
  healthScore: number
  healthStatus: string
  monthlyRetainerUsd: number
  lastHealthCheckAt: string | null
  createdAt: string
}

function healthTone(status: string): 'emerald' | 'amber' | 'rose' | 'neutral' {
  if (status === 'healthy') return 'emerald'
  if (status === 'warning') return 'amber'
  if (status === 'critical') return 'rose'
  return 'neutral'
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(diff / 3_600_000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    name: '', slug: '', serviceType: 'ads', industry: '',
    contactName: '', contactEmail: '', slackChannelId: '',
    monthlyRetainerUsd: '', notes: '',
    metaAccountId: '', metaAccessToken: '',
    kpiRoasTarget: '3.0', kpiCplTarget: '15',
  })
  const [submitting, setSubmitting] = useState(false)

  const fetchClients = useCallback(async () => {
    try {
      const res = await fetch('/api/clients')
      const json = await res.json()
      if (json.success) setClients(json.data)
    } catch { /* retry on next poll */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchClients()
    const interval = setInterval(fetchClients, 15_000)
    return () => clearInterval(interval)
  }, [fetchClients])

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const platforms: Record<string, unknown> = {}
      if (formData.metaAccountId && formData.metaAccessToken) {
        platforms.meta = { account_id: formData.metaAccountId, access_token: formData.metaAccessToken }
      }

      const kpiTargets = []
      if (formData.kpiRoasTarget) {
        const t = parseFloat(formData.kpiRoasTarget)
        kpiTargets.push({ metric: 'roas', target: t, warning: t * 0.8, critical: t * 0.6, direction: 'higher_is_better' })
      }
      if (formData.kpiCplTarget) {
        const t = parseFloat(formData.kpiCplTarget)
        kpiTargets.push({ metric: 'cpl', target: t, warning: t * 1.3, critical: t * 2, direction: 'lower_is_better' })
      }

      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          slug: formData.slug || formData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
          serviceType: formData.serviceType,
          industry: formData.industry || undefined,
          contactName: formData.contactName || undefined,
          contactEmail: formData.contactEmail || undefined,
          slackChannelId: formData.slackChannelId || undefined,
          monthlyRetainerUsd: formData.monthlyRetainerUsd ? parseFloat(formData.monthlyRetainerUsd) : undefined,
          platforms: Object.keys(platforms).length > 0 ? platforms : undefined,
          kpiTargets: kpiTargets.length > 0 ? kpiTargets : undefined,
          notes: formData.notes || undefined,
        }),
      })
      const json = await res.json()
      if (json.success) {
        setShowForm(false)
        setFormData({ name: '', slug: '', serviceType: 'ads', industry: '', contactName: '', contactEmail: '', slackChannelId: '', monthlyRetainerUsd: '', notes: '', metaAccountId: '', metaAccessToken: '', kpiRoasTarget: '3.0', kpiCplTarget: '15' })
        fetchClients()
      }
    } catch { /* ignore */ }
    finally { setSubmitting(false) }
  }

  const activeClients = clients.filter(c => c.status === 'active')
  const healthyCount = activeClients.filter(c => c.healthStatus === 'healthy').length
  const warningCount = activeClients.filter(c => c.healthStatus === 'warning').length
  const criticalCount = activeClients.filter(c => c.healthStatus === 'critical').length
  const totalMrr = activeClients.reduce((sum, c) => sum + c.monthlyRetainerUsd, 0)

  return (
    <PageShell
      eyebrow="CSM Agent"
      title="Client Accounts"
      description="Monitor client health, track KPIs, and manage the CSM agent roster."
      actions={
        <button
          onClick={() => setShowForm(!showForm)}
          className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            showForm
              ? 'border border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
              : 'bg-gradient-to-r from-cyan-300 via-cyan-400 to-teal-500 text-zinc-950'
          }`}
        >
          {showForm ? 'Cancel' : 'Add Client'}
        </button>
      }
    >
      {/* Scorecard */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard label="Active Clients" value={activeClients.length} hint={`$${totalMrr.toLocaleString()}/mo MRR`} accent="cyan" />
        <MetricCard label="Healthy" value={healthyCount} hint="On target" accent="emerald" />
        <MetricCard label="Warning" value={warningCount} hint="Below target" accent="amber" />
        <MetricCard label="Critical" value={criticalCount} hint="Needs attention" accent="rose" />
      </div>

      {/* Add Client Form */}
      {showForm && (
        <Panel className="mt-6">
          <PanelHeader title="Add New Client" />
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <input placeholder="Client Name *" value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value }))} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-cyan-400/40 focus:outline-none" />
            <input placeholder="Slug (auto-generated)" value={formData.slug} onChange={e => setFormData(f => ({ ...f, slug: e.target.value }))} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-cyan-400/40 focus:outline-none" />
            <select value={formData.serviceType} onChange={e => setFormData(f => ({ ...f, serviceType: e.target.value }))} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-cyan-400/40 focus:outline-none">
              <option value="ads">Ads Management</option>
              <option value="ecommerce">E-Commerce</option>
              <option value="leadgen">Lead Gen</option>
              <option value="saas">SaaS</option>
            </select>
            <input placeholder="Industry" value={formData.industry} onChange={e => setFormData(f => ({ ...f, industry: e.target.value }))} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-cyan-400/40 focus:outline-none" />
            <input placeholder="Contact Name" value={formData.contactName} onChange={e => setFormData(f => ({ ...f, contactName: e.target.value }))} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-cyan-400/40 focus:outline-none" />
            <input placeholder="Contact Email" value={formData.contactEmail} onChange={e => setFormData(f => ({ ...f, contactEmail: e.target.value }))} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-cyan-400/40 focus:outline-none" />
            <input placeholder="Slack Channel ID" value={formData.slackChannelId} onChange={e => setFormData(f => ({ ...f, slackChannelId: e.target.value }))} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-cyan-400/40 focus:outline-none" />
            <input placeholder="Monthly Retainer ($)" value={formData.monthlyRetainerUsd} onChange={e => setFormData(f => ({ ...f, monthlyRetainerUsd: e.target.value }))} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-cyan-400/40 focus:outline-none" />

            <div className="col-span-full mt-2">
              <p className="mb-2 text-xs uppercase tracking-widest text-white/40">Meta Ads Connection</p>
            </div>
            <input placeholder="Meta Ad Account ID" value={formData.metaAccountId} onChange={e => setFormData(f => ({ ...f, metaAccountId: e.target.value }))} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-cyan-400/40 focus:outline-none" />
            <input placeholder="Meta Access Token" value={formData.metaAccessToken} onChange={e => setFormData(f => ({ ...f, metaAccessToken: e.target.value }))} type="password" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-cyan-400/40 focus:outline-none" />

            <div className="col-span-full mt-2">
              <p className="mb-2 text-xs uppercase tracking-widest text-white/40">KPI Targets</p>
            </div>
            <input placeholder="ROAS Target (e.g. 3.0)" value={formData.kpiRoasTarget} onChange={e => setFormData(f => ({ ...f, kpiRoasTarget: e.target.value }))} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-cyan-400/40 focus:outline-none" />
            <input placeholder="CPL Target ($)" value={formData.kpiCplTarget} onChange={e => setFormData(f => ({ ...f, kpiCplTarget: e.target.value }))} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-cyan-400/40 focus:outline-none" />

            <div className="col-span-full mt-2">
              <button onClick={handleSubmit} disabled={submitting || !formData.name} className="rounded-2xl bg-gradient-to-r from-cyan-300 via-cyan-400 to-teal-500 px-6 py-3 text-sm font-semibold text-zinc-950 transition-transform hover:scale-[1.01] disabled:opacity-50">
                {submitting ? 'Adding...' : 'Add Client'}
              </button>
            </div>
          </div>
        </Panel>
      )}

      {/* Client Roster */}
      <Panel className="mt-6">
        <PanelHeader title="Client Roster" />
        {loading ? (
          <div className="p-4 text-sm text-white/40">Loading...</div>
        ) : clients.length === 0 ? (
          <EmptyState title="No clients yet" description="Add your first client to start monitoring their account health." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-white/50">
                  <th className="px-3 py-2 font-medium">Health</th>
                  <th className="px-3 py-2 font-medium">Client</th>
                  <th className="px-3 py-2 font-medium">Service</th>
                  <th className="px-3 py-2 font-medium">Score</th>
                  <th className="px-3 py-2 font-medium">MRR</th>
                  <th className="px-3 py-2 font-medium">Last Check</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="px-3 py-2">
                      <StatusDot tone={healthTone(client.healthStatus)} />
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-medium text-white/90">{client.name}</span>
                      <span className="ml-2 text-white/30">{client.slug}</span>
                    </td>
                    <td className="px-3 py-2"><Badge>{client.serviceType}</Badge></td>
                    <td className="px-3 py-2">
                      <span className={client.healthScore >= 80 ? 'text-emerald-400' : client.healthScore >= 50 ? 'text-amber-400' : client.healthScore > 0 ? 'text-rose-400' : 'text-white/30'}>
                        {client.healthScore > 0 ? `${client.healthScore}/100` : '--'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-white/60">${client.monthlyRetainerUsd.toLocaleString()}</td>
                    <td className="px-3 py-2 text-white/40">{relativeTime(client.lastHealthCheckAt)}</td>
                    <td className="px-3 py-2"><Badge tone={client.status === 'active' ? 'emerald' : 'neutral'}>{client.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </PageShell>
  )
}
