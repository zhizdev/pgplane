import { getSql } from './db'

export type SchemaInfo = { name: string }

export type TableKind = 'table' | 'partitioned' | 'view' | 'matview' | 'foreign'
export type TableInfo = {
  schema: string
  name: string
  kind: TableKind
  comment: string | null
  estRows: number
  totalBytes: number
  tableBytes: number
  indexBytes: number
}

export type ColumnInfo = {
  name: string
  position: number
  dataType: string
  notNull: boolean
  default: string | null
  isIdentity: boolean
  isPrimaryKey: boolean
  comment: string | null
}

export type IndexInfo = {
  name: string
  def: string
  isPrimary: boolean
  isUnique: boolean
  bytes: number
}

export type ConstraintInfo = {
  name: string
  type: 'p' | 'f' | 'u' | 'c' | 'x' | string
  def: string
}

const kindMap: Record<string, TableKind> = {
  r: 'table',
  p: 'partitioned',
  v: 'view',
  m: 'matview',
  f: 'foreign',
}

export async function listSchemas(): Promise<SchemaInfo[]> {
  const sql = getSql()
  const rows = await sql<{ name: string }[]>`
    select nspname as name
    from pg_namespace
    where nspname not in ('pg_catalog','information_schema','pg_toast')
      and nspname not like 'pg\\_temp%' and nspname not like 'pg\\_toast%'
    order by nspname`
  return rows
}

export async function listTables(schema: string): Promise<TableInfo[]> {
  const sql = getSql()
  const rows = await sql<
    {
      name: string
      kind: string
      comment: string | null
      est_rows: string
      total_bytes: string
      table_bytes: string
      index_bytes: string
    }[]
  >`
    select c.relname as name,
           c.relkind as kind,
           obj_description(c.oid) as comment,
           greatest(c.reltuples, 0)::bigint as est_rows,
           pg_total_relation_size(c.oid) as total_bytes,
           pg_table_size(c.oid) as table_bytes,
           pg_indexes_size(c.oid) as index_bytes
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = ${schema} and c.relkind in ('r','p','v','m','f')
    order by c.relname`
  return rows.map((r) => ({
    schema,
    name: r.name,
    kind: kindMap[r.kind] ?? 'table',
    comment: r.comment,
    estRows: Number(r.est_rows),
    totalBytes: Number(r.total_bytes),
    tableBytes: Number(r.table_bytes),
    indexBytes: Number(r.index_bytes),
  }))
}

async function resolveOid(schema: string, table: string): Promise<number | null> {
  const sql = getSql()
  const rows = await sql<{ oid: number }[]>`
    select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname=${schema} and c.relname=${table} limit 1`
  return rows[0]?.oid ?? null
}

export async function getColumns(schema: string, table: string): Promise<ColumnInfo[]> {
  const sql = getSql()
  const oid = await resolveOid(schema, table)
  if (!oid) return []
  const rows = await sql<
    {
      name: string
      position: number
      data_type: string
      not_null: boolean
      default: string | null
      is_identity: boolean
      is_pk: boolean
      comment: string | null
    }[]
  >`
    select a.attname as name,
           a.attnum as position,
           format_type(a.atttypid, a.atttypmod) as data_type,
           a.attnotnull as not_null,
           pg_get_expr(d.adbin, d.adrelid) as default,
           (a.attidentity <> '') as is_identity,
           coalesce(pk.is_pk, false) as is_pk,
           col_description(a.attrelid, a.attnum) as comment
    from pg_attribute a
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    left join (
      select a2.attname, true as is_pk
      from pg_index i
      join pg_attribute a2 on a2.attrelid = i.indrelid and a2.attnum = any(i.indkey)
      where i.indrelid = ${oid} and i.indisprimary
    ) pk on pk.attname = a.attname
    where a.attrelid = ${oid} and a.attnum > 0 and not a.attisdropped
    order by a.attnum`
  return rows.map((r) => ({
    name: r.name,
    position: r.position,
    dataType: r.data_type,
    notNull: r.not_null,
    default: r.default,
    isIdentity: r.is_identity,
    isPrimaryKey: r.is_pk,
    comment: r.comment,
  }))
}

export async function getIndexes(schema: string, table: string): Promise<IndexInfo[]> {
  const sql = getSql()
  const oid = await resolveOid(schema, table)
  if (!oid) return []
  const rows = await sql<
    { name: string; def: string; is_primary: boolean; is_unique: boolean; bytes: string }[]
  >`
    select i.relname as name,
           pg_get_indexdef(i.oid) as def,
           idx.indisprimary as is_primary,
           idx.indisunique as is_unique,
           pg_relation_size(i.oid) as bytes
    from pg_index idx
    join pg_class i on i.oid = idx.indexrelid
    where idx.indrelid = ${oid}
    order by i.relname`
  return rows.map((r) => ({
    name: r.name,
    def: r.def,
    isPrimary: r.is_primary,
    isUnique: r.is_unique,
    bytes: Number(r.bytes),
  }))
}

export async function getConstraints(schema: string, table: string): Promise<ConstraintInfo[]> {
  const sql = getSql()
  const oid = await resolveOid(schema, table)
  if (!oid) return []
  const rows = await sql<{ name: string; type: string; def: string }[]>`
    select conname as name, contype::text as type, pg_get_constraintdef(oid) as def
    from pg_constraint where conrelid = ${oid} order by contype, conname`
  return rows
}

export type TableDetail = {
  table: TableInfo | null
  columns: ColumnInfo[]
  indexes: IndexInfo[]
  constraints: ConstraintInfo[]
}

export async function getTableDetail(schema: string, table: string): Promise<TableDetail> {
  const [tables, columns, indexes, constraints] = await Promise.all([
    listTables(schema),
    getColumns(schema, table),
    getIndexes(schema, table),
    getConstraints(schema, table),
  ])
  return {
    table: tables.find((t) => t.name === table) ?? null,
    columns,
    indexes,
    constraints,
  }
}
