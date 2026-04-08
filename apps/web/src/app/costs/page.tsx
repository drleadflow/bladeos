'use client'

import { useEffect, useState } from 'react'

interface CostData {
  totalUsd: number
  byModel: Record<string, number>
  byDay: Record<string, number>
  tokenCount: { input: number; output: number }
}

function formatUsd(value: number): string {
  return `$${value.toFixed(4)}`
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(value)
}

export default function CostsPage() {
  const [data, setData] = useState<CostData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchCosts() {
      try {
        const res = await fetch('/api/costs')
        const json = await res.json()
        if (json.success) {
          setData(json.data)
        } else {
          setError(json.error ?? 'Failed to load costs')
        }
      } catch {
        setError('Network error')
      } finally {
        setLoading(false)
      }
    }
    fetchCosts()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-zinc-500">Loading costs...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-red-400">{error ?? 'No data'}</p>
      </div>
    )
  }

  const modelEntries = Object.entries(data.byModel).sort(([, a], [, b]) => b - a)
  const dayEntries = Object.entries(data.byDay).sort(([a], [b]) => b.localeCompare(a))
  const maxModelCost = modelEntries.length > 0 ? Math.max(...modelEntries.map(([, v]) => v)) : 1

  return (
    <div className="min-h-screen bg-zinc-950 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-zinc-100 mb-8">Costs</h1>

        {/* Total Spend */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
          <p className="text-sm text-zinc-500 mb-1">Total Spend (30 days)</p>
          <p className="text-4xl font-bold text-zinc-100">${data.totalUsd.toFixed(4)}</p>
          <div className="flex gap-6 mt-4 text-sm">
            <div>
              <span className="text-zinc-500">Input tokens: </span>
              <span className="text-zinc-300 font-medium">{formatTokens(data.tokenCount.input)}</span>
            </div>
            <div>
              <span className="text-zinc-500">Output tokens: </span>
              <span className="text-zinc-300 font-medium">{formatTokens(data.tokenCount.output)}</span>
            </div>
            <div>
              <span className="text-zinc-500">Total tokens: </span>
              <span className="text-zinc-300 font-medium">
                {formatTokens(data.tokenCount.input + data.tokenCount.output)}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* By Model */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase mb-4">By Model</h2>
            {modelEntries.length === 0 ? (
              <p className="text-zinc-500 text-sm">No data yet</p>
            ) : (
              <div className="space-y-3">
                {modelEntries.map(([model, cost]) => (
                  <div key={model}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-zinc-300 truncate mr-2">{model}</span>
                      <span className="text-zinc-400 font-mono shrink-0">{formatUsd(cost)}</span>
                    </div>
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${(cost / maxModelCost) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* By Day */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase mb-4">By Day</h2>
            {dayEntries.length === 0 ? (
              <p className="text-zinc-500 text-sm">No data yet</p>
            ) : (
              <div className="space-y-2">
                {dayEntries.map(([day, cost]) => (
                  <div key={day} className="flex items-center justify-between text-sm">
                    <span className="text-zinc-400">{day}</span>
                    <span className="text-zinc-300 font-mono">{formatUsd(cost)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
