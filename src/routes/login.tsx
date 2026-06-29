import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { Database, Loader2 } from 'lucide-react'
import { loginFn, meFn } from '#/server/fns'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'

export const Route = createFileRoute('/login')({
  loader: async () => {
    const me = await meFn()
    // If Cloudflare Access (or none) handles auth, there is no password form.
    if (me.user) throw redirect({ to: '/' })
    return { mode: me.mode }
  },
  component: LoginPage,
})

function LoginPage() {
  const { mode } = Route.useLoaderData()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (mode !== 'password') {
    return (
      <Screen>
        <div className="w-full max-w-md space-y-4 text-center">
          <Brand />
          <p className="text-sm text-muted-foreground">
            This deployment is protected by{' '}
            {mode === 'cloudflare_access' ? 'Cloudflare Access' : 'no app auth'}. You should have
            been routed automatically — try reloading.
          </p>
        </div>
      </Screen>
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await loginFn({ data: { password } })
      if (res.ok) {
        await router.invalidate()
        router.navigate({ to: '/' })
      } else {
        setError(res.error)
      }
    } catch {
      setError('Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Screen>
      <div className="w-full max-w-sm animate-fade-up">
        <Brand />
        <div className="mt-8 rounded-xl border border-border bg-surface-100 p-6 shadow-[0_12px_40px_rgba(0,0,0,0.4)]">
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>
            <Button type="submit" className="w-full" disabled={loading || !password}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : 'Sign in'}
            </Button>
          </form>
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Password auth is the built-in fallback. Configure Cloudflare Access for production SSO.
        </p>
      </div>
    </Screen>
  )
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden p-6">
      <div className="dot-grid pointer-events-none absolute inset-0 opacity-50" />
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[36rem] -translate-x-1/2 rounded-full opacity-30 blur-3xl"
        style={{ background: 'radial-gradient(closest-side, #3ecf8e, transparent)' }}
      />
      <div className="relative">{children}</div>
    </div>
  )
}

function Brand() {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="grid size-12 place-items-center rounded-xl bg-gradient-to-b from-[#4ade9c] to-[#249a67] text-[#04140d] shadow-[0_4px_16px_rgba(62,207,142,0.3)]">
        <Database className="size-6" strokeWidth={2.4} />
      </div>
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">pgplane</h1>
        <p className="text-sm text-muted-foreground">Postgres control plane</p>
      </div>
    </div>
  )
}
