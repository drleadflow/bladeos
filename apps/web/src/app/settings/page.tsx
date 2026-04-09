'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Badge,
  EmptyState,
  PageShell,
  Panel,
  PanelHeader,
} from '@/components/dashboard/cockpit-ui'

interface KeyStatus {
  anthropic: boolean
  openai: boolean
  github: boolean
  telegram: boolean
  exa: boolean
  serpapi: boolean
  tavily: boolean
}

interface SkillInfo {
  name: string
  description: string
  successRate: number
  totalUses: number
  source: string
  enabled: boolean
}

interface Settings {
  defaultModel: string
  costBudget: number
  maxIterations: number
  keyStatus: KeyStatus
  personality: string
  skills: SkillInfo[]
}

const MODEL_OPTIONS = [
  'claude-sonnet-4-20250514',
  'claude-opus-4-20250514',
  'claude-haiku-4-20250514',
  'gpt-4o',
  'gpt-4o-mini',
]

const KEY_LABELS: Record<keyof KeyStatus, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  github: 'GitHub',
  telegram: 'Telegram',
  exa: 'Exa Search',
  serpapi: 'SerpAPI',
  tavily: 'Tavily',
}

const KEY_ENV_NAMES: Record<keyof KeyStatus, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  github: 'GITHUB_TOKEN',
  telegram: 'TELEGRAM_BOT_TOKEN',
  exa: 'EXA_API_KEY',
  serpapi: 'SERPAPI_API_KEY',
  tavily: 'TAVILY_API_KEY',
}

function sourceTone(source: string): 'blue' | 'emerald' | 'cyan' {
  if (source === 'builtin') return 'blue'
  if (source === 'learned') return 'emerald'
  return 'cyan'
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({})
  const [personalityDraft, setPersonalityDraft] = useState('')

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings')
      const data = await res.json()
      if (data.success) {
        setSettings(data.data)
        setPersonalityDraft(data.data.personality ?? '')
      }
    } catch {
      // Failed to load settings
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  async function handleSave(updates: Record<string, unknown>) {
    setSaving(true)
    setSaveMessage('')
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      const data = await res.json()
      if (data.success) {
        setSaveMessage('Saved')
        await fetchSettings()
      } else {
        setSaveMessage(`Error: ${data.error}`)
      }
    } catch {
      setSaveMessage('Failed to save')
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMessage(''), 3000)
    }
  }

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
      </div>
    )
  }

  if (!settings) {
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <EmptyState
          title="Settings unavailable"
          description="Blade couldn't load the current configuration."
        />
      </div>
    )
  }

  return (
    <PageShell
      eyebrow="Settings"
      title="Control plane configuration"
      description="Tune model routing, manage credentials, shape Blade’s voice, and control the skills available to the system."
      actions={
        saveMessage ? (
          <Badge tone={saveMessage.startsWith('Error') || saveMessage === 'Failed to save' ? 'rose' : 'emerald'}>
            {saveMessage}
          </Badge>
        ) : null
      }
    >
      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-4">
          <Panel glow="cyan">
            <PanelHeader
              eyebrow="General"
              title="Runtime defaults"
              description="Core configuration used when Blade starts work."
            />
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm text-zinc-400">Default Model</label>
                <select
                  value={settings.defaultModel}
                  onChange={(e) => handleSave({ defaultModel: e.target.value })}
                  disabled={saving}
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-zinc-100 outline-none transition-colors focus:border-cyan-400/40"
                >
                  {MODEL_OPTIONS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-400">
                  Cost Budget per Task (USD, 0 = unlimited)
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  defaultValue={settings.costBudget}
                  onBlur={(e) => handleSave({ costBudget: parseFloat(e.target.value) || 0 })}
                  disabled={saving}
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-zinc-100 outline-none transition-colors focus:border-cyan-400/40"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-400">Max Iterations</label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  defaultValue={settings.maxIterations}
                  onBlur={(e) => handleSave({ maxIterations: parseInt(e.target.value, 10) || 25 })}
                  disabled={saving}
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-zinc-100 outline-none transition-colors focus:border-cyan-400/40"
                />
              </div>
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              eyebrow="API Keys"
              title="Credential posture"
              description="Update connectors and model providers without leaving the control plane."
            />
            <div className="space-y-3">
              {(Object.keys(KEY_LABELS) as Array<keyof KeyStatus>).map((key) => (
                <div
                  key={key}
                  className="flex flex-col gap-3 rounded-[1.25rem] border border-white/10 bg-zinc-950/45 px-4 py-4 md:flex-row md:items-center"
                >
                  <div className="flex min-w-[150px] items-center gap-3">
                    <span className="text-lg">{settings.keyStatus[key] ? '✅' : '⚪'}</span>
                    <span className="text-sm font-medium text-zinc-200">{KEY_LABELS[key]}</span>
                  </div>
                  <input
                    type="password"
                    placeholder={
                      settings.keyStatus[key]
                        ? 'Configured (enter new value to update)'
                        : `Enter ${KEY_ENV_NAMES[key]}`
                    }
                    value={keyInputs[key] ?? ''}
                    onChange={(e) => setKeyInputs((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="flex-1 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-cyan-400/40"
                  />
                </div>
              ))}
              <button
                onClick={() => {
                  const keys: Record<string, string> = {}
                  for (const [k, v] of Object.entries(keyInputs)) {
                    if (v.trim()) {
                      keys[KEY_ENV_NAMES[k as keyof KeyStatus]] = v.trim()
                    }
                  }
                  if (Object.keys(keys).length > 0) {
                    handleSave({ apiKeys: keys })
                    setKeyInputs({})
                  }
                }}
                disabled={saving || Object.values(keyInputs).every((v) => !v.trim())}
                className="rounded-2xl bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-600 px-4 py-3 text-sm font-semibold text-zinc-950 transition-transform duration-200 hover:scale-[1.01] disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Keys'}
              </button>
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel glow="emerald">
            <PanelHeader
              eyebrow="Personality"
              title="Blade voice and behavior"
              description="Edit the system personality that shapes how Blade communicates and operates."
            />
            <textarea
              value={personalityDraft}
              onChange={(e) => setPersonalityDraft(e.target.value)}
              rows={14}
              className="w-full rounded-[1.6rem] border border-white/10 bg-zinc-950/55 px-4 py-4 font-mono text-sm text-zinc-100 outline-none transition-colors focus:border-cyan-400/40"
            />
            <button
              onClick={() => handleSave({ personality: personalityDraft })}
              disabled={saving}
              className="mt-4 rounded-2xl bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-600 px-4 py-3 text-sm font-semibold text-zinc-950 transition-transform duration-200 hover:scale-[1.01] disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Personality'}
            </button>
          </Panel>

          <Panel>
            <PanelHeader
              eyebrow="Skills"
              title="Capability roster"
              description="See which skills are available, how often they’re used, and whether they are currently enabled."
            />
            {settings.skills.length === 0 ? (
              <EmptyState
                title="No skills installed"
                description="Once skills are configured they’ll appear here with usage and success metrics."
              />
            ) : (
              <div className="space-y-3">
                {settings.skills.map((skill) => (
                  <div
                    key={skill.name}
                    className="flex flex-col gap-4 rounded-[1.3rem] border border-white/10 bg-zinc-950/45 px-4 py-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-zinc-100">{skill.name}</p>
                        <Badge tone={sourceTone(skill.source)}>{skill.source}</Badge>
                      </div>
                      <p className="mt-2 text-sm text-zinc-400">{skill.description}</p>
                      <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-500">
                        <span>Success {(skill.successRate * 100).toFixed(0)}%</span>
                        <span>Uses {skill.totalUses}</span>
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        handleSave({
                          toggleSkill: {
                            name: skill.name,
                            enabled: !skill.enabled,
                          },
                        })
                      }
                      className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition-colors ${
                        skill.enabled
                          ? 'bg-cyan-400/15 text-cyan-200 hover:bg-cyan-400/20'
                          : 'bg-white/[0.05] text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-200'
                      }`}
                    >
                      {skill.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </PageShell>
  )
}
