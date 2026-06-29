import { createFileRoute } from '@tanstack/react-router'
import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Clock,
  Copy,
  Download,
  ListTree,
  Loader2,
  Play,
  Save,
  ScrollText,
  Star,
  Trash2,
  Wand2,
} from 'lucide-react'
import { toast } from 'sonner'
import { explainFn, meFn, runQueryFn } from '#/server/fns'
import type { QueryError, QueryResult } from '#/server/query'
import { PageHeader } from '#/components/page-header'
import { ResultGrid } from '#/components/result-grid'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '#/components/ui/resizable'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Label } from '#/components/ui/label'
import { formatCellValue, formatDurationMs } from '#/lib/format'
import {
  historyStore,
  snippetStore,
  type HistoryEntry,
  type Snippet,
} from '#/lib/storage'
import { cn } from '#/lib/utils'

const DEFAULT_SQL = `-- Write SQL and press ⌘/Ctrl + Enter to run
select *
from information_schema.tables
where table_schema not in ('pg_catalog', 'information_schema')
order by table_schema, table_name
limit 100;`

function cellText(v: unknown): string {
  return v === null || v === undefined ? '' : formatCellValue(v)
}

function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const esc = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const lines = [columns.map(esc).join(',')]
  for (const r of rows) lines.push(columns.map((c) => esc(cellText(r[c]))).join(','))
  return lines.join('\r\n')
}

function toMarkdown(columns: string[], rows: Record<string, unknown>[]): string {
  const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
  const head = `| ${columns.map(esc).join(' | ')} |`
  const sep = `| ${columns.map(() => '---').join(' | ')} |`
  const body = rows.map((r) => `| ${columns.map((c) => esc(cellText(r[c]))).join(' | ')} |`)
  return [head, sep, ...body].join('\n')
}

function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function isExplainPlan(r: QueryResult): boolean {
  return r.columns.length === 1 && r.columns[0] === 'QUERY PLAN'
}

export const Route = createFileRoute('/_app/sql')({
  loader: async () => {
    const me = await meFn()
    return { canWrite: me.user?.role === 'admin' || me.user?.role === 'editor' }
  },
  component: SqlPage,
})

type RunResult = QueryResult | QueryError | null

function SqlPage() {
  const { canWrite } = Route.useLoaderData()
  const [sql, setSql] = useState(DEFAULT_SQL)
  const [result, setResult] = useState<RunResult>(null)
  const [running, setRunning] = useState(false)
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [saveOpen, setSaveOpen] = useState(false)
  const [snippetName, setSnippetName] = useState('')
  const sqlRef = useRef(sql)
  sqlRef.current = sql

  useEffect(() => {
    setSnippets(snippetStore.all())
    setHistory(historyStore.all())
  }, [])

  const run = useCallback(async () => {
    const text = sqlRef.current.trim()
    if (!text) return
    setRunning(true)
    try {
      const res = await runQueryFn({ data: { text } })
      setResult(res)
      historyStore.add({
        sql: text,
        ok: res.ok,
        durationMs: res.durationMs,
        rowCount: res.ok ? res.rowCount : undefined,
        error: res.ok ? undefined : res.error,
      })
      setHistory(historyStore.all())
      if (!res.ok) toast.error('Query failed', { description: res.error })
    } catch (e) {
      toast.error('Request failed', { description: e instanceof Error ? e.message : String(e) })
    } finally {
      setRunning(false)
    }
  }, [])

  const explain = useCallback(
    async (analyze: boolean) => {
      const text = sqlRef.current.trim()
      if (!text) return
      setRunning(true)
      try {
        const res = await explainFn({ data: { text, analyze } })
        setResult(res)
        if (!res.ok) toast.error('Explain failed', { description: res.error })
      } finally {
        setRunning(false)
      }
    },
    [],
  )

  const beforeMount: BeforeMount = (monaco) => {
    monaco.editor.defineTheme('pgplane-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: '', foreground: 'ededed' },
        { token: 'keyword', foreground: '3ecf8e' },
        { token: 'keyword.sql', foreground: '3ecf8e' },
        { token: 'operator.sql', foreground: '8b8b8b' },
        { token: 'string', foreground: 'f5a623' },
        { token: 'string.sql', foreground: 'f5a623' },
        { token: 'number', foreground: 'b07ce8' },
        { token: 'comment', foreground: '6b6b6b', fontStyle: 'italic' },
        { token: 'predefined.sql', foreground: '2e9bdd' },
        { token: 'identifier', foreground: 'ededed' },
      ],
      colors: {
        'editor.background': '#1c1c1c',
        'editor.foreground': '#ededed',
        'editorLineNumber.foreground': '#5a5a5a',
        'editorLineNumber.activeForeground': '#a3a3a3',
        'editor.selectionBackground': '#3ecf8e33',
        'editor.inactiveSelectionBackground': '#3ecf8e1f',
        'editor.lineHighlightBackground': '#ffffff08',
        'editorCursor.foreground': '#3ecf8e',
        'editorGutter.background': '#1c1c1c',
        'editorWidget.background': '#242424',
        'editorWidget.border': '#2e2e2e',
        'editorIndentGuide.background1': '#2a2a2a',
        'editorIndentGuide.activeBackground1': '#3e3e3e',
        'editorSuggestWidget.background': '#242424',
        'editorSuggestWidget.selectedBackground': '#2e2e2e',
      },
    })
  }

  const onMount: OnMount = (editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => run())
  }

  function doSaveSnippet() {
    if (!snippetName.trim()) return
    snippetStore.save(snippetName.trim(), sqlRef.current)
    setSnippets(snippetStore.all())
    setSaveOpen(false)
    setSnippetName('')
    toast.success('Snippet saved')
  }

  return (
    <>
      <PageHeader
        title="SQL editor"
        description={canWrite ? 'Read/write access' : 'Read-only (your role cannot modify data)'}
        icon={ScrollText}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => explain(false)}
              disabled={running}
              title="Show the planner's chosen execution plan for this query — estimates only, the query is not run."
            >
              <Wand2 className="size-4" /> Explain
            </Button>
            {canWrite ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => explain(true)}
                disabled={running}
                title="Actually run the query and show the real execution plan with row counts, timings and buffer usage."
              >
                Explain analyze
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => setSaveOpen(true)}>
              <Save className="size-4" /> Save
            </Button>
            <Button size="sm" onClick={run} disabled={running}>
              {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              Run
              <kbd className="ml-1 rounded bg-primary-foreground/15 px-1 text-[10px]">⌘↵</kbd>
            </Button>
          </div>
        }
      />
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-sidebar">
          <Tabs defaultValue="snippets" className="flex h-full flex-col">
            <TabsList className="m-2">
              <TabsTrigger value="snippets" className="flex-1">
                <Star className="size-3.5" /> Snippets
              </TabsTrigger>
              <TabsTrigger value="history" className="flex-1">
                <Clock className="size-3.5" /> History
              </TabsTrigger>
            </TabsList>
            <TabsContent value="snippets" className="flex-1 overflow-auto px-2 pb-2 mt-0">
              <SnippetList
                snippets={snippets}
                onPick={(s) => setSql(s.sql)}
                onDelete={(id) => {
                  snippetStore.remove(id)
                  setSnippets(snippetStore.all())
                }}
              />
            </TabsContent>
            <TabsContent value="history" className="flex-1 overflow-auto px-2 pb-2 mt-0">
              <HistoryList
                history={history}
                onPick={(h) => setSql(h.sql)}
                onClear={() => {
                  historyStore.clear()
                  setHistory([])
                }}
              />
            </TabsContent>
          </Tabs>
        </aside>

        <div className="min-w-0 flex-1">
          <ResizablePanelGroup orientation="vertical">
            <ResizablePanel defaultSize="45%" minSize="20%">
              <Editor
                height="100%"
                defaultLanguage="sql"
                theme="pgplane-dark"
                value={sql}
                onChange={(v) => setSql(v ?? '')}
                beforeMount={beforeMount}
                onMount={onMount}
                options={{
                  fontSize: 13,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  padding: { top: 12 },
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  automaticLayout: true,
                  lineNumbersMinChars: 3,
                }}
                loading={<div className="p-4 text-sm text-muted-foreground">Loading editor…</div>}
              />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize="55%" minSize="20%">
              <ResultPanel result={result} running={running} />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save snippet</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="snip-name">Name</Label>
            <Input
              id="snip-name"
              autoFocus
              value={snippetName}
              onChange={(e) => setSnippetName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doSaveSnippet()}
              placeholder="e.g. Active orders by country"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={doSaveSnippet}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ResultPanel({ result, running }: { result: RunResult; running: boolean }) {
  if (running && !result) {
    return (
      <div className="grid h-full place-items-center text-sm text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }
  if (!result) {
    return (
      <div className="grid h-full place-items-center text-sm text-muted-foreground">
        Run a query to see results.
      </div>
    )
  }
  if (!result.ok) {
    return (
      <div className="h-full overflow-auto p-4">
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4">
          <div className="text-sm font-medium text-destructive">
            Error{result.code ? ` (${result.code})` : ''}
          </div>
          <pre className="mt-2 whitespace-pre-wrap font-mono text-xs text-destructive/90">
            {result.error}
          </pre>
          <div className="mt-2 text-xs text-muted-foreground">
            {formatDurationMs(result.durationMs)}
          </div>
        </div>
      </div>
    )
  }
  if (isExplainPlan(result)) return <PlanView result={result} />

  const data = result
  const hasRows = data.columns.length > 0

  async function copyMarkdown() {
    const ok = await copyText(toMarkdown(data.columns, data.rows))
    if (ok) toast.success('Copied as Markdown')
    else toast.error('Copy failed', { description: 'Clipboard is unavailable in this context.' })
  }

  function exportCsv() {
    downloadText('query-result.csv', toCsv(data.columns, data.rows), 'text/csv;charset=utf-8')
    toast.success('Exported CSV')
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border bg-sidebar px-4 py-1.5 text-xs text-muted-foreground">
        <span className="rounded bg-primary/12 px-1.5 py-0.5 font-medium text-primary">
          {result.command ?? 'OK'}
        </span>
        <span className="tabular-nums">{result.rowCount} rows</span>
        <span className="tabular-nums">{formatDurationMs(result.durationMs)}</span>
        {result.truncated ? (
          <span className="text-amber-500">showing first {result.rows.length}</span>
        ) : null}
        {hasRows ? (
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="xs" onClick={exportCsv} title="Download all rows as CSV">
              <Download className="size-3.5" /> CSV
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={copyMarkdown}
              title="Copy a Markdown table to the clipboard"
            >
              <Copy className="size-3.5" /> Copy as Markdown
            </Button>
          </div>
        ) : null}
      </div>
      <div className="min-h-0 flex-1">
        {hasRows ? (
          <ResultGrid columns={result.columns} rows={result.rows} />
        ) : (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">
            Statement executed — no rows returned.
          </div>
        )}
      </div>
    </div>
  )
}

function PlanView({ result }: { result: QueryResult }) {
  const text = result.rows.map((r) => String((r as Record<string, unknown>)['QUERY PLAN'] ?? '')).join('\n')
  async function copyPlan() {
    const ok = await copyText(text)
    if (ok) toast.success('Plan copied')
    else toast.error('Copy failed')
  }
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border bg-sidebar px-4 py-1.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 rounded bg-primary/12 px-1.5 py-0.5 font-medium text-primary">
          <ListTree className="size-3.5" /> Query plan
        </span>
        <span className="tabular-nums">{formatDurationMs(result.durationMs)}</span>
        <Button variant="ghost" size="xs" className="ml-auto" onClick={copyPlan}>
          <Copy className="size-3.5" /> Copy
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-background p-4">
        <pre className="w-max whitespace-pre font-mono text-[12.5px] leading-relaxed text-foreground/90">
          {text}
        </pre>
      </div>
    </div>
  )
}

function SnippetList({
  snippets,
  onPick,
  onDelete,
}: {
  snippets: Snippet[]
  onPick: (s: Snippet) => void
  onDelete: (id: string) => void
}) {
  if (snippets.length === 0) {
    return <p className="px-2 py-4 text-xs text-muted-foreground">No saved snippets yet.</p>
  }
  return (
    <div className="space-y-1">
      {snippets.map((s) => (
        <div
          key={s.id}
          className="group flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-accent cursor-pointer"
          onClick={() => onPick(s)}
        >
          <Star className="size-3.5 shrink-0 text-amber-500" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm">{s.name}</div>
            <div className="truncate font-mono text-[10px] text-muted-foreground">{s.sql}</div>
          </div>
          <button
            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(s.id)
            }}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

function HistoryList({
  history,
  onPick,
  onClear,
}: {
  history: HistoryEntry[]
  onPick: (h: HistoryEntry) => void
  onClear: () => void
}) {
  if (history.length === 0) {
    return <p className="px-2 py-4 text-xs text-muted-foreground">No query history yet.</p>
  }
  return (
    <div className="space-y-1">
      <button
        onClick={onClear}
        className="mb-1 w-full text-left px-2 text-[11px] text-muted-foreground hover:text-foreground"
      >
        Clear history
      </button>
      {history.map((h) => (
        <div
          key={h.id}
          className="flex items-start gap-1.5 rounded-md px-2 py-1.5 hover:bg-accent cursor-pointer"
          onClick={() => onPick(h)}
        >
          <span
            className={cn(
              'mt-1 size-1.5 shrink-0 rounded-full',
              h.ok ? 'bg-emerald-500' : 'bg-destructive',
            )}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-[11px] text-foreground/90">{h.sql}</div>
            <div className="text-[10px] text-muted-foreground">
              {h.ok ? `${h.rowCount ?? 0} rows` : 'error'} · {formatDurationMs(h.durationMs)}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
