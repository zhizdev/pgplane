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

Everything for local dev lives in a single **`.env`** file (gitignored). Wrangler
loads it into the Worker automatically — there is no separate `.dev.vars`.

```bash
pnpm install

cp .env.example .env

# 1. Point CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE at your database
#    (edit .env).

# 2. Generate a random admin password + session secret straight into .env:
printf 'ADMIN_PASSWORD=%s\n'  "$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | cut -c1-20)" >> .env
printf 'SESSION_SECRET=%s\n'  "$(openssl rand -base64 32)" >> .env

pnpm dev                              # → http://localhost:3000
```

Sign in with the `ADMIN_PASSWORD` from `.env`. It's the **same variable in dev and
production**; if you leave it unset the app falls back to the password `pgplane`
and shows a warning in the UI. To skip the login entirely while hacking locally,
set `AUTH_MODE=none` in `.env`.

> **Do I still need `.dev.vars`?** No. Wrangler reads `.dev.vars` *or* `.env` — if a
> `.dev.vars` exists it wins and `.env` is ignored for Worker vars, so pgplane uses a
> single `.env`. (The Hyperdrive dev connection string is read from `.env` regardless.)

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

> **Pages or Workers?** pgplane builds to a **Cloudflare Worker** (SSR `server-entry`
> + a Hyperdrive binding), so it deploys as a Worker, not a classic Pages site.
> Cloudflare now recommends Workers for full-stack apps, and the "connect a Git repo,
> auto-deploy on push" experience people associate with Pages is now **Workers Builds**.
> Both paths below give you that.

### Option A — CLI (`wrangler deploy`)

```bash
# 1. Create a Hyperdrive over your database
wrangler hyperdrive create pgplane \
  --connection-string="postgresql://user:pass@host:5432/db?sslmode=require"

# 2. Put the printed id into wrangler.jsonc → hyperdrive[0].id

# 3. App secrets (encrypted; the same variable names you use in .env)
wrangler secret put SESSION_SECRET
wrangler secret put ADMIN_PASSWORD     # or configure Cloudflare Access (below)

# 4. Ship
pnpm run deploy
```

> ⚠️ Wrangler also applies a local `.env` to `wrangler deploy`. Keep real
> production values in **encrypted secrets** (`wrangler secret put`) or the
> dashboard — not in a committed file — and either deploy from CI (no `.env`
> present) or use `wrangler deploy --keep-vars` so dashboard values aren't clobbered.

### Option B — Git CI (Workers Builds, the "Pages" experience)

1. Push this repo to GitHub/GitLab.
2. Cloudflare dashboard → **Workers & Pages → Create → Workers → Connect to Git**,
   pick the repo.
3. Build command `pnpm build`, deploy command `npx wrangler deploy` (or leave the
   default — Workers Builds detects Wrangler). Every push redeploys.
4. Add the **Hyperdrive** binding and set `SESSION_SECRET` / `ADMIN_PASSWORD`
   (and any `CF_ACCESS_*`) under the Worker's **Settings → Variables and Secrets**.
   There's no `.env` on the build machine, so config comes from the dashboard.

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
