import { getSql } from './db'
import { getColumns } from './introspect'
import { normalizeDir, quoteIdent, quoteQualified } from './sql-ident'

export type FilterOp =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'like'
  | 'ilike'
  | 'is_null'
  | 'not_null'

export type Filter = { column: string; op: FilterOp; value?: string }

export type RowsRequest = {
  schema: string
  table: string
  limit: number
  offset: number
  orderBy?: string
  dir?: 'asc' | 'desc'
  filters?: Filter[]
}

// DB cell values are dynamic; `any` keeps them through TanStack's serializer.
export type Row = Record<string, any>

export type RowsResult = {
  rows: Row[]
  total: number | null
  estimated: boolean
  columns: { name: string; dataType: string; isPrimaryKey: boolean; notNull: boolean }[]
}

const OP_SQL: Record<Exclude<FilterOp, 'is_null' | 'not_null'>, string> = {
  eq: '=',
  neq: '<>',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  like: 'like',
  ilike: 'ilike',
}

function buildWhere(filters: Filter[], valid: Set<string>): { sql: string; params: unknown[] } {
  const clauses: string[] = []
  const params: unknown[] = []
  for (const f of filters) {
    if (!valid.has(f.column)) continue
    const col = quoteIdent(f.column)
    if (f.op === 'is_null') {
      clauses.push(`${col} is null`)
    } else if (f.op === 'not_null') {
      clauses.push(`${col} is not null`)
    } else {
      const opsql = OP_SQL[f.op]
      params.push(f.value ?? '')
      // cast column to text for like/ilike so it works on non-text columns
      const lhs = f.op === 'like' || f.op === 'ilike' ? `${col}::text` : col
      clauses.push(`${lhs} ${opsql} $${params.length}`)
    }
  }
  return { sql: clauses.length ? 'where ' + clauses.join(' and ') : '', params }
}

export async function getRows(req: RowsRequest): Promise<RowsResult> {
  const sql = getSql()
  const cols = await getColumns(req.schema, req.table)
  const valid = new Set(cols.map((c) => c.name))
  const rel = quoteQualified(req.schema, req.table)

  const limit = Math.min(Math.max(req.limit ?? 100, 1), 1000)
  const offset = Math.max(req.offset ?? 0, 0)

  const { sql: whereSql, params } = buildWhere(req.filters ?? [], valid)

  let orderSql = ''
  if (req.orderBy && valid.has(req.orderBy)) {
    orderSql = `order by ${quoteIdent(req.orderBy)} ${normalizeDir(req.dir)} nulls last`
  } else {
    // stable order by primary key if present
    const pk = cols.filter((c) => c.isPrimaryKey).map((c) => quoteIdent(c.name))
    if (pk.length) orderSql = `order by ${pk.join(', ')}`
  }

  const dataQuery = `select * from ${rel} ${whereSql} ${orderSql} limit ${limit} offset ${offset}`
  const rows = await sql.unsafe(dataQuery, params as never[])

  // Count: exact when filtered (bounded), else fast estimate.
  let total: number | null = null
  let estimated = false
  if (whereSql) {
    const countRows = await sql.unsafe(
      `select count(*)::bigint as c from ${rel} ${whereSql}`,
      params as never[],
    )
    total = Number((countRows[0] as unknown as { c: string }).c)
  } else {
    const est = await sql<{ c: string }[]>`
      select greatest(reltuples, 0)::bigint as c
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname=${req.schema} and c.relname=${req.table}`
    total = Number(est[0]?.c ?? 0)
    estimated = true
    // For small tables an estimate of 0 is unhelpful; do an exact count.
    if (total < 50000) {
      const exact = await sql.unsafe(`select count(*)::bigint as c from ${rel}`)
      total = Number((exact[0] as unknown as { c: string }).c)
      estimated = false
    }
  }

  return {
    rows: rows as unknown as Row[],
    total,
    estimated,
    columns: cols.map((c) => ({
      name: c.name,
      dataType: c.dataType,
      isPrimaryKey: c.isPrimaryKey,
      notNull: c.notNull,
    })),
  }
}

/** Coerce a string form value into something postgres.js can bind for a column. */
function coerce(value: unknown): unknown {
  if (value === null) return null
  if (value === '__NULL__') return null
  return value
}

function pkPredicate(
  pk: Record<string, unknown>,
  valid: Set<string>,
): { sql: string; params: unknown[] } {
  const parts: string[] = []
  const params: unknown[] = []
  for (const [k, v] of Object.entries(pk)) {
    if (!valid.has(k)) throw new Error(`Unknown primary key column: ${k}`)
    params.push(v)
    parts.push(`${quoteIdent(k)} = $${params.length}`)
  }
  if (!parts.length) throw new Error('No primary key provided')
  return { sql: parts.join(' and '), params }
}

export async function updateRow(args: {
  schema: string
  table: string
  pk: Record<string, unknown>
  changes: Record<string, unknown>
}): Promise<Row> {
  const sql = getSql()
  const cols = await getColumns(args.schema, args.table)
  const valid = new Set(cols.map((c) => c.name))
  const rel = quoteQualified(args.schema, args.table)

  const setParts: string[] = []
  const params: unknown[] = []
  for (const [k, v] of Object.entries(args.changes)) {
    if (!valid.has(k)) continue
    params.push(coerce(v))
    setParts.push(`${quoteIdent(k)} = $${params.length}`)
  }
  if (!setParts.length) throw new Error('No valid columns to update')

  // validates pk columns and appends pk params after the SET params
  const pred = pkPredicate(args.pk, valid)
  const predParams = pred.params.map((p) => {
    params.push(p)
    return `$${params.length}`
  })
  const predSql = Object.keys(args.pk)
    .map((k, i) => `${quoteIdent(k)} = ${predParams[i]}`)
    .join(' and ')

  const q = `update ${rel} set ${setParts.join(', ')} where ${predSql} returning *`
  const rows = await sql.unsafe(q, params as never[])
  return rows[0] as unknown as Row
}

export async function insertRow(args: {
  schema: string
  table: string
  values: Record<string, unknown>
}): Promise<Row> {
  const sql = getSql()
  const cols = await getColumns(args.schema, args.table)
  const valid = new Set(cols.map((c) => c.name))
  const rel = quoteQualified(args.schema, args.table)

  const names: string[] = []
  const params: unknown[] = []
  const placeholders: string[] = []
  for (const [k, v] of Object.entries(args.values)) {
    if (!valid.has(k)) continue
    if (v === '' || v === undefined) continue // let DB defaults apply
    names.push(quoteIdent(k))
    params.push(coerce(v))
    placeholders.push(`$${params.length}`)
  }
  const q = names.length
    ? `insert into ${rel} (${names.join(', ')}) values (${placeholders.join(', ')}) returning *`
    : `insert into ${rel} default values returning *`
  const rows = await sql.unsafe(q, params as never[])
  return rows[0] as unknown as Row
}

export async function deleteRow(args: {
  schema: string
  table: string
  pk: Record<string, unknown>
}): Promise<number> {
  const sql = getSql()
  const cols = await getColumns(args.schema, args.table)
  const valid = new Set(cols.map((c) => c.name))
  const rel = quoteQualified(args.schema, args.table)
  const pred = pkPredicate(args.pk, valid)
  const q = `delete from ${rel} where ${pred.sql}`
  const res = await sql.unsafe(q, pred.params as never[])
  return res.count ?? 0
}
