/**
 * Sparkline — inline SVG mini chart with optional gradient fill.
 * Matches the reference dashboard aesthetic (dark bg, colored lines).
 */

interface SparklineProps {
  data: number[]
  color?: 'cyan' | 'emerald' | 'amber' | 'rose' | 'blue' | 'pink' | 'yellow'
  gradient?: boolean
  width?: number
  height?: number
}

const COLOR_MAP: Record<string, { stroke: string; fill: string }> = {
  cyan: { stroke: '#22d3ee', fill: 'rgba(34,211,238,0.15)' },
  emerald: { stroke: '#10b981', fill: 'rgba(16,185,129,0.15)' },
  amber: { stroke: '#f59e0b', fill: 'rgba(245,158,11,0.15)' },
  rose: { stroke: '#f43f5e', fill: 'rgba(244,63,94,0.15)' },
  blue: { stroke: '#3b82f6', fill: 'rgba(59,130,246,0.15)' },
  pink: { stroke: '#ec4899', fill: 'rgba(236,72,153,0.15)' },
  yellow: { stroke: '#eab308', fill: 'rgba(234,179,8,0.15)' },
}

// Gradient that transitions from one color to another (like the reference)
const GRADIENT_COLORS: Record<string, { start: string; end: string }> = {
  cyan: { start: '#22d3ee', end: '#3b82f6' },
  emerald: { start: '#10b981', end: '#22d3ee' },
  amber: { start: '#eab308', end: '#10b981' },
  rose: { start: '#f43f5e', end: '#ec4899' },
  blue: { start: '#3b82f6', end: '#8b5cf6' },
  pink: { start: '#ec4899', end: '#f43f5e' },
  yellow: { start: '#eab308', end: '#f59e0b' },
}

export function Sparkline({
  data,
  color = 'cyan',
  gradient = false,
  width = 200,
  height = 40,
}: SparklineProps) {
  if (data.length < 2) {
    return (
      <svg width={width} height={height} className="opacity-30">
        <text x={width / 2} y={height / 2} textAnchor="middle" fill="#71717a" fontSize={10}>
          No data
        </text>
      </svg>
    )
  }

  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const padding = 2

  const points = data.map((value, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2)
    const y = padding + (1 - (value - min) / range) * (height - padding * 2)
    return { x, y }
  })

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')

  const areaPath = `${linePath} L${points[points.length - 1].x},${height} L${points[0].x},${height} Z`

  const gradientId = `spark-grad-${color}-${Math.random().toString(36).slice(2, 6)}`
  const fillGradientId = `spark-fill-${color}-${Math.random().toString(36).slice(2, 6)}`
  const colors = COLOR_MAP[color] ?? COLOR_MAP.cyan
  const gradColors = GRADIENT_COLORS[color] ?? GRADIENT_COLORS.cyan

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        {gradient && (
          <>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={gradColors.start} />
              <stop offset="100%" stopColor={gradColors.end} />
            </linearGradient>
            <linearGradient id={fillGradientId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={gradColors.start} stopOpacity="0.2" />
              <stop offset="100%" stopColor={gradColors.end} stopOpacity="0.05" />
            </linearGradient>
          </>
        )}
      </defs>
      {/* Fill area */}
      <path
        d={areaPath}
        fill={gradient ? `url(#${fillGradientId})` : colors.fill}
      />
      {/* Line */}
      <path
        d={linePath}
        fill="none"
        stroke={gradient ? `url(#${gradientId})` : colors.stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
