import { createFileRoute } from '@tanstack/react-router'
import Editor, { type OnMount } from '@monaco-editor/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Clock,
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
import { formatDurationMs } from '#/lib/format'
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
            <Button variant="ghost" size="sm" onClick={() => explain(false)} disabled={running}>
              <Wand2 className="size-4" /> Explain
            </Button>
            {canWrite ? (
              <Button variant="ghost" size="sm" onClick={() => explain(true)} disabled={running}>
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
        <aside className="flex w-64 shrink-0 flex-col border-r border-border">
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
                theme="vs-dark"
                value={sql}
                onChange={(v) => setSql(v ?? '')}
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
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-4 py-1.5 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{result.command ?? 'OK'}</span>
        <span>{result.rowCount} rows</span>
        <span>{formatDurationMs(result.durationMs)}</span>
        {result.truncated ? (
          <span className="text-amber-500">showing first {result.rows.length}</span>
        ) : null}
      </div>
      <div className="min-h-0 flex-1">
        {result.columns.length ? (
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
