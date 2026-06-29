import { Link, useRouter } from '@tanstack/react-router'
import {
  Activity,
  ChevronsUpDown,
  Database,
  GaugeCircle,
  LogOut,
  Plug,
  ShieldCheck,
  Table2,
  Terminal,
} from 'lucide-react'
import { toast } from 'sonner'
import { logoutFn } from '#/server/fns'
import { cn } from '#/lib/utils'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'

export type ShellUser = { email: string; role: string; via: string }
export type ShellConnection = {
  host: string
  port: string
  database: string
  user: string
  ssl: string | boolean
  viaHyperdrive: boolean
}

const NAV_PRIMARY = [
  { to: '/overview', label: 'Project Overview', icon: GaugeCircle },
  { to: '/editor', label: 'Table Editor', icon: Table2 },
  { to: '/sql', label: 'SQL Editor', icon: Terminal },
] as const

const NAV_SECONDARY = [
  { to: '/database', label: 'Database', icon: Database },
  { to: '/performance', label: 'Performance', icon: Activity },
] as const

export function AppShell({
  user,
  connection,
  children,
}: {
  user: ShellUser
  connection: ShellConnection
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">
      <TopBar connection={connection} />
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-sidebar">
          <nav className="flex-1 overflow-y-auto px-2.5 py-3">
            <NavGroup items={NAV_PRIMARY} />
            <div className="my-3 h-px bg-border" />
            <NavGroup items={NAV_SECONDARY} />
          </nav>
          <UserFooter user={user} />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
          {children}
        </main>
      </div>
    </div>
  )
}

function NavGroup({
  items,
}: {
  items: readonly { to: string; label: string; icon: React.ComponentType<{ className?: string }> }[]
}) {
  return (
    <div className="space-y-0.5">
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className={cn(
            'group flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] font-medium',
            'text-foreground/55 transition-colors hover:bg-surface-200 hover:text-foreground',
          )}
          activeProps={{
            className:
              'bg-surface-200 text-foreground ring-1 ring-inset ring-border shadow-[0_1px_0_rgba(0,0,0,0.25)]',
          }}
        >
          {({ isActive }: { isActive: boolean }) => (
            <>
              <item.icon
                className={cn(
                  'size-[18px] shrink-0 transition-colors',
                  isActive ? 'text-primary' : 'text-foreground/45 group-hover:text-foreground/80',
                )}
              />
              {item.label}
            </>
          )}
        </Link>
      ))}
    </div>
  )
}

function TopBar({ connection }: { connection: ShellConnection }) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-sidebar pl-3 pr-3">
      {/* brand mark */}
      <div className="flex items-center gap-2 pr-1">
        <div className="grid size-6 place-items-center rounded-[7px] bg-gradient-to-b from-[#4ade9c] to-[#249a67] text-[#04140d] shadow-[0_1px_2px_rgba(0,0,0,0.4)]">
          <Database className="size-3.5" strokeWidth={2.5} />
        </div>
        <span className="text-[13px] font-semibold tracking-tight">pgplane</span>
      </div>

      <Sep />

      {/* database breadcrumb */}
      <div
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px]"
        title={`${connection.user}@${connection.host}:${connection.port}`}
      >
        <Database className="size-3.5 text-foreground/45" />
        <span className="font-medium">{connection.database}</span>
      </div>

      <span className="rounded-full border border-border bg-surface-200 px-2 py-[3px] text-[11px] font-medium text-foreground/70">
        {connection.viaHyperdrive ? 'Hyperdrive' : connection.ssl ? 'SSL' : 'direct'}
      </span>

      {/* connection status pill */}
      <div className="ml-auto flex items-center gap-2.5">
        <div className="flex items-center gap-1.5 rounded-md border border-border bg-surface-100 px-2.5 py-1 text-[12px] text-foreground/70">
          <Plug className="size-3.5 text-primary" />
          <span className="hidden sm:inline">Connected</span>
          <span className="size-1.5 rounded-full bg-primary shadow-[0_0_6px] shadow-primary/60" />
        </div>
      </div>
    </header>
  )
}

function Sep() {
  return <span className="select-none text-base font-light text-border-strong">/</span>
}

function UserFooter({ user }: { user: ShellUser }) {
  const router = useRouter()
  async function doLogout() {
    try {
      await logoutFn()
      await router.invalidate()
      router.navigate({ to: '/login' })
    } catch {
      toast.error('Logout failed')
    }
  }
  return (
    <div className="border-t border-border p-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-auto w-full justify-start gap-2.5 px-2 py-2 hover:bg-surface-200"
          >
            <div className="grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-b from-surface-300 to-surface-200 text-[11px] font-semibold uppercase ring-1 ring-border">
              {user.email.slice(0, 2)}
            </div>
            <div className="min-w-0 flex-1 text-left leading-tight">
              <div className="truncate text-[13px] font-medium">{user.email}</div>
              <div className="flex items-center gap-1 text-[11px] capitalize text-muted-foreground">
                <ShieldCheck className="size-3 text-primary/80" />
                {user.role}
              </div>
            </div>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-56">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Authenticated via {user.via.replace('_', ' ')}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {user.via === 'password' ? (
            <DropdownMenuItem onClick={doLogout}>
              <LogOut className="size-4" /> Sign out
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled>Managed by identity provider</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
