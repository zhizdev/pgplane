/** Safe SQL identifier helpers. We additionally validate names against the
 * catalog before interpolating, but quote defensively regardless. */

export function quoteIdent(name: string): string {
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error('Invalid identifier')
  }
  // Double any embedded quotes and wrap.
  return '"' + name.replace(/"/g, '""') + '"'
}

export function quoteQualified(schema: string, table: string): string {
  return `${quoteIdent(schema)}.${quoteIdent(table)}`
}

export function quoteLiteral(value: string): string {
  return "'" + value.replace(/'/g, "''") + "'"
}

const SORT_DIRS = new Set(['asc', 'desc'])
export function normalizeDir(dir: string | undefined): 'asc' | 'desc' {
  const d = (dir ?? 'asc').toLowerCase()
  return SORT_DIRS.has(d) ? (d as 'asc' | 'desc') : 'asc'
}
