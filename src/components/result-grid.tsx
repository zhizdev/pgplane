import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { formatCellValue } from '#/lib/format'
import { cn } from '#/lib/utils'

const ROW_H = 34
const COL_W = 220
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
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_H,
    overscan: 12,
  })
  const totalWidth = NUM_W + columns.length * COL_W

  return (
    <div
      ref={parentRef}
      className={cn('relative h-full w-full overflow-auto bg-background text-sm', className)}
    >
      <div style={{ width: totalWidth }} className="min-w-full">
        {/* header */}
        <div
          className="sticky top-0 z-10 flex border-b border-border bg-card/95 backdrop-blur"
          style={{ height: ROW_H }}
        >
          <div
            className="shrink-0 border-r border-border px-2 grid place-items-center text-[11px] text-muted-foreground"
            style={{ width: NUM_W }}
          >
            #
          </div>
          {columns.map((c) => (
            <div
              key={c}
              className="shrink-0 truncate border-r border-border px-3 grid items-center font-medium text-foreground/80"
              style={{ width: COL_W }}
              title={c}
            >
              {c}
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
                className="absolute left-0 flex border-b border-border/60 hover:bg-accent/40"
                style={{ top: vi.start, height: ROW_H, width: totalWidth }}
              >
                <div
                  className="shrink-0 border-r border-border px-2 grid place-items-center text-[11px] text-muted-foreground tabular-nums"
                  style={{ width: NUM_W }}
                >
                  {vi.index + 1}
                </div>
                {columns.map((c) => (
                  <Cell key={c} value={row[c]} />
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Cell({ value }: { value: unknown }) {
  const isNull = value === null || value === undefined
  return (
    <div
      className={cn(
        'shrink-0 truncate border-r border-border/60 px-3 grid items-center font-mono text-[12.5px]',
        isNull ? 'text-muted-foreground/50 italic' : 'text-foreground/90',
      )}
      style={{ width: COL_W }}
      title={isNull ? 'NULL' : formatCellValue(value)}
    >
      {isNull ? 'NULL' : formatCellValue(value)}
    </div>
  )
}
