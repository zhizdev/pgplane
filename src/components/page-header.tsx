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
        'flex h-14 shrink-0 items-center gap-3 border-b border-border px-5',
        className,
      )}
    >
      {Icon ? <Icon className="size-5 text-muted-foreground" /> : null}
      <div className="min-w-0">
        <h1 className="truncate text-sm font-semibold tracking-tight leading-none">{title}</h1>
        {description ? (
          <p className="truncate text-xs text-muted-foreground mt-1">{description}</p>
        ) : null}
      </div>
      <div className="ml-auto flex items-center gap-2">{actions}</div>
    </header>
  )
}

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {Icon ? <Icon className="size-4 text-muted-foreground/70" /> : null}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  )
}
