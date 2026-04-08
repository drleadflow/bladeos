'use client'

interface ArchetypePickerProps {
  selected: 'coach' | 'operator' | null
  onSelect: (archetype: 'coach' | 'operator') => void
}

export function ArchetypePicker({ selected, onSelect }: ArchetypePickerProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* The Coach */}
      <button
        type="button"
        onClick={() => onSelect('coach')}
        className={`
          group relative flex flex-col rounded-xl border p-5 text-left
          transition-all duration-200 ease-out
          ${
            selected === 'coach'
              ? 'border-amber-500/60 bg-gradient-to-br from-amber-950/30 to-zinc-900 shadow-lg shadow-amber-500/10'
              : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/60'
          }
        `}
      >
        {/* Radio indicator */}
        <div className="absolute right-4 top-4">
          <div
            className={`
              flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all duration-200
              ${
                selected === 'coach'
                  ? 'border-amber-500 bg-amber-500'
                  : 'border-zinc-700 bg-zinc-800'
              }
            `}
          >
            {selected === 'coach' && (
              <div className="h-2 w-2 rounded-full bg-white" />
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-3xl">🧘</span>
          <div>
            <h3 className="text-base font-bold text-zinc-100">The Coach</h3>
            <span className="text-xs font-medium text-amber-400">Warm + Reflective</span>
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          Nurturing, reflective, asks questions, celebrates progress. Your AI team leads with empathy and encouragement.
        </p>
      </button>

      {/* The Operator */}
      <button
        type="button"
        onClick={() => onSelect('operator')}
        className={`
          group relative flex flex-col rounded-xl border p-5 text-left
          transition-all duration-200 ease-out
          ${
            selected === 'operator'
              ? 'border-red-500/60 bg-gradient-to-br from-red-950/30 to-zinc-900 shadow-lg shadow-red-500/10'
              : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/60'
          }
        `}
      >
        {/* Radio indicator */}
        <div className="absolute right-4 top-4">
          <div
            className={`
              flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all duration-200
              ${
                selected === 'operator'
                  ? 'border-red-500 bg-red-500'
                  : 'border-zinc-700 bg-zinc-800'
              }
            `}
          >
            {selected === 'operator' && (
              <div className="h-2 w-2 rounded-full bg-white" />
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-3xl">⚡</span>
          <div>
            <h3 className="text-base font-bold text-zinc-100">The Operator</h3>
            <span className="text-xs font-medium text-red-400">Direct + Metrics-Driven</span>
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          Direct, metrics-obsessed, pushes hard, calls out BS. Your AI team operates like a high-performance machine.
        </p>
      </button>
    </div>
  )
}
