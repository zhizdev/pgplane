import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Table2,
  X,
} from 'lucide-react'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  deleteRowFn,
  insertRowFn,
  meFn,
  rowsFn,
  schemasFn,
  tablesFn,
  updateRowFn,
} from '#/server/fns'
import type { Filter as RowFilter, FilterOp, RowsResult } from '#/server/data'
import { PageHeader } from '#/components/page-header'
import { EditableGrid } from '#/components/editable-grid'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Badge } from '#/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { formatCompact, formatNumber } from '#/lib/format'
import { cn } from '#/lib/utils'

const search = z.object({
  schema: z.string().optional(),
  table: z.string().optional(),
})

const PAGE_SIZE = 100

export const Route = createFileRoute('/_app/editor')({
  validateSearch: search,
  loaderDeps: ({ search: s }) => ({ schema: s.schema }),
  loader: async ({ deps }) => {
    const [schemas, me] = await Promise.all([schemasFn(), meFn()])
    const schema =
      deps.schema && schemas.some((s) => s.name === deps.schema)
        ? deps.schema
        : (schemas.find((s) => s.name === 'public')?.name ?? schemas[0]?.name)
    const tables = schema ? await tablesFn({ data: { schema } }) : []
    return {
      schemas,
      schema,
      tables,
      canWrite: me.user?.role === 'admin' || me.user?.role === 'editor',
    }
  },
  component: EditorPage,
})

const OPS: { value: FilterOp; label: string }[] = [
  { value: 'eq', label: '=' },
  { value: 'neq', label: '≠' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '≥' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '≤' },
  { value: 'like', label: 'like' },
  { value: 'ilike', label: 'ilike' },
  { value: 'is_null', label: 'is null' },
  { value: 'not_null', label: 'not null' },
]

function EditorPage() {
  const { schemas, schema, tables, canWrite } = Route.useLoaderData()
  const navigate = useNavigate()
  const { table } = Route.useSearch()
  const qc = useQueryClient()

  const [page, setPage] = useState(0)
  const [sort, setSort] = useState<{ col: string; dir: 'asc' | 'desc' } | undefined>()
  const [filters, setFilters] = useState<RowFilter[]>([])
  const [showFilters, setShowFilters] = useState(false)
  const [insertOpen, setInsertOpen] = useState(false)
  const [tableSearch, setTableSearch] = useState('')

  const visibleTables = tables.filter((t) =>
    t.name.toLowerCase().includes(tableSearch.toLowerCase()),
  )

  const offset = page * PAGE_SIZE
  const queryKey = ['rows', schema, table, page, sort, filters] as const

  const rowsQuery = useQuery({
    queryKey,
    enabled: !!schema && !!table,
    placeholderData: keepPreviousData,
    queryFn: () =>
      rowsFn({
        data: {
          schema: schema!,
          table: table!,
          limit: PAGE_SIZE,
          offset,
          orderBy: sort?.col,
          dir: sort?.dir,
          filters: filters.filter((f) => f.op === 'is_null' || f.op === 'not_null' || f.value),
        },
      }),
  })

  const data = rowsQuery.data as RowsResult | undefined
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function selectTable(name: string) {
    setPage(0)
    setSort(undefined)
    setFilters([])
    navigate({ to: '/editor', search: { schema, table: name } })
  }

  function toggleSort(col: string) {
    setPage(0)
    setSort((s) => {
      if (s?.col !== col) return { col, dir: 'asc' }
      if (s.dir === 'asc') return { col, dir: 'desc' }
      return undefined
    })
  }

  const updateMut = useMutation({
    mutationFn: (v: { pk: Record<string, unknown>; changes: Record<string, unknown> }) =>
      updateRowFn({ data: { schema: schema!, table: table!, pk: v.pk, changes: v.changes } }),
    onSuccess: () => {
      toast.success('Row updated')
      qc.invalidateQueries({ queryKey: ['rows', schema, table] })
    },
    onError: (e) => toast.error('Update failed', { description: String(e) }),
  })

  const deleteMut = useMutation({
    mutationFn: (pk: Record<string, unknown>) =>
      deleteRowFn({ data: { schema: schema!, table: table!, pk } }),
    onSuccess: (r) => {
      toast.success(`Deleted ${r.count} row${r.count === 1 ? '' : 's'}`)
      qc.invalidateQueries({ queryKey: ['rows', schema, table] })
    },
    onError: (e) => toast.error('Delete failed', { description: String(e) }),
  })

  const insertMut = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      insertRowFn({ data: { schema: schema!, table: table!, values } }),
    onSuccess: () => {
      toast.success('Row inserted')
      setInsertOpen(false)
      qc.invalidateQueries({ queryKey: ['rows', schema, table] })
    },
    onError: (e) => toast.error('Insert failed', { description: String(e) }),
  })

  return (
    <>
      <PageHeader
        title="Table editor"
        description={table ? `${schema}.${table}` : 'Browse and edit table data'}
        icon={Table2}
        actions={
          table ? (
            <div className="flex items-center gap-2">
              <Button
                variant={showFilters ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowFilters((v) => !v)}
              >
                <Filter className="size-4" /> Filter
                {filters.length ? <Badge variant="secondary" className="ml-1">{filters.length}</Badge> : null}
              </Button>
              <Button variant="outline" size="sm" onClick={() => rowsQuery.refetch()}>
                <RefreshCw className={cn('size-4', rowsQuery.isFetching && 'animate-spin')} />
              </Button>
              {canWrite ? (
                <Button size="sm" onClick={() => setInsertOpen(true)} disabled={!data}>
                  <Plus className="size-4" /> Insert row
                </Button>
              ) : null}
            </div>
          ) : null
        }
      />

      <div className="flex min-h-0 flex-1">
        {/* table list */}
        <div className="flex w-64 shrink-0 flex-col border-r border-border bg-sidebar">
          <div className="space-y-2 border-b border-border p-3">
            <Select
              value={schema}
              onValueChange={(v) => navigate({ to: '/editor', search: { schema: v } })}
            >
              <SelectTrigger className="w-full">
                <span className="mr-1 text-muted-foreground">schema</span>
                <SelectValue placeholder="Schema" />
              </SelectTrigger>
              <SelectContent>
                {schemas.map((s) => (
                  <SelectItem key={s.name} value={s.name}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                placeholder="Search tables..."
                className="h-8 pl-8 text-[13px]"
              />
            </div>
          </div>
          <div className="flex items-center justify-between px-3 pt-2.5 pb-1 text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
            <span>Tables</span>
            <span className="tabular-nums">{visibleTables.length}</span>
          </div>
          <div className="flex-1 overflow-auto px-2 pb-2 space-y-px">
            {visibleTables.map((t) => (
              <button
                key={t.name}
                onClick={() => selectTable(t.name)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors',
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
                <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                  {formatCompact(t.estRows)}
                </span>
              </button>
            ))}
            {visibleTables.length === 0 ? (
              <div className="px-2.5 py-4 text-[13px] text-muted-foreground">No tables match.</div>
            ) : null}
          </div>
        </div>

        {/* grid */}
        <div className="flex min-w-0 flex-1 flex-col">
          {!table ? (
            <div className="grid flex-1 place-items-center text-sm text-muted-foreground">
              Select a table from the list.
            </div>
          ) : (
            <>
              {showFilters && data ? (
                <FilterBar
                  columns={data.columns.map((c) => c.name)}
                  filters={filters}
                  onChange={(f) => {
                    setPage(0)
                    setFilters(f)
                  }}
                />
              ) : null}

              <div className="min-h-0 flex-1">
                {rowsQuery.isError ? (
                  <div className="p-4 text-sm text-destructive">
                    {(rowsQuery.error as Error).message}
                  </div>
                ) : data ? (
                  <EditableGrid
                    columns={data.columns}
                    rows={data.rows}
                    sort={sort}
                    onSort={toggleSort}
                    canWrite={canWrite}
                    onEdit={async (pk, changes) => {
                      await updateMut.mutateAsync({ pk, changes })
                    }}
                    onDelete={(pk) => deleteMut.mutate(pk)}
                  />
                ) : (
                  <div className="grid h-full place-items-center">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>

              {/* pagination footer */}
              <div className="flex h-10 shrink-0 items-center gap-3 border-t border-border bg-sidebar px-4 text-xs">
                <span className="text-muted-foreground">
                  {data ? (
                    <>
                      {formatNumber(offset + 1)}–{formatNumber(offset + (data.rows.length || 0))} of{' '}
                      {data.estimated ? '~' : ''}
                      {formatNumber(total)}
                    </>
                  ) : (
                    '—'
                  )}
                </span>
                {!canWrite ? (
                  <Badge variant="outline" className="text-muted-foreground">read-only</Badge>
                ) : (
                  <span className="text-muted-foreground/70">double-click a cell to edit</span>
                )}
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-7"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <span className="tabular-nums px-2">
                    {page + 1} / {pageCount}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-7"
                    disabled={page + 1 >= pageCount}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {data ? (
        <InsertDialog
          open={insertOpen}
          onOpenChange={setInsertOpen}
          columns={data.columns}
          submitting={insertMut.isPending}
          onSubmit={(values) => insertMut.mutate(values)}
        />
      ) : null}
    </>
  )
}

function FilterBar({
  columns,
  filters,
  onChange,
}: {
  columns: string[]
  filters: RowFilter[]
  onChange: (f: RowFilter[]) => void
}) {
  function add() {
    onChange([...filters, { column: columns[0], op: 'eq', value: '' }])
  }
  function update(i: number, patch: Partial<RowFilter>) {
    onChange(filters.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))
  }
  function remove(i: number) {
    onChange(filters.filter((_, idx) => idx !== i))
  }
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-sidebar px-4 py-2">
      {filters.map((f, i) => {
        const noValue = f.op === 'is_null' || f.op === 'not_null'
        return (
          <div key={i} className="flex items-center gap-1 rounded-md border border-border bg-surface-100 px-1 py-1">
            <Select value={f.column} onValueChange={(v) => update(i, { column: v })}>
              <SelectTrigger className="h-7 border-0 text-xs font-mono w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {columns.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={f.op} onValueChange={(v) => update(i, { op: v as FilterOp })}>
              <SelectTrigger className="h-7 border-0 text-xs w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!noValue ? (
              <Input
                value={f.value ?? ''}
                onChange={(e) => update(i, { value: e.target.value })}
                placeholder="value"
                className="h-7 w-36 text-xs font-mono"
              />
            ) : null}
            <button className="px-1 text-muted-foreground hover:text-destructive" onClick={() => remove(i)}>
              <X className="size-3.5" />
            </button>
          </div>
        )
      })}
      <Button variant="ghost" size="sm" onClick={add} className="h-7">
        <Plus className="size-3.5" /> Add filter
      </Button>
    </div>
  )
}

function InsertDialog({
  open,
  onOpenChange,
  columns,
  onSubmit,
  submitting,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  columns: RowsResult['columns']
  onSubmit: (values: Record<string, unknown>) => void
  submitting: boolean
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const fields = useMemo(() => columns, [columns])

  function submit() {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(values)) {
      if (v !== '') out[k] = v
    }
    onSubmit(out)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Insert row</DialogTitle>
          <DialogDescription>Leave a field blank to use its default / null.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {fields.map((c) => (
            <div key={c.name} className="space-y-1">
              <Label className="text-xs font-mono flex items-center gap-1.5">
                {c.name}
                <span className="text-muted-foreground font-sans">{c.dataType}</span>
                {c.notNull ? <span className="text-destructive">*</span> : null}
              </Label>
              <Input
                value={values[c.name] ?? ''}
                onChange={(e) => setValues((s) => ({ ...s, [c.name]: e.target.value }))}
                className="font-mono text-sm"
                placeholder={c.isPrimaryKey ? 'auto / required' : 'default'}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : 'Insert'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
