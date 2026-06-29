/** localStorage-backed stores for SQL snippets and run history. Client-only. */

export type Snippet = {
  id: string
  name: string
  sql: string
  createdAt: number
  updatedAt: number
}

export type HistoryEntry = {
  id: string
  sql: string
  at: number
  ok: boolean
  durationMs: number
  rowCount?: number
  error?: string
}

const SNIPPETS_KEY = 'pgplane.snippets.v1'
const HISTORY_KEY = 'pgplane.history.v1'
const HISTORY_MAX = 100

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write<T>(key: string, value: T) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota / disabled */
  }
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export const snippetStore = {
  all(): Snippet[] {
    return read<Snippet[]>(SNIPPETS_KEY, []).sort((a, b) => b.updatedAt - a.updatedAt)
  },
  save(name: string, sql: string, id?: string): Snippet {
    const list = read<Snippet[]>(SNIPPETS_KEY, [])
    const now = Date.now()
    if (id) {
      const idx = list.findIndex((s) => s.id === id)
      if (idx >= 0) {
        list[idx] = { ...list[idx], name, sql, updatedAt: now }
        write(SNIPPETS_KEY, list)
        return list[idx]
      }
    }
    const snippet: Snippet = { id: uid(), name, sql, createdAt: now, updatedAt: now }
    list.push(snippet)
    write(SNIPPETS_KEY, list)
    return snippet
  },
  remove(id: string) {
    write(
      SNIPPETS_KEY,
      read<Snippet[]>(SNIPPETS_KEY, []).filter((s) => s.id !== id),
    )
  },
}

export const historyStore = {
  all(): HistoryEntry[] {
    return read<HistoryEntry[]>(HISTORY_KEY, [])
  },
  add(entry: Omit<HistoryEntry, 'id' | 'at'>): HistoryEntry {
    const list = read<HistoryEntry[]>(HISTORY_KEY, [])
    const full: HistoryEntry = { ...entry, id: uid(), at: Date.now() }
    list.unshift(full)
    write(HISTORY_KEY, list.slice(0, HISTORY_MAX))
    return full
  },
  clear() {
    write(HISTORY_KEY, [])
  },
}
