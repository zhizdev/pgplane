import { ChevronRight } from 'lucide-react'
import { cn } from '#/lib/utils'

export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  className,
}: {
  title: string
  description?: string
  icon?: React.ComponentType<{ className?: string }>
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <header
      className={cn(
        'flex h-12 shrink-0 items-center gap-3 border-b border-border bg-sidebar px-4',
        className,
      )}
    >
      {Icon ? <Icon className="size-[18px] text-foreground/45" /> : null}
      <div className="min-w-0">
        <h1 className="truncate text-[13px] font-semibold leading-none tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-1 truncate text-[11px] text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="ml-auto flex items-center gap-2">{actions}</div>
    </header>
  )
}

/** Big editorial title used on the Overview hero (mirrors Supabase's project header). */
export function PageTitle({
  title,
  subtitle,
  actions,
  className,
}: {
  title: string
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start gap-4', className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? (
          <div className="mt-1.5 text-sm text-muted-foreground">{subtitle}</div>
        ) : null}
      </div>
      {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  href,
  accent,
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  href?: boolean
  accent?: boolean
}) {
  return (
    <div className="group relative rounded-lg border border-border bg-surface-100 p-4 transition-colors hover:border-border-strong hover:bg-surface-200/50">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
          {label}
        </span>
        {Icon ? <Icon className="size-3.5 text-muted-foreground/60" /> : null}
        {href ? (
          <ChevronRight className="ml-auto size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
        ) : null}
      </div>
      <div
        className={cn(
          'mt-2.5 text-[26px] font-medium leading-none tracking-tight tabular-nums',
          accent && 'text-primary',
        )}
      >
        {value}
      </div>
      {sub ? <div className="mt-2 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  )
}
