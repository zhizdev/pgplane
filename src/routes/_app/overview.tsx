import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Boxes,
  Database,
  GaugeCircle,
  HardDrive,
  Network,
  Timer,
  Zap,
} from 'lucide-react'
import { connectionsFn, overviewFn, tableSizesFn } from '#/server/fns'
import { PageHeader, StatCard } from '#/components/page-header'
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

  return (
    <>
      <PageHeader
        title="Overview"
        description={o.serverVersion ? `PostgreSQL ${o.serverVersion}` : undefined}
        icon={GaugeCircle}
      />
      <div className="flex-1 overflow-auto p-5 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          <StatCard label="Database size" value={formatBytes(o.sizeBytes)} icon={HardDrive} sub={o.database} />
          <StatCard
            label="Cache hit ratio"
            value={percent(o.cacheHitRatio)}
            icon={Zap}
            sub={`${formatCompact(o.blksHit)} hits / ${formatCompact(o.blksRead)} reads`}
          />
          <StatCard
            label="Connections"
            value={`${o.backends} / ${o.maxConnections}`}
            icon={Network}
            sub={`${connTotal} tracked backends`}
          />
          <StatCard label="Uptime" value={formatUptime(o.uptimeSeconds)} icon={Timer} sub={o.startedAt ?? undefined} />
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
            label="Deadlocks"
            value={formatNumber(o.deadlocks)}
            sub={`${formatNumber(o.tempFiles)} temp files · ${formatBytes(o.tempBytes)}`}
          />
          <StatCard
            label="pg_stat_statements"
            value={o.hasPgStatStatements ? 'enabled' : 'off'}
            sub={o.hasPgStatStatements ? 'query insights available' : 'enable for query insights'}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-medium">Largest tables</h2>
              <Link to="/performance" className="text-xs text-primary hover:underline">
                View all
              </Link>
            </div>
            <div className="divide-y divide-border">
              {tables.slice(0, 8).map((t) => (
                <div key={`${t.schema}.${t.name}`} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/editor"
                      search={{ schema: t.schema, table: t.name }}
                      className="font-mono text-sm hover:text-primary truncate block"
                    >
                      {t.schema}.{t.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {formatCompact(t.estRows)} rows · idx {formatBytes(t.indexBytes)}
                    </div>
                  </div>
                  <div className="text-sm tabular-nums">{formatBytes(t.totalBytes)}</div>
                </div>
              ))}
              {tables.length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">No tables found.</div>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-medium">Connections by state</h2>
            </div>
            <div className="p-4 space-y-3">
              {connections.map((c) => {
                const pct = connTotal ? (c.count / connTotal) * 100 : 0
                return (
                  <div key={c.state}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-mono text-xs">{c.state}</span>
                      <span className="tabular-nums text-muted-foreground">{c.count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
