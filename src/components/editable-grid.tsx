import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, KeyRound, Trash2 } from 'lucide-react'
import type { RowsResult } from '#/server/data'
import { formatCellValue } from '#/lib/format'
import { cn } from '#/lib/utils'

type Col = RowsResult['columns'][number]

export function EditableGrid({
  columns,
  rows,
  sort,
  onSort,
  onEdit,
  onDelete,
  canWrite,
}: {
  columns: Col[]
  rows: Record<string, unknown>[]
  sort?: { col: string; dir: 'asc' | 'desc' }
  onSort: (col: string) => void
  onEdit: (pk: Record<string, unknown>, changes: Record<string, unknown>) => Promise<void>
  onDelete: (pk: Record<string, unknown>) => void
  canWrite: boolean
}) {
  const pkCols = columns.filter((c) => c.isPrimaryKey).map((c) => c.name)
  const hasPk = pkCols.length > 0
  const [editing, setEditing] = useState<{ row: number; col: string } | null>(null)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  function startEdit(rowIdx: number, col: string, value: unknown) {
    if (!canWrite || !hasPk) return
    setEditing({ row: rowIdx, col })
    setDraft(value === null || value === undefined ? '' : formatCellValue(value))
  }

  async function commit() {
    if (!editing) return
    const row = rows[editing.row]
    const original = row[editing.col]
    const next: unknown = draft === '' ? null : draft
    const origStr = original === null || original === undefined ? '' : formatCellValue(original)
    if (draft !== origStr) {
      const pk = Object.fromEntries(pkCols.map((c) => [c, row[c]]))
      await onEdit(pk, { [editing.col]: next })
    }
    setEditing(null)
  }

  return (
    <div className="h-full w-full overflow-auto">
      <table className="border-collapse text-sm" style={{ minWidth: '100%' }}>
        <thead className="sticky top-0 z-10">
          <tr className="bg-card">
            <th className="sticky left-0 z-20 w-12 border-b border-r border-border bg-card px-2 py-1.5" />
            {columns.map((c) => {
              const active = sort?.col === c.name
              return (
                <th
                  key={c.name}
                  className="border-b border-r border-border bg-card px-3 py-1.5 text-left font-medium whitespace-nowrap cursor-pointer hover:bg-accent/50 select-none"
                  style={{ minWidth: 150 }}
                  onClick={() => onSort(c.name)}
                  title={`${c.dataType}${c.notNull ? ' · not null' : ''}`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {c.isPrimaryKey ? <KeyRound className="size-3 text-amber-500" /> : null}
                    <span className="font-mono text-[13px]">{c.name}</span>
                    <span className="text-[10px] font-normal text-muted-foreground">{c.dataType}</span>
                    {active ? (
                      sort!.dir === 'asc' ? (
                        <ArrowUp className="size-3 text-primary" />
                      ) : (
                        <ArrowDown className="size-3 text-primary" />
                      )
                    ) : null}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => {
            const pk = hasPk ? Object.fromEntries(pkCols.map((c) => [c, row[c]])) : null
            return (
              <tr key={rowIdx} className="group hover:bg-accent/20">
                <td className="sticky left-0 z-10 w-12 border-b border-r border-border bg-background px-2 py-1 text-center group-hover:bg-accent/20">
                  {canWrite && pk ? (
                    <button
                      className="text-muted-foreground/40 hover:text-destructive opacity-0 group-hover:opacity-100"
                      onClick={() => onDelete(pk)}
                      title="Delete row"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/50 tabular-nums">{rowIdx + 1}</span>
                  )}
                </td>
                {columns.map((c) => {
                  const value = row[c.name]
                  const isEditing = editing?.row === rowIdx && editing?.col === c.name
                  const isNull = value === null || value === undefined
                  return (
                    <td
                      key={c.name}
                      className="border-b border-r border-border/60 px-0 py-0 align-middle"
                      style={{ minWidth: 150, maxWidth: 420 }}
                      onDoubleClick={() => startEdit(rowIdx, c.name, value)}
                    >
                      {isEditing ? (
                        <input
                          ref={inputRef}
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={commit}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commit()
                            if (e.key === 'Escape') setEditing(null)
                          }}
                          className="w-full bg-input/40 px-3 py-1.5 font-mono text-[12.5px] outline-none ring-1 ring-primary"
                        />
                      ) : (
                        <div
                          className={cn(
                            'truncate px-3 py-1.5 font-mono text-[12.5px]',
                            isNull ? 'italic text-muted-foreground/50' : 'text-foreground/90',
                            canWrite && hasPk && 'cursor-text',
                          )}
                          title={isNull ? 'NULL' : formatCellValue(value)}
                        >
                          {isNull ? 'NULL' : formatCellValue(value)}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
      {rows.length === 0 ? (
        <div className="grid place-items-center py-16 text-sm text-muted-foreground">
          No rows match.
        </div>
      ) : null}
    </div>
  )
}
