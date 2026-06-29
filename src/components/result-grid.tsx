import { useCallback, useEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { formatCellValue } from '#/lib/format'
import { cn } from '#/lib/utils'

const ROW_H = 34
const DEFAULT_COL_W = 220
const MIN_COL_W = 72
const NUM_W = 56

export function ResultGrid({
  columns,
  rows,
  className,
}: {
  columns: string[]
  rows: Record<string, unknown>[]
  className?: string
}) {
  const parentRef = useRef<HTMLDivElement>(null)
  const [widths, setWidths] = useState<number[]>(() => columns.map(() => DEFAULT_COL_W))

  // Reset widths whenever the column set changes (a new query result arrives).
  useEffect(() => {
    setWidths(columns.map(() => DEFAULT_COL_W))
  }, [columns])

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_H,
    overscan: 12,
  })

  // ── column resize ──────────────────────────────────────────────────────
  const drag = useRef<{ index: number; startX: number; startW: number } | null>(null)

  const onMove = useCallback((e: MouseEvent) => {
    const d = drag.current
    if (!d) return
    const next = Math.max(MIN_COL_W, d.startW + (e.clientX - d.startX))
    setWidths((w) => {
      if (w[d.index] === next) return w
      const c = w.slice()
      c[d.index] = next
      return c
    })
  }, [])

  const onUp = useCallback(() => {
    drag.current = null
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }, [onMove])

  const startResize = useCallback(
    (e: React.MouseEvent, index: number) => {
      e.preventDefault()
      e.stopPropagation()
      drag.current = { index, startX: e.clientX, startW: widths[index] ?? DEFAULT_COL_W }
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'col-resize'
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [widths, onMove, onUp],
  )

  useEffect(
    () => () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    },
    [onMove, onUp],
  )

  const colWidth = (i: number) => widths[i] ?? DEFAULT_COL_W
  const totalWidth = NUM_W + columns.reduce((s, _c, i) => s + colWidth(i), 0)

  return (
    <div
      ref={parentRef}
      className={cn('relative h-full w-full overflow-auto bg-background text-sm', className)}
    >
      <div style={{ width: totalWidth }} className="min-w-full">
        {/* header */}
        <div
          className="sticky top-0 z-10 flex border-b border-border bg-surface-100/95 backdrop-blur"
          style={{ height: ROW_H }}
        >
          <div
            className="shrink-0 border-r border-border px-2 grid place-items-center text-[11px] text-muted-foreground"
            style={{ width: NUM_W }}
          >
            #
          </div>
          {columns.map((c, i) => (
            <div
              key={c}
              className="relative flex shrink-0 items-center border-r border-border"
              style={{ width: colWidth(i) }}
              title={c}
            >
              <span className="truncate px-3 font-mono text-[12px] font-medium text-foreground/80">
                {c}
              </span>
              <div
                onMouseDown={(e) => startResize(e, i)}
                onDoubleClick={() =>
                  setWidths((w) => {
                    const cc = w.slice()
                    cc[i] = DEFAULT_COL_W
                    return cc
                  })
                }
                className="group absolute right-0 top-0 z-20 flex h-full w-2 cursor-col-resize touch-none items-stretch justify-center"
                title="Drag to resize · double-click to reset"
              >
                <span className="my-1 w-px bg-transparent transition-colors group-hover:bg-primary group-active:bg-primary" />
              </div>
            </div>
          ))}
        </div>

        {/* body */}
        <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map((vi) => {
            const row = rows[vi.index]
            return (
              <div
                key={vi.key}
                className="absolute left-0 flex border-b border-border/60 hover:bg-surface-200/50"
                style={{ top: vi.start, height: ROW_H, width: totalWidth }}
              >
                <div
                  className="shrink-0 border-r border-border px-2 grid place-items-center text-[11px] text-muted-foreground tabular-nums"
                  style={{ width: NUM_W }}
                >
                  {vi.index + 1}
                </div>
                {columns.map((c, i) => (
                  <Cell key={c} value={row[c]} width={colWidth(i)} />
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Cell({ value, width }: { value: unknown; width: number }) {
  const isNull = value === null || value === undefined
  return (
    <div
      className={cn(
        'shrink-0 truncate border-r border-border/60 px-3 grid items-center font-mono text-[12.5px]',
        isNull ? 'text-muted-foreground/50 italic' : 'text-foreground/90',
      )}
      style={{ width }}
      title={isNull ? 'NULL' : formatCellValue(value)}
    >
      {isNull ? 'NULL' : formatCellValue(value)}
    </div>
  )
}
