import { AsyncLocalStorage } from 'node:async_hooks'
import postgres from 'postgres'
import { envStr, getEnv } from './env'

export type Sql = postgres.Sql<Record<string, never>>

type Source = { conn: string; viaHyperdrive: boolean }

/**
 * Cloudflare Workers forbid using an I/O object (socket/DB connection) created
 * in one request from within another request. So we never cache a pool across
 * requests: each server function creates a short-lived client via withSql() and
 * closes it when done. AsyncLocalStorage lets the existing getSql() callers keep
 * working unchanged inside that scope.
 */
const als = new AsyncLocalStorage<Sql>()

export function resolveSource(): Source {
  const env = getEnv()
  if (env.HYPERDRIVE?.connectionString) {
    return { conn: env.HYPERDRIVE.connectionString, viaHyperdrive: true }
  }
  const url = envStr('DATABASE_URL')
  if (url) return { conn: url, viaHyperdrive: false }

  const host = envStr('PGHOST')
  if (host) {
    const user = envStr('PGUSER', 'postgres')
    const pass = envStr('PGPASSWORD')
    const port = envStr('PGPORT', '5432')
    const db = envStr('PGDATABASE', 'postgres')
    const sslmode = envStr('PGSSLMODE', 'require')
    const auth = pass
      ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}`
      : encodeURIComponent(user)
    return {
      conn: `postgresql://${auth}@${host}:${port}/${db}?sslmode=${sslmode}`,
      viaHyperdrive: false,
    }
  }
  throw new Error(
    'No database configured. Set a Hyperdrive binding, DATABASE_URL, or PG* vars in .dev.vars.',
  )
}

export function resolveConnectionString(): string {
  return resolveSource().conn
}

function sslFor(src: Source): postgres.Options<{}>['ssl'] {
  if (src.viaHyperdrive) return false
  try {
    const u = new URL(src.conn)
    const mode = u.searchParams.get('sslmode')
    if (mode === 'disable') return false
    if (mode === 'verify-full' || mode === 'verify-ca') return true
    if (mode) return { rejectUnauthorized: false }
  } catch {
    /* not a URL */
  }
  return { rejectUnauthorized: false }
}

function createSql(): Sql {
  const src = resolveSource()
  return postgres(src.conn, {
    ssl: sslFor(src),
    max: 4,
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false,
    onnotice: () => {},
  }) as Sql
}

/** The request-scoped client. Throws if called outside withSql(). */
export function getSql(): Sql {
  const sql = als.getStore()
  if (!sql) throw new Error('getSql() called outside of a withSql() scope')
  return sql
}

/** Run `fn` with a fresh request-scoped client, closing it afterwards. */
export async function withSql<T>(fn: () => Promise<T>): Promise<T> {
  const sql = createSql()
  try {
    return await als.run(sql, fn)
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {})
  }
}

/** Connection metadata for display (never includes the password). */
export function connectionInfo() {
  const src = resolveSource()
  try {
    const u = new URL(src.conn)
    return {
      host: u.hostname,
      port: u.port || '5432',
      database: u.pathname.replace(/^\//, '') || 'postgres',
      user: decodeURIComponent(u.username) || 'postgres',
      ssl: u.searchParams.get('sslmode') ?? (src.viaHyperdrive ? 'hyperdrive' : 'require'),
      viaHyperdrive: src.viaHyperdrive,
    }
  } catch {
    return {
      host: 'unknown',
      port: '5432',
      database: 'unknown',
      user: 'unknown',
      ssl: 'unknown',
      viaHyperdrive: src.viaHyperdrive,
    }
  }
}
