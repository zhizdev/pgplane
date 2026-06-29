import { Link, useRouter } from '@tanstack/react-router'
import {
  Activity,
  Database,
  GaugeCircle,
  LogOut,
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

const NAV = [
  { to: '/overview', label: 'Overview', icon: GaugeCircle },
  { to: '/editor', label: 'Table editor', icon: Table2 },
  { to: '/sql', label: 'SQL editor', icon: Terminal },
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
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-sidebar">
        <div className="flex h-14 items-center gap-2.5 px-4 border-b border-border">
          <div className="grid size-7 place-items-center rounded-md bg-primary/15 text-primary ring-1 ring-primary/30">
            <Database className="size-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">pgplane</div>
            <div className="text-[11px] text-muted-foreground -mt-0.5">control plane</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
              )}
              activeProps={{ className: 'bg-accent text-accent-foreground font-medium' }}
            >
              <item.icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          ))}
        </nav>

        <ConnectionCard connection={connection} />
        <UserFooter user={user} />
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  )
}

function ConnectionCard({ connection }: { connection: ShellConnection }) {
  return (
    <div className="mx-2 mb-2 rounded-lg border border-border bg-card/50 p-2.5 text-[11px]">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        <span className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500/60" />
        Connected
        {connection.viaHyperdrive ? (
          <span className="ml-auto rounded bg-primary/15 px-1.5 py-px text-primary">Hyperdrive</span>
        ) : null}
      </div>
      <div className="font-mono text-foreground/90 truncate" title={connection.database}>
        {connection.database}
      </div>
      <div className="font-mono text-muted-foreground truncate" title={connection.host}>
        {connection.viaHyperdrive ? `${connection.user} · via Hyperdrive` : `${connection.user}@${connection.host}`}
      </div>
    </div>
  )
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
          <Button variant="ghost" className="w-full justify-start gap-2.5 px-2.5 h-auto py-2">
            <div className="grid size-7 place-items-center rounded-full bg-muted text-xs font-medium uppercase">
              {user.email.slice(0, 2)}
            </div>
            <div className="min-w-0 text-left leading-tight">
              <div className="truncate text-sm">{user.email}</div>
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <ShieldCheck className="size-3" />
                {user.role}
              </div>
            </div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-52">
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
