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
      <div className="min-h-screen grid place-items-center p-6">
        <div className="max-w-md text-center space-y-3">
          <Brand />
          <p className="text-muted-foreground text-sm">
            This deployment is protected by{' '}
            {mode === 'cloudflare_access' ? 'Cloudflare Access' : 'no app auth'}. You should have
            been routed automatically — try reloading.
          </p>
        </div>
      </div>
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
    <div className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-sm space-y-8">
        <Brand />
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
        <p className="text-xs text-muted-foreground text-center">
          Password auth is the built-in fallback. Configure Cloudflare Access for production SSO.
        </p>
      </div>
    </div>
  )
}

function Brand() {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="size-12 rounded-xl bg-primary/15 text-primary grid place-items-center ring-1 ring-primary/30">
        <Database className="size-6" />
      </div>
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">pgplane</h1>
        <p className="text-sm text-muted-foreground">Postgres control plane</p>
      </div>
    </div>
  )
}
