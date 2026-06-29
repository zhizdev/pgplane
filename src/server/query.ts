import { getSql } from './db'

export type QueryResult = {
  ok: true
  command: string | null
  rowCount: number
  columns: string[]
  rows: Record<string, any>[]
  durationMs: number
  truncated: boolean
}
export type QueryError = {
  ok: false
  error: string
  code?: string
  position?: number
  durationMs: number
}

const MAX_ROWS = 5000

export async function runQuery(args: {
  text: string
  readOnly?: boolean
  timeoutMs?: number
}): Promise<QueryResult | QueryError> {
  const sql = getSql()
  const timeout = Math.min(Math.max(args.timeoutMs ?? 15000, 1000), 60000)
  const started = Date.now()
  try {
    const result = await sql.begin(async (tx) => {
      if (args.readOnly) await tx.unsafe('set transaction read only')
      await tx.unsafe(`set local statement_timeout = ${timeout}`)
      await tx.unsafe(`set local lock_timeout = ${Math.min(timeout, 10000)}`)
      return tx.unsafe(args.text)
    })
    const durationMs = Date.now() - started

    const res = result as unknown as {
      columns?: { name: string }[]
      command?: string
      count?: number
    } & Record<string, unknown>[]

    const allRows = Array.isArray(result) ? (result as unknown as Record<string, unknown>[]) : []
    const truncated = allRows.length > MAX_ROWS
    const rows = truncated ? allRows.slice(0, MAX_ROWS) : allRows
    const columns =
      res.columns?.map((c) => c.name) ??
      (rows[0] ? Object.keys(rows[0]) : [])

    return {
      ok: true,
      command: res.command ?? null,
      rowCount: typeof res.count === 'number' ? res.count : allRows.length,
      columns,
      rows,
      durationMs,
      truncated,
    }
  } catch (e: unknown) {
    const durationMs = Date.now() - started
    const err = e as { message?: string; code?: string; position?: string }
    return {
      ok: false,
      error: err?.message ?? String(e),
      code: err?.code,
      position: err?.position ? Number(err.position) : undefined,
      durationMs,
    }
  }
}

export async function explainQuery(args: {
  text: string
  analyze?: boolean
}): Promise<QueryResult | QueryError> {
  const opts = args.analyze ? '(analyze, buffers, verbose, format text)' : '(verbose, format text)'
  const wrapped = `explain ${opts} ${args.text}`
  // EXPLAIN ANALYZE actually runs the query; force read-only unless analyze.
  return runQuery({ text: wrapped, readOnly: !args.analyze, timeoutMs: 30000 })
}
