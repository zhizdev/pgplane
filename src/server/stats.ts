import { getSql } from './db'

export type Overview = {
  version: string
  serverVersion: string
  database: string
  sizeBytes: number
  startedAt: string | null
  uptimeSeconds: number | null
  backends: number
  maxConnections: number
  cacheHitRatio: number | null
  commits: number
  rollbacks: number
  blksRead: number
  blksHit: number
  tupReturned: number
  tupFetched: number
  tupInserted: number
  tupUpdated: number
  tupDeleted: number
  deadlocks: number
  tempFiles: number
  tempBytes: number
  hasPgStatStatements: boolean
}

export async function getOverview(): Promise<Overview> {
  const sql = getSql()
  const [meta] = await sql<
    {
      version: string
      server_version: string
      database: string
      size_bytes: string
      started_at: string | null
      uptime_seconds: string | null
      max_connections: string
    }[]
  >`
    select version() as version,
           current_setting('server_version') as server_version,
           current_database() as database,
           pg_database_size(current_database()) as size_bytes,
           pg_postmaster_start_time()::text as started_at,
           extract(epoch from (now() - pg_postmaster_start_time()))::bigint as uptime_seconds,
           current_setting('max_connections') as max_connections`

  const [db] = await sql<
    {
      backends: string
      commits: string
      rollbacks: string
      blks_read: string
      blks_hit: string
      tup_returned: string
      tup_fetched: string
      tup_inserted: string
      tup_updated: string
      tup_deleted: string
      deadlocks: string
      temp_files: string
      temp_bytes: string
    }[]
  >`
    select numbackends as backends, xact_commit as commits, xact_rollback as rollbacks,
           blks_read, blks_hit, tup_returned, tup_fetched,
           tup_inserted, tup_updated, tup_deleted, deadlocks, temp_files, temp_bytes
    from pg_stat_database where datname = current_database()`

  const [pss] = await sql<{ ok: boolean }[]>`
    select exists(select 1 from pg_extension where extname='pg_stat_statements') as ok`

  const blksHit = Number(db?.blks_hit ?? 0)
  const blksRead = Number(db?.blks_read ?? 0)
  const ratio = blksHit + blksRead > 0 ? blksHit / (blksHit + blksRead) : null

  return {
    version: meta.version,
    serverVersion: meta.server_version,
    database: meta.database,
    sizeBytes: Number(meta.size_bytes),
    startedAt: meta.started_at,
    uptimeSeconds: meta.uptime_seconds ? Number(meta.uptime_seconds) : null,
    backends: Number(db?.backends ?? 0),
    maxConnections: Number(meta.max_connections),
    cacheHitRatio: ratio,
    commits: Number(db?.commits ?? 0),
    rollbacks: Number(db?.rollbacks ?? 0),
    blksRead,
    blksHit,
    tupReturned: Number(db?.tup_returned ?? 0),
    tupFetched: Number(db?.tup_fetched ?? 0),
    tupInserted: Number(db?.tup_inserted ?? 0),
    tupUpdated: Number(db?.tup_updated ?? 0),
    tupDeleted: Number(db?.tup_deleted ?? 0),
    deadlocks: Number(db?.deadlocks ?? 0),
    tempFiles: Number(db?.temp_files ?? 0),
    tempBytes: Number(db?.temp_bytes ?? 0),
    hasPgStatStatements: !!pss?.ok,
  }
}

export type Activity = {
  pid: number
  state: string | null
  usename: string | null
  applicationName: string | null
  clientAddr: string | null
  waitEventType: string | null
  waitEvent: string | null
  durationSeconds: number | null
  query: string | null
  backendType: string | null
}

export async function getActivity(): Promise<Activity[]> {
  const sql = getSql()
  const rows = await sql<
    {
      pid: number
      state: string | null
      usename: string | null
      application_name: string | null
      client_addr: string | null
      wait_event_type: string | null
      wait_event: string | null
      duration_seconds: string | null
      query: string | null
      backend_type: string | null
    }[]
  >`
    select pid, state, usename, application_name, client_addr::text,
           wait_event_type, wait_event,
           extract(epoch from (now() - query_start))::numeric(12,2) as duration_seconds,
           query, backend_type
    from pg_stat_activity
    where pid <> pg_backend_pid()
    order by state = 'active' desc, duration_seconds desc nulls last
    limit 100`
  return rows.map((r) => ({
    pid: r.pid,
    state: r.state,
    usename: r.usename,
    applicationName: r.application_name,
    clientAddr: r.client_addr,
    waitEventType: r.wait_event_type,
    waitEvent: r.wait_event,
    durationSeconds: r.duration_seconds != null ? Number(r.duration_seconds) : null,
    query: r.query,
    backendType: r.backend_type,
  }))
}

export type TopQuery = {
  queryid: string | null
  query: string
  calls: number
  totalExecMs: number
  meanExecMs: number
  rows: number
  hitPercent: number | null
}

export async function getTopQueries(): Promise<TopQuery[] | null> {
  const sql = getSql()
  const [pss] = await sql<{ ok: boolean }[]>`
    select exists(select 1 from pg_extension where extname='pg_stat_statements') as ok`
  if (!pss?.ok) return null
  try {
    const rows = await sql<
      {
        queryid: string | null
        query: string
        calls: string
        total_exec_time: string
        mean_exec_time: string
        rows: string
        hit_percent: string | null
      }[]
    >`
      select queryid::text, query, calls,
             total_exec_time, mean_exec_time, rows,
             case when (shared_blks_hit + shared_blks_read) > 0
               then 100.0 * shared_blks_hit / (shared_blks_hit + shared_blks_read)
               else null end as hit_percent
      from pg_stat_statements
      order by total_exec_time desc
      limit 30`
    return rows.map((r) => ({
      queryid: r.queryid,
      query: r.query,
      calls: Number(r.calls),
      totalExecMs: Number(r.total_exec_time),
      meanExecMs: Number(r.mean_exec_time),
      rows: Number(r.rows),
      hitPercent: r.hit_percent != null ? Number(r.hit_percent) : null,
    }))
  } catch {
    return null
  }
}

export type TableSize = {
  schema: string
  name: string
  totalBytes: number
  tableBytes: number
  indexBytes: number
  estRows: number
  seqScan: number
  idxScan: number
}

export async function getTableSizes(): Promise<TableSize[]> {
  const sql = getSql()
  const rows = await sql<
    {
      schema: string
      name: string
      total_bytes: string
      table_bytes: string
      index_bytes: string
      est_rows: string
      seq_scan: string | null
      idx_scan: string | null
    }[]
  >`
    select n.nspname as schema, c.relname as name,
           pg_total_relation_size(c.oid) as total_bytes,
           pg_table_size(c.oid) as table_bytes,
           pg_indexes_size(c.oid) as index_bytes,
           greatest(c.reltuples,0)::bigint as est_rows,
           s.seq_scan, s.idx_scan
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_stat_user_tables s on s.relid = c.oid
    where c.relkind in ('r','p','m')
      and n.nspname not in ('pg_catalog','information_schema')
    order by pg_total_relation_size(c.oid) desc
    limit 50`
  return rows.map((r) => ({
    schema: r.schema,
    name: r.name,
    totalBytes: Number(r.total_bytes),
    tableBytes: Number(r.table_bytes),
    indexBytes: Number(r.index_bytes),
    estRows: Number(r.est_rows),
    seqScan: Number(r.seq_scan ?? 0),
    idxScan: Number(r.idx_scan ?? 0),
  }))
}

export type IndexStat = {
  schema: string
  table: string
  index: string
  scans: number
  bytes: number
  isUnique: boolean
}

export async function getIndexStats(): Promise<IndexStat[]> {
  const sql = getSql()
  const rows = await sql<
    {
      schema: string
      table: string
      index: string
      scans: string
      bytes: string
      is_unique: boolean
    }[]
  >`
    select s.schemaname as schema, s.relname as table, s.indexrelname as index,
           s.idx_scan as scans, pg_relation_size(s.indexrelid) as bytes,
           ix.indisunique as is_unique
    from pg_stat_user_indexes s
    join pg_index ix on ix.indexrelid = s.indexrelid
    order by s.idx_scan asc, pg_relation_size(s.indexrelid) desc
    limit 50`
  return rows.map((r) => ({
    schema: r.schema,
    table: r.table,
    index: r.index,
    scans: Number(r.scans),
    bytes: Number(r.bytes),
    isUnique: r.is_unique,
  }))
}

export type ConnectionBucket = { state: string; count: number }
export async function getConnectionsByState(): Promise<ConnectionBucket[]> {
  const sql = getSql()
  const rows = await sql<{ state: string | null; count: string }[]>`
    select coalesce(state,'(none)') as state, count(*)::int as count
    from pg_stat_activity group by 1 order by 2 desc`
  return rows.map((r) => ({ state: r.state ?? '(none)', count: Number(r.count) }))
}
