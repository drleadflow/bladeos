'use client'

import { useEffect, useState, useCallback } from 'react'

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
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <p className="text-zinc-500">Loading settings...</p>
      </div>
    )
  }

  if (!settings) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <p className="text-red-400">Failed to load settings</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-8">
        <h1 className="text-2xl font-bold text-zinc-100">Settings</h1>

        {saveMessage && (
          <div
            className={`rounded-md px-4 py-2 text-sm ${
              saveMessage.startsWith('Error') || saveMessage === 'Failed to save'
                ? 'bg-red-900/50 text-red-300'
                : 'bg-green-900/50 text-green-300'
            }`}
          >
            {saveMessage}
          </div>
        )}

        {/* General Section */}
        <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="mb-4 text-lg font-semibold text-zinc-100">General</h2>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-zinc-400">
                Default Model
              </label>
              <select
                value={settings.defaultModel}
                onChange={(e) =>
                  handleSave({ defaultModel: e.target.value })
                }
                disabled={saving}
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
              >
                {MODEL_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-400">
                Cost Budget per Task (USD, 0 = unlimited)
              </label>
              <input
                type="number"
                min={0}
                step={0.01}
                defaultValue={settings.costBudget}
                onBlur={(e) =>
                  handleSave({ costBudget: parseFloat(e.target.value) || 0 })
                }
                disabled={saving}
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-zinc-400">
                Max Iterations
              </label>
              <input
                type="number"
                min={1}
                max={200}
                defaultValue={settings.maxIterations}
                onBlur={(e) =>
                  handleSave({
                    maxIterations: parseInt(e.target.value, 10) || 25,
                  })
                }
                disabled={saving}
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </section>

        {/* API Keys Section */}
        <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="mb-4 text-lg font-semibold text-zinc-100">
            API Keys
          </h2>
          <div className="space-y-3">
            {(Object.keys(KEY_LABELS) as Array<keyof KeyStatus>).map((key) => (
              <div
                key={key}
                className="flex items-center gap-3 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2"
              >
                <span className="text-lg">
                  {settings.keyStatus[key] ? '\u2705' : '\u274C'}
                </span>
                <span className="min-w-[100px] text-sm font-medium text-zinc-300">
                  {KEY_LABELS[key]}
                </span>
                <input
                  type="password"
                  placeholder={
                    settings.keyStatus[key]
                      ? 'Configured (enter new value to update)'
                      : `Enter ${KEY_ENV_NAMES[key]}`
                  }
                  value={keyInputs[key] ?? ''}
                  onChange={(e) =>
                    setKeyInputs((prev) => ({
                      ...prev,
                      [key]: e.target.value,
                    }))
                  }
                  className="flex-1 rounded border border-zinc-600 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
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
              disabled={
                saving ||
                Object.values(keyInputs).every((v) => !v.trim())
              }
              className="mt-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Keys'}
            </button>
          </div>
        </section>

        {/* Agent Personality Section */}
        <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="mb-4 text-lg font-semibold text-zinc-100">
            Agent Personality
          </h2>
          <p className="mb-2 text-xs text-zinc-500">
            Edit SOUL.md -- defines how Blade behaves and communicates.
          </p>
          <textarea
            value={personalityDraft}
            onChange={(e) => setPersonalityDraft(e.target.value)}
            rows={10}
            className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={() => handleSave({ personality: personalityDraft })}
            disabled={saving}
            className="mt-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Personality'}
          </button>
        </section>

        {/* Skills Section */}
        <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="mb-4 text-lg font-semibold text-zinc-100">Skills</h2>
          {settings.skills.length === 0 ? (
            <p className="text-sm text-zinc-500">No skills installed yet.</p>
          ) : (
            <div className="space-y-2">
              {settings.skills.map((skill) => (
                <div
                  key={skill.name}
                  className="flex items-center justify-between rounded-md border border-zinc-700 bg-zinc-800 px-4 py-3"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-zinc-100">
                        {skill.name}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          skill.source === 'builtin'
                            ? 'bg-blue-900/50 text-blue-300'
                            : skill.source === 'learned'
                              ? 'bg-green-900/50 text-green-300'
                              : 'bg-purple-900/50 text-purple-300'
                        }`}
                      >
                        {skill.source}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {skill.description}
                    </p>
                    <div className="mt-1 flex gap-3 text-xs text-zinc-600">
                      <span>
                        Success: {(skill.successRate * 100).toFixed(0)}%
                      </span>
                      <span>Uses: {skill.totalUses}</span>
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
                    className={`ml-4 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      skill.enabled
                        ? 'bg-blue-600 text-white hover:bg-blue-500'
                        : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
                    }`}
                  >
                    {skill.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
