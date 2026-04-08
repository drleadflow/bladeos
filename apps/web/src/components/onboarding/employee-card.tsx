'use client'

interface EmployeeCardProps {
  icon: string
  name: string
  title: string
  description: string
  pillar: 'business' | 'health' | 'wealth' | 'relationships' | 'spirituality'
  selected: boolean
  onToggle: () => void
}

const pillarColors: Record<string, { border: string; glow: string; badge: string; text: string }> = {
  business: {
    border: 'border-blue-500/60',
    glow: 'shadow-blue-500/20',
    badge: 'bg-blue-500/10 text-blue-400',
    text: 'text-blue-400',
  },
  health: {
    border: 'border-emerald-500/60',
    glow: 'shadow-emerald-500/20',
    badge: 'bg-emerald-500/10 text-emerald-400',
    text: 'text-emerald-400',
  },
  wealth: {
    border: 'border-amber-500/60',
    glow: 'shadow-amber-500/20',
    badge: 'bg-amber-500/10 text-amber-400',
    text: 'text-amber-400',
  },
  relationships: {
    border: 'border-pink-500/60',
    glow: 'shadow-pink-500/20',
    badge: 'bg-pink-500/10 text-pink-400',
    text: 'text-pink-400',
  },
  spirituality: {
    border: 'border-purple-500/60',
    glow: 'shadow-purple-500/20',
    badge: 'bg-purple-500/10 text-purple-400',
    text: 'text-purple-400',
  },
}

export function EmployeeCard({
  icon,
  name,
  title,
  description,
  pillar,
  selected,
  onToggle,
}: EmployeeCardProps) {
  const colors = pillarColors[pillar] ?? pillarColors.business

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`
        group relative flex w-full flex-col rounded-xl border p-4 text-left
        transition-all duration-200 ease-out
        ${
          selected
            ? `${colors.border} bg-zinc-900/80 shadow-lg ${colors.glow}`
            : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/60'
        }
      `}
    >
      {/* Selection indicator */}
      <div
        className={`
          absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full border-2
          transition-all duration-200
          ${
            selected
              ? `${colors.border} bg-gradient-to-br from-blue-500 to-blue-600`
              : 'border-zinc-700 bg-zinc-800'
          }
        `}
      >
        {selected && (
          <svg
            className="h-3 w-3 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>

      {/* Icon + Name */}
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-zinc-100">{name}</h3>
          <span className={`text-xs font-medium ${colors.text}`}>{title}</span>
        </div>
      </div>

      {/* Description */}
      <p className="mt-2 text-xs leading-relaxed text-zinc-400">{description}</p>
    </button>
  )
}
