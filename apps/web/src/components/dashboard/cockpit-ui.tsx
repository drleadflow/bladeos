import type { ReactNode } from 'react'

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

export function PageShell({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow: string
  title: string
  description: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="min-h-screen px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-8 rounded-[2rem] border border-white/10 bg-white/[0.04] px-6 py-7 shadow-[0_24px_90px_rgba(0,0,0,0.32)] backdrop-blur-xl sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-3xl">
              <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-cyan-300/80">
                {eyebrow}
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
                {title}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-400 sm:text-base">
                {description}
              </p>
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Panel({
  children,
  className,
  glow = 'none',
}: {
  children: ReactNode
  className?: string
  glow?: 'none' | 'cyan' | 'emerald' | 'amber' | 'rose'
}) {
  const glowClass =
    glow === 'cyan'
      ? 'shadow-[0_20px_70px_rgba(34,211,238,0.08)]'
      : glow === 'emerald'
        ? 'shadow-[0_20px_70px_rgba(16,185,129,0.08)]'
        : glow === 'amber'
          ? 'shadow-[0_20px_70px_rgba(245,158,11,0.08)]'
          : glow === 'rose'
            ? 'shadow-[0_20px_70px_rgba(244,63,94,0.08)]'
            : 'shadow-[0_18px_60px_rgba(0,0,0,0.24)]'

  return (
    <section
      className={cx(
        'rounded-[1.75rem] border border-white/10 bg-white/[0.045] p-5 backdrop-blur-xl',
        glowClass,
        className
      )}
    >
      {children}
    </section>
  )
}

export function PanelHeader({
  eyebrow,
  title,
  description,
  aside,
}: {
  eyebrow?: string
  title: string
  description?: string
  aside?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div>
        {eyebrow ? (
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-zinc-500">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="mt-1 text-lg font-semibold text-zinc-100">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-zinc-400">{description}</p>
        ) : null}
      </div>
      {aside ? <div>{aside}</div> : null}
    </div>
  )
}

export function MetricCard({
  label,
  value,
  hint,
  accent = 'cyan',
}: {
  label: string
  value: string | number
  hint?: string
  accent?: 'cyan' | 'emerald' | 'amber' | 'rose' | 'blue'
}) {
  const accentClasses: Record<string, string> = {
    cyan: 'from-cyan-300/20 to-blue-500/5 text-cyan-200',
    emerald: 'from-emerald-300/20 to-emerald-500/5 text-emerald-200',
    amber: 'from-amber-300/20 to-amber-500/5 text-amber-100',
    rose: 'from-rose-300/20 to-rose-500/5 text-rose-100',
    blue: 'from-blue-300/20 to-indigo-500/5 text-blue-100',
  }

  return (
    <div className={cx('rounded-[1.5rem] border border-white/10 bg-gradient-to-br p-4', accentClasses[accent])}>
      <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-zinc-50">{value}</p>
      {hint ? <p className="mt-2 text-sm text-zinc-400">{hint}</p> : null}
    </div>
  )
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'cyan' | 'emerald' | 'amber' | 'rose' | 'blue'
}) {
  const toneClasses: Record<string, string> = {
    neutral: 'border-white/10 bg-white/[0.05] text-zinc-300',
    cyan: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-300',
    emerald: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
    amber: 'border-amber-400/20 bg-amber-400/10 text-amber-200',
    rose: 'border-rose-400/20 bg-rose-400/10 text-rose-200',
    blue: 'border-blue-400/20 bg-blue-400/10 text-blue-200',
  }

  return (
    <span className={cx('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em]', toneClasses[tone])}>
      {children}
    </span>
  )
}

export function StatusDot({
  tone = 'cyan',
}: {
  tone?: 'cyan' | 'emerald' | 'amber' | 'rose' | 'neutral'
}) {
  const toneClass: Record<string, string> = {
    cyan: 'bg-cyan-400',
    emerald: 'bg-emerald-400',
    amber: 'bg-amber-400',
    rose: 'bg-rose-400',
    neutral: 'bg-zinc-500',
  }

  return <span className={cx('inline-block h-2.5 w-2.5 rounded-full shadow-[0_0_18px_currentColor]', toneClass[tone])} />
}

export function EmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-white/[0.03] px-6 py-10 text-center">
      <p className="text-lg font-medium text-zinc-200">{title}</p>
      <p className="mt-2 text-sm text-zinc-500">{description}</p>
    </div>
  )
}

export function ActionButton({
  href,
  children,
  tone = 'primary',
}: {
  href: string
  children: ReactNode
  tone?: 'primary' | 'secondary'
}) {
  const base =
    tone === 'primary'
      ? 'bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-600 text-zinc-950 hover:scale-[1.01]'
      : 'border border-white/10 bg-white/[0.04] text-zinc-200 hover:border-white/20 hover:bg-white/[0.08]'

  return (
    <a
      href={href}
      className={cx(
        'inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-200',
        base
      )}
    >
      {children}
    </a>
  )
}
