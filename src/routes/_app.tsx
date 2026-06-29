import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { meFn } from '#/server/fns'
import { AppShell } from '#/components/app-shell'

export const Route = createFileRoute('/_app')({
  loader: async () => {
    const me = await meFn()
    if (!me.user) throw redirect({ to: '/login' })
    return me
  },
  component: AppLayout,
})

function AppLayout() {
  const me = Route.useLoaderData()
  return (
    <AppShell user={me.user!} connection={me.connection!}>
      <Outlet />
    </AppShell>
  )
}
