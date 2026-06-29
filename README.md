# pgplane

A self-hosted, Supabase-Studio-style control plane for **any** Postgres-compatible
database — table editor, SQL editor, schema explorer, and live performance
insights — built with **TanStack Start** and deployed to **Cloudflare Workers**.

Point it at a database that doesn't have a nice UI (RDS/Aurora, Neon, plain
Postgres, …) and get the nice UI.

## Features

- **Table editor** — browse any table with server-side pagination, sorting and
  filtering; inline cell editing, insert and delete rows (TanStack Table + Query).
- **SQL editor** — Monaco editor with `⌘/Ctrl+Enter` to run, `EXPLAIN` /
  `EXPLAIN ANALYZE`, a virtualized results grid, and **snippets + query history
  saved in localStorage**.
- **Database explorer** — schemas, tables/views, columns, indexes and constraints.
- **Performance** — `pg_stat_statements` top queries, live `pg_stat_activity`,
  table & index sizes, unused-index detection, cache-hit ratio, connections.
- **Auth, secure by default** — Cloudflare Access (SSO) when configured, otherwise
  a built-in password gate. Roles: `admin` / `editor` / `viewer`, with read-only
  SQL enforced for viewers.

## Stack

TanStack Start (Router + Query + Table) · shadcn/ui + Tailwind v4 · Monaco ·
`postgres` (postgres.js) · Cloudflare Workers + **Hyperdrive**.

## Quick start (local)

```bash
pnpm install

# 1. App config
cp .dev.vars.example .dev.vars        # set ADMIN_PASSWORD + SESSION_SECRET

# 2. Database connection (Hyperdrive proxies it from Node in dev)
cp .env.example .env                  # set the connection string

pnpm dev                              # → http://localhost:3000
```

Sign in with `ADMIN_PASSWORD` (default `pgplane` if unset). Set `AUTH_MODE=none`
in `.dev.vars` to skip the login during local hacking.

## Why Hyperdrive (important)

Cloudflare Workers cannot reliably open a **TLS** Postgres connection directly
from the worker (the runtime's `startTls` is unreliable, and most managed
Postgres requires SSL). [Hyperdrive](https://developers.cloudflare.com/hyperdrive/)
is Cloudflare's connection proxy/pooler: the worker talks to Hyperdrive in
plaintext and Hyperdrive handles TLS + pooling to your origin database. pgplane
uses it for both dev and production.

- **Dev:** `pnpm dev` reads `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`
  from `.env` and proxies the connection from Node — works with any SSL database,
  no secrets in committed files.
- **Prod:** create a real Hyperdrive and reference its id.

## Deploy to Cloudflare

```bash
# 1. Create a Hyperdrive over your database
wrangler hyperdrive create pgplane \
  --connection-string="postgresql://user:pass@host:5432/db?sslmode=require"

# 2. Put the printed id into wrangler.jsonc → hyperdrive[0].id

# 3. App secrets
wrangler secret put SESSION_SECRET
wrangler secret put ADMIN_PASSWORD     # or configure Cloudflare Access (below)

# 4. Ship
pnpm run deploy
```

### Securing it with Cloudflare Access (recommended)

Put the Worker behind [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/)
(Zero Trust → Access → Applications → Self-hosted) and set:

```
AUTH_MODE=auto                  # uses Access automatically when configured
CF_ACCESS_TEAM_DOMAIN=https://<team>.cloudflareaccess.com
CF_ACCESS_AUD=<application aud tag>
ADMINS=you@example.com          # optional role allowlists (else everyone is admin)
```

pgplane verifies the `Cf-Access-Jwt-Assertion` JWT on every request (via `jose`).
If Access is **not** configured, it automatically falls back to the password gate
— so the app is never unprotected by default.

## Connecting to a different database

For local dev, change the connection string in `.env`. pgplane introspects the
target live, so any Postgres-compatible database works out of the box. (Managing
multiple connections from the UI is intentionally out of scope for now — run one
deployment per database, or swap the Hyperdrive binding.)

## Architecture notes

- Server logic lives in `src/server/` (connection, auth, introspection, data,
  stats, SQL runner) and is exposed to the client as TanStack Start **server
  functions** in `src/server/fns.ts`, each guarded by auth + a Zod validator.
- Every request gets a **fresh, request-scoped** `postgres` client
  (`withSql()` + `AsyncLocalStorage`). Workers forbid reusing an I/O object
  across requests, so connections are never cached at module scope.
- All dynamic SQL quotes identifiers and validates them against the live catalog;
  values are always parameterized.

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Local dev server |
| `pnpm build` | Production build |
| `pnpm run deploy` | Build + `wrangler deploy` |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm cf-typegen` | Regenerate binding types after editing `wrangler.jsonc` |
