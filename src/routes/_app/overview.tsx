import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Activity,
  Boxes,
  Clock,
  Database,
  HardDrive,
  Network,
  Server,
  Timer,
  Zap,
} from 'lucide-react'
import { connectionsFn, overviewFn, tableSizesFn } from '#/server/fns'
import { PageTitle, StatCard } from '#/components/page-header'
import {
  formatBytes,
  formatCompact,
  formatNumber,
  formatUptime,
  percent,
} from '#/lib/format'

export const Route = createFileRoute('/_app/overview')({
  loader: async () => {
    const [overview, connections, tables] = await Promise.all([
      overviewFn(),
      connectionsFn(),
      tableSizesFn(),
    ])
    return { overview, connections, tables }
  },
  component: OverviewPage,
})

function OverviewPage() {
  const { overview: o, connections, tables } = Route.useLoaderData()
  const connTotal = connections.reduce((s, c) => s + c.count, 0)
  const connPct = o.maxConnections ? (o.backends / o.maxConnections) * 100 : 0

  return (
    <div className="flex-1 overflow-auto animate-fade-up">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 border-b border-border p-6 xl:grid-cols-[1fr_minmax(340px,440px)]">
        <div className="min-w-0">
          <PageTitle
            title={o.database}
            subtitle={
              <span className="font-mono text-[13px] text-muted-foreground">
                {o.serverVersion ? `PostgreSQL ${o.serverVersion}` : 'PostgreSQL'}
              </span>
            }
          />

          <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3">
            <StatusTile icon={Activity} label="Status" value={<HealthyValue />} />
            <StatusTile
              icon={Server}
              label="Connection"
              value={o.cacheHitRatio != null ? 'Healthy' : 'Connected'}
            />
            <StatusTile
              icon={Network}
              label="Backends"
              value={`${o.backends} / ${o.maxConnections}`}
            />
            <StatusTile icon={HardDrive} label="Database size" value={formatBytes(o.sizeBytes)} />
            <StatusTile icon={Timer} label="Uptime" value={formatUptime(o.uptimeSeconds)} />
            <StatusTile
              icon={Zap}
              label="pg_stat_statements"
              value={o.hasPgStatStatements ? 'Enabled' : 'Off'}
            />
          </div>
        </div>

        {/* compute / live status panel */}
        <ComputePanel
          host={o.database}
          ssl={o.serverVersion ? `v${o.serverVersion}` : 'postgres'}
          cacheHit={o.cacheHitRatio}
          backends={o.backends}
          maxConnections={o.maxConnections}
          connPct={connPct}
          sizeBytes={o.sizeBytes}
        />
      </div>

      {/* ── Metrics ──────────────────────────────────────────────────────── */}
      <div className="space-y-6 p-6">
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground/90">
            Cluster activity
            <span className="text-xs font-normal text-muted-foreground">since startup</span>
          </h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            <StatCard
              label="Cache hit ratio"
              value={percent(o.cacheHitRatio)}
              icon={Zap}
              accent
              sub={`${formatCompact(o.blksHit)} hits / ${formatCompact(o.blksRead)} reads`}
            />
            <StatCard
              label="Connections"
              value={`${o.backends} / ${o.maxConnections}`}
              icon={Network}
              sub={`${connTotal} tracked backends`}
            />
            <StatCard
              label="Commits"
              value={formatCompact(o.commits)}
              icon={Database}
              sub={`${formatCompact(o.rollbacks)} rollbacks`}
            />
            <StatCard
              label="Tuples written"
              value={formatCompact(o.tupInserted + o.tupUpdated + o.tupDeleted)}
              icon={Boxes}
              sub={`${formatCompact(o.tupInserted)} ins · ${formatCompact(o.tupUpdated)} upd · ${formatCompact(o.tupDeleted)} del`}
            />
            <StatCard
              label="Database size"
              value={formatBytes(o.sizeBytes)}
              icon={HardDrive}
              sub={o.database}
            />
            <StatCard
              label="Uptime"
              value={formatUptime(o.uptimeSeconds)}
              icon={Clock}
              sub={o.startedAt ?? undefined}
            />
            <StatCard
              label="Deadlocks"
              value={formatNumber(o.deadlocks)}
              sub={`${formatNumber(o.tempFiles)} temp files · ${formatBytes(o.tempBytes)}`}
            />
            <StatCard
              label="Query insights"
              value={o.hasPgStatStatements ? 'On' : 'Off'}
              accent={o.hasPgStatStatements}
              sub={o.hasPgStatStatements ? 'pg_stat_statements active' : 'enable for query stats'}
            />
          </div>
        </section>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Panel
            title="Largest tables"
            action={
              <Link to="/performance" className="text-xs text-primary hover:underline">
                View all
              </Link>
            }
          >
            <div className="divide-y divide-border">
              {tables.slice(0, 8).map((t) => (
                <div key={`${t.schema}.${t.name}`} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/editor"
                      search={{ schema: t.schema, table: t.name }}
                      className="block truncate font-mono text-[13px] hover:text-primary"
                    >
                      {t.schema}.{t.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {formatCompact(t.estRows)} rows · idx {formatBytes(t.indexBytes)}
                    </div>
                  </div>
                  <div className="text-[13px] tabular-nums text-foreground/80">
                    {formatBytes(t.totalBytes)}
                  </div>
                </div>
              ))}
              {tables.length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">No tables found.</div>
              ) : null}
            </div>
          </Panel>

          <Panel title="Connections by state">
            <div className="space-y-3.5 p-4">
              {connections.map((c) => {
                const pct = connTotal ? (c.count / connTotal) * 100 : 0
                return (
                  <div key={c.state}>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="font-mono text-xs text-foreground/80">{c.state}</span>
                      <span className="tabular-nums text-muted-foreground">{c.count}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-300">
                      <div
                        className="h-full rounded-full bg-primary/80"
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
              {connections.length === 0 ? (
                <div className="text-sm text-muted-foreground">No tracked connections.</div>
              ) : null}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}

function HealthyValue() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-1.5 rounded-full bg-primary shadow-[0_0_6px] shadow-primary/60" />
      Healthy
    </span>
  )
}

function StatusTile({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-md border border-border bg-surface-200 text-foreground/60">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
          {label}
        </div>
        <div className="mt-1 truncate text-[15px] font-medium">{value}</div>
      </div>
    </div>
  )
}

function ComputePanel({
  host,
  ssl,
  cacheHit,
  backends,
  maxConnections,
  connPct,
  sizeBytes,
}: {
  host: string
  ssl: string
  cacheHit: number | null
  backends: number
  maxConnections: number
  connPct: number
  sizeBytes: number
}) {
  return (
    <div className="dot-grid relative overflow-hidden rounded-xl border border-border bg-surface-100/40 p-4">
      <div className="surface-elevated rounded-lg p-4 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
        <div className="flex items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/12 text-primary ring-1 ring-primary/25">
            <Database className="size-4.5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium">Primary Database</div>
            <div className="truncate font-mono text-[11px] text-muted-foreground" title={host}>
              {host} · {ssl}
            </div>
          </div>
          <span className="ml-auto rounded-full border border-primary/30 bg-primary/10 px-2 py-[3px] text-[10px] font-medium text-primary">
            Online
          </span>
        </div>

        <div className="mt-4 space-y-3.5">
          <Gauge label="Cache hit" value={percent(cacheHit)} pct={cacheHit ?? 0} />
          <Gauge
            label="Connections"
            value={`${backends} / ${maxConnections}`}
            pct={connPct}
          />
          <div className="flex items-center justify-between border-t border-border pt-3">
            <span className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
              Size
            </span>
            <span className="text-[13px] font-medium tabular-nums">{formatBytes(sizeBytes)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function Gauge({ label, value, pct }: { label: string; value: string; pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct))
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
          {label}
        </span>
        <span className="text-[12px] font-medium tabular-nums text-foreground/90">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-300">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(clamped, 2)}%` }} />
      </div>
    </div>
  )
}

function Panel({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface-100">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="text-[13px] font-medium">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  )
}
