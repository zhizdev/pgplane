import { createServerFn } from '@tanstack/react-start'
import { redirect } from '@tanstack/react-router'
import { z } from 'zod'
import {
  canWrite,
  effectiveMode,
  getUser,
  loginWithPassword,
  logout,
  usingDefaultPassword,
  type User,
} from './auth'
import { connectionInfo, withSql } from './db'
import { getColumns, getTableDetail, listSchemas, listTables } from './introspect'
import { deleteRow, getRows, insertRow, updateRow, type Filter } from './data'
import { explainQuery, runQuery } from './query'
import {
  getActivity,
  getConnectionsByState,
  getIndexStats,
  getOverview,
  getTableSizes,
  getTopQueries,
} from './stats'

async function requireUser(): Promise<User> {
  const user = await getUser()
  if (!user) throw redirect({ to: '/login' })
  return user
}
async function requireWriter(): Promise<User> {
  const user = await requireUser()
  if (!canWrite(user)) throw new Error('Forbidden: your role cannot modify data')
  return user
}

/* ----------------------------- auth ----------------------------- */

export const meFn = createServerFn({ method: 'GET' }).handler(async () => {
  const user = await getUser()
  return {
    user,
    mode: effectiveMode(),
    connection: connectionInfo(),
    usingDefaultPassword: usingDefaultPassword(),
  }
})

export const loginFn = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ password: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const user = await loginWithPassword(data.password)
    if (!user) return { ok: false as const, error: 'Incorrect password' }
    return { ok: true as const }
  })

export const logoutFn = createServerFn({ method: 'POST' }).handler(async () => {
  await logout()
  return { ok: true as const }
})

/* -------------------------- introspection ----------------------- */

export const schemasFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireUser()
  return withSql(() => listSchemas())
})

export const tablesFn = createServerFn({ method: 'GET' })
  .validator((d: unknown) => z.object({ schema: z.string() }).parse(d))
  .handler(async ({ data }) => {
    await requireUser()
    return withSql(() => listTables(data.schema))
  })

export const tableDetailFn = createServerFn({ method: 'GET' })
  .validator((d: unknown) => z.object({ schema: z.string(), table: z.string() }).parse(d))
  .handler(async ({ data }) => {
    await requireUser()
    return withSql(() => getTableDetail(data.schema, data.table))
  })

export const columnsFn = createServerFn({ method: 'GET' })
  .validator((d: unknown) => z.object({ schema: z.string(), table: z.string() }).parse(d))
  .handler(async ({ data }) => {
    await requireUser()
    return withSql(() => getColumns(data.schema, data.table))
  })

/* ------------------------------ data ---------------------------- */

const filterSchema = z.object({
  column: z.string(),
  op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is_null', 'not_null']),
  value: z.string().optional(),
})

export const rowsFn = createServerFn({ method: 'GET' })
  .validator((d: unknown) =>
    z
      .object({
        schema: z.string(),
        table: z.string(),
        limit: z.number().int().min(1).max(1000).default(100),
        offset: z.number().int().min(0).default(0),
        orderBy: z.string().optional(),
        dir: z.enum(['asc', 'desc']).optional(),
        filters: z.array(filterSchema).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requireUser()
    return withSql(() => getRows({ ...data, filters: data.filters as Filter[] | undefined }))
  })

export const updateRowFn = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        schema: z.string(),
        table: z.string(),
        pk: z.record(z.string(), z.unknown()),
        changes: z.record(z.string(), z.unknown()),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requireWriter()
    return withSql(async () => ({ ok: true as const, row: await updateRow(data) }))
  })

export const insertRowFn = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        schema: z.string(),
        table: z.string(),
        values: z.record(z.string(), z.unknown()),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requireWriter()
    return withSql(async () => ({ ok: true as const, row: await insertRow(data) }))
  })

export const deleteRowFn = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        schema: z.string(),
        table: z.string(),
        pk: z.record(z.string(), z.unknown()),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requireWriter()
    return withSql(async () => ({ ok: true as const, count: await deleteRow(data) }))
  })

/* --------------------------- sql editor ------------------------- */

export const runQueryFn = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z.object({ text: z.string().min(1), timeoutMs: z.number().int().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const user = await requireUser()
    const readOnly = !canWrite(user)
    return withSql(() => runQuery({ text: data.text, readOnly, timeoutMs: data.timeoutMs }))
  })

export const explainFn = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z.object({ text: z.string().min(1), analyze: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const user = await requireUser()
    const analyze = !!data.analyze && canWrite(user)
    return withSql(() => explainQuery({ text: data.text, analyze }))
  })

/* -------------------------- performance ------------------------- */

export const overviewFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireUser()
  return withSql(() => getOverview())
})
export const activityFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireUser()
  return withSql(() => getActivity())
})
export const topQueriesFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireUser()
  return withSql(() => getTopQueries())
})
export const tableSizesFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireUser()
  return withSql(() => getTableSizes())
})
export const indexStatsFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireUser()
  return withSql(() => getIndexStats())
})
export const connectionsFn = createServerFn({ method: 'GET' }).handler(async () => {
  await requireUser()
  return withSql(() => getConnectionsByState())
})
