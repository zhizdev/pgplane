import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Database, KeyRound, Table2 } from 'lucide-react'
import { z } from 'zod'
import { schemasFn, tableDetailFn, tablesFn } from '#/server/fns'
import { PageHeader } from '#/components/page-header'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { formatBytes, formatCompact } from '#/lib/format'
import { cn } from '#/lib/utils'

const search = z.object({
  schema: z.string().optional(),
  table: z.string().optional(),
})

export const Route = createFileRoute('/_app/database')({
  validateSearch: search,
  loaderDeps: ({ search: s }) => ({ schema: s.schema, table: s.table }),
  loader: async ({ deps }) => {
    const schemas = await schemasFn()
    const schema =
      deps.schema && schemas.some((s) => s.name === deps.schema)
        ? deps.schema
        : (schemas.find((s) => s.name === 'public')?.name ?? schemas[0]?.name)
    const tables = schema ? await tablesFn({ data: { schema } }) : []
    const table = deps.table && tables.some((t) => t.name === deps.table) ? deps.table : undefined
    const detail = schema && table ? await tableDetailFn({ data: { schema, table } }) : null
    return { schemas, schema, tables, table, detail }
  },
  component: DatabasePage,
})

function DatabasePage() {
  const { schemas, schema, tables, table, detail } = Route.useLoaderData()
  const navigate = useNavigate()

  return (
    <>
      <PageHeader title="Database" description="Schemas, tables, columns, indexes & constraints" icon={Database} />
      <div className="flex min-h-0 flex-1">
        {/* left: schema + table list */}
        <div className="flex w-72 shrink-0 flex-col border-r border-border bg-sidebar">
          <div className="p-3 border-b border-border">
            <Select
              value={schema}
              onValueChange={(v) => navigate({ to: '/database', search: { schema: v } })}
            >
              <SelectTrigger className="w-full">
                <span className="mr-1 text-muted-foreground">schema</span>
                <SelectValue placeholder="Select schema" />
              </SelectTrigger>
              <SelectContent>
                {schemas.map((s) => (
                  <SelectItem key={s.name} value={s.name}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 overflow-auto p-2 space-y-px">
            {tables.map((t) => (
              <Link
                key={t.name}
                to="/database"
                search={{ schema, table: t.name }}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition-colors',
                  t.name === table
                    ? 'bg-surface-200 text-foreground ring-1 ring-inset ring-border'
                    : 'text-foreground/70 hover:bg-surface-200/60 hover:text-foreground',
                )}
              >
                <Table2
                  className={cn(
                    'size-3.5 shrink-0',
                    t.name === table ? 'text-primary' : 'text-muted-foreground',
                  )}
                />
                <span className="truncate font-mono text-[13px]">{t.name}</span>
                {t.kind !== 'table' ? (
                  <Badge variant="outline" className="ml-auto text-[10px] px-1 py-0">
                    {t.kind}
                  </Badge>
                ) : (
                  <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                    {formatCompact(t.estRows)}
                  </span>
                )}
              </Link>
            ))}
            {tables.length === 0 ? (
              <div className="px-2 py-4 text-sm text-muted-foreground">No tables in this schema.</div>
            ) : null}
          </div>
        </div>

        {/* right: detail */}
        <div className="min-w-0 flex-1 overflow-auto">
          {detail && table ? (
            <TableDetail schema={schema!} table={table} detail={detail} />
          ) : (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              Select a table to inspect its structure.
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function TableDetail({
  schema,
  table,
  detail,
}: {
  schema: string
  table: string
  detail: NonNullable<Awaited<ReturnType<typeof tableDetailFn>>>
}) {
  const t = detail.table
  return (
    <div className="p-5 space-y-5">
      <div className="flex items-center gap-3">
        <div>
          <h2 className="font-mono text-lg">
            {schema}.{table}
          </h2>
          {t ? (
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatCompact(t.estRows)} rows · {formatBytes(t.totalBytes)} total · {formatBytes(t.indexBytes)} indexes
              {t.comment ? ` · ${t.comment}` : ''}
            </p>
          ) : null}
        </div>
        <Button asChild size="sm" className="ml-auto">
          <Link to="/editor" search={{ schema, table }}>
            Open in editor
          </Link>
        </Button>
      </div>

      <section>
        <h3 className="text-sm font-medium mb-2">Columns</h3>
        <div className="rounded-lg border border-border bg-surface-100 overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead className="border-b border-border bg-surface-200/50 text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-3 py-2">Name</th>
                <th className="text-left font-medium px-3 py-2">Type</th>
                <th className="text-left font-medium px-3 py-2">Nullable</th>
                <th className="text-left font-medium px-3 py-2">Default</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {detail.columns.map((c) => (
                <tr key={c.name} className="hover:bg-surface-200/50">
                  <td className="px-3 py-2 font-mono text-[13px]">
                    <span className="inline-flex items-center gap-1.5">
                      {c.isPrimaryKey ? (
                        <KeyRound className="size-3 text-primary" />
                      ) : null}
                      {c.name}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-primary">{c.dataType}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {c.notNull ? 'NOT NULL' : 'nullable'}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground truncate max-w-xs">
                    {c.isIdentity ? 'identity' : (c.default ?? '—')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section>
          <h3 className="text-sm font-medium mb-2">Indexes</h3>
          <div className="rounded-lg border border-border bg-surface-100 divide-y divide-border">
            {detail.indexes.map((ix) => (
              <div key={ix.name} className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[13px]">{ix.name}</span>
                  {ix.isPrimary ? <Badge>PK</Badge> : null}
                  {ix.isUnique && !ix.isPrimary ? <Badge variant="secondary">unique</Badge> : null}
                  <span className="ml-auto text-xs text-muted-foreground">{formatBytes(ix.bytes)}</span>
                </div>
                <code className="mt-1 block text-[11px] text-muted-foreground break-all">{ix.def}</code>
              </div>
            ))}
            {detail.indexes.length === 0 ? (
              <div className="px-3 py-4 text-sm text-muted-foreground">No indexes.</div>
            ) : null}
          </div>
        </section>

        <section>
          <h3 className="text-sm font-medium mb-2">Constraints</h3>
          <div className="rounded-lg border border-border bg-surface-100 divide-y divide-border">
            {detail.constraints.map((c) => (
              <div key={c.name} className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[13px]">{c.name}</span>
                  <Badge variant="outline">{constraintLabel(c.type)}</Badge>
                </div>
                <code className="mt-1 block text-[11px] text-muted-foreground break-all">{c.def}</code>
              </div>
            ))}
            {detail.constraints.length === 0 ? (
              <div className="px-3 py-4 text-sm text-muted-foreground">No constraints.</div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  )
}

function constraintLabel(type: string): string {
  return (
    { p: 'primary key', f: 'foreign key', u: 'unique', c: 'check', x: 'exclude' }[type] ?? type
  )
}
