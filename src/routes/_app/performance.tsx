import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Activity, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import {
  activityFn,
  indexStatsFn,
  tableSizesFn,
  topQueriesFn,
} from '#/server/fns'
import { PageHeader } from '#/components/page-header'
import { Button } from '#/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { Badge } from '#/components/ui/badge'
import { formatBytes, formatCompact, formatDurationMs, formatNumber } from '#/lib/format'

export const Route = createFileRoute('/_app/performance')({
  loader: async () => {
    const [topQueries, activity, indexes, tables] = await Promise.all([
      topQueriesFn(),
      activityFn(),
      indexStatsFn(),
      tableSizesFn(),
    ])
    return { topQueries, activity, indexes, tables }
  },
  component: PerformancePage,
})

function PerformancePage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)
  async function refresh() {
    setRefreshing(true)
    await router.invalidate()
    setRefreshing(false)
  }

  return (
    <>
      <PageHeader
        title="Performance"
        description="Query insights, live activity, storage & index usage"
        icon={Activity}
        actions={
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={refreshing ? 'size-4 animate-spin' : 'size-4'} />
            Refresh
          </Button>
        }
      />
      <div className="flex-1 overflow-hidden p-5">
        <Tabs defaultValue="queries" className="h-full flex flex-col">
          <TabsList>
            <TabsTrigger value="queries">Top queries</TabsTrigger>
            <TabsTrigger value="activity">
              Activity
              <Badge variant="secondary" className="ml-1.5">
                {data.activity.filter((a) => a.state === 'active').length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="tables">Tables</TabsTrigger>
            <TabsTrigger value="indexes">Indexes</TabsTrigger>
          </TabsList>

          <TabsContent value="queries" className="flex-1 overflow-auto mt-3">
            <TopQueries data={data.topQueries} />
          </TabsContent>
          <TabsContent value="activity" className="flex-1 overflow-auto mt-3">
            <ActivityTable data={data.activity} />
          </TabsContent>
          <TabsContent value="tables" className="flex-1 overflow-auto mt-3">
            <TablesTable data={data.tables} />
          </TabsContent>
          <TabsContent value="indexes" className="flex-1 overflow-auto mt-3">
            <IndexesTable data={data.indexes} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}

function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`text-left font-medium text-muted-foreground px-3 py-2 ${className}`}>
      {children}
    </th>
  )
}
function Td({
  children,
  className = '',
  colSpan,
}: {
  children?: React.ReactNode
  className?: string
  colSpan?: number
}) {
  return (
    <td colSpan={colSpan} className={`px-3 py-2 align-top ${className}`}>
      {children}
    </td>
  )
}

function TopQueries({ data }: { data: Awaited<ReturnType<typeof topQueriesFn>> }) {
  if (data === null) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        <code>pg_stat_statements</code> is not enabled on this database. Enable it (add to{' '}
        <code>shared_preload_libraries</code> and run{' '}
        <code>CREATE EXTENSION pg_stat_statements;</code>) to see aggregated query performance.
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <table className="w-full text-sm border-collapse">
        <thead className="border-b border-border bg-muted/30">
          <tr>
            <Th>Query</Th>
            <Th className="text-right">Calls</Th>
            <Th className="text-right">Total</Th>
            <Th className="text-right">Mean</Th>
            <Th className="text-right">Rows</Th>
            <Th className="text-right">Cache</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.map((q, i) => (
            <tr key={q.queryid ?? i} className="hover:bg-accent/30">
              <Td className="max-w-xl">
                <code className="block truncate font-mono text-xs text-foreground/90" title={q.query}>
                  {q.query}
                </code>
              </Td>
              <Td className="text-right tabular-nums">{formatCompact(q.calls)}</Td>
              <Td className="text-right tabular-nums">{formatDurationMs(q.totalExecMs)}</Td>
              <Td className="text-right tabular-nums font-medium">{formatDurationMs(q.meanExecMs)}</Td>
              <Td className="text-right tabular-nums">{formatCompact(q.rows)}</Td>
              <Td className="text-right tabular-nums">
                {q.hitPercent == null ? '—' : `${q.hitPercent.toFixed(0)}%`}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ActivityTable({ data }: { data: Awaited<ReturnType<typeof activityFn>> }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <table className="w-full text-sm border-collapse">
        <thead className="border-b border-border bg-muted/30">
          <tr>
            <Th>PID</Th>
            <Th>State</Th>
            <Th>User</Th>
            <Th>Wait</Th>
            <Th className="text-right">Duration</Th>
            <Th>Query</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.map((a) => (
            <tr key={a.pid} className="hover:bg-accent/30">
              <Td className="tabular-nums">{a.pid}</Td>
              <Td>
                <Badge variant={a.state === 'active' ? 'default' : 'secondary'}>
                  {a.state ?? '—'}
                </Badge>
              </Td>
              <Td className="text-muted-foreground">{a.usename ?? '—'}</Td>
              <Td className="text-muted-foreground text-xs">
                {a.waitEventType ? `${a.waitEventType}:${a.waitEvent}` : '—'}
              </Td>
              <Td className="text-right tabular-nums">
                {a.durationSeconds != null ? `${a.durationSeconds.toFixed(1)}s` : '—'}
              </Td>
              <Td className="max-w-md">
                <code className="block truncate font-mono text-xs" title={a.query ?? ''}>
                  {a.query || a.backendType || '—'}
                </code>
              </Td>
            </tr>
          ))}
          {data.length === 0 ? (
            <tr>
              <Td className="text-muted-foreground" >No other active sessions.</Td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}

function TablesTable({ data }: { data: Awaited<ReturnType<typeof tableSizesFn>> }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <table className="w-full text-sm border-collapse">
        <thead className="border-b border-border bg-muted/30">
          <tr>
            <Th>Table</Th>
            <Th className="text-right">Est. rows</Th>
            <Th className="text-right">Total</Th>
            <Th className="text-right">Table</Th>
            <Th className="text-right">Indexes</Th>
            <Th className="text-right">Seq / Idx scans</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.map((t) => (
            <tr key={`${t.schema}.${t.name}`} className="hover:bg-accent/30">
              <Td className="font-mono text-xs">
                {t.schema}.{t.name}
              </Td>
              <Td className="text-right tabular-nums">{formatNumber(t.estRows)}</Td>
              <Td className="text-right tabular-nums font-medium">{formatBytes(t.totalBytes)}</Td>
              <Td className="text-right tabular-nums">{formatBytes(t.tableBytes)}</Td>
              <Td className="text-right tabular-nums">{formatBytes(t.indexBytes)}</Td>
              <Td className="text-right tabular-nums text-xs text-muted-foreground">
                {formatCompact(t.seqScan)} / {formatCompact(t.idxScan)}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function IndexesTable({ data }: { data: Awaited<ReturnType<typeof indexStatsFn>> }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <table className="w-full text-sm border-collapse">
        <thead className="border-b border-border bg-muted/30">
          <tr>
            <Th>Index</Th>
            <Th>Table</Th>
            <Th className="text-right">Scans</Th>
            <Th className="text-right">Size</Th>
            <Th></Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.map((ix) => (
            <tr key={`${ix.schema}.${ix.index}`} className="hover:bg-accent/30">
              <Td className="font-mono text-xs">{ix.index}</Td>
              <Td className="font-mono text-xs text-muted-foreground">
                {ix.schema}.{ix.table}
              </Td>
              <Td className="text-right tabular-nums">{formatNumber(ix.scans)}</Td>
              <Td className="text-right tabular-nums">{formatBytes(ix.bytes)}</Td>
              <Td>
                {ix.scans === 0 && !ix.isUnique ? (
                  <Badge variant="outline" className="text-amber-500 border-amber-500/40">
                    unused
                  </Badge>
                ) : null}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
