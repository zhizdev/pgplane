/**
 * Access to runtime configuration. On Cloudflare Workers (and the local
 * workerd dev runtime via @cloudflare/vite-plugin) bindings & vars from
 * wrangler.jsonc / .env (dev) / Worker secrets (prod) are exposed through
 * `cloudflare:workers`.
 */
import { env as cfEnv } from 'cloudflare:workers'

type EnvBag = Record<string, string | undefined> & {
  // Bindings (optional)
  HYPERDRIVE?: { connectionString: string }
}

const bag = cfEnv as unknown as EnvBag

export function getEnv(): EnvBag {
  return bag
}

export function envStr(key: string, fallback = ''): string {
  const v = bag[key]
  return typeof v === 'string' && v.length > 0 ? v : fallback
}

export function envBool(key: string, fallback = false): boolean {
  const v = bag[key]
  if (v == null) return fallback
  return v === 'true' || v === '1' || v === 'yes'
}
