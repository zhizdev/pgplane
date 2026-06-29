import { createRemoteJWKSet, jwtVerify } from 'jose'
import { getRequestHeader, useSession } from '@tanstack/react-start/server'
import { envStr } from './env'

export type Role = 'admin' | 'editor' | 'viewer'
export type User = { email: string; role: Role; via: 'password' | 'cloudflare_access' | 'none' }

export type AuthMode = 'auto' | 'password' | 'cloudflare_access' | 'none'

const SESSION_NAME = 'pgplane_session'
const SESSION_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

type SessionData = { email?: string; role?: Role; at?: number }

function sessionPassword(): string {
  const s = envStr('SESSION_SECRET')
  // useSession requires >= 32 chars. Fall back to a fixed dev secret with a warning.
  if (s.length >= 32) return s
  return 'pgplane-insecure-dev-session-secret-please-change'
}

export function getAppSession() {
  return useSession<SessionData>({
    name: SESSION_NAME,
    password: sessionPassword(),
    maxAge: SESSION_MAX_AGE,
  })
}

export function authMode(): AuthMode {
  const m = (envStr('AUTH_MODE', 'auto') as AuthMode) || 'auto'
  return m
}

function cfAccessConfigured(): boolean {
  return !!envStr('CF_ACCESS_TEAM_DOMAIN') && !!envStr('CF_ACCESS_AUD')
}

/** Resolve the effective auth strategy given config. */
export function effectiveMode(): Exclude<AuthMode, 'auto'> {
  const m = authMode()
  if (m === 'auto') return cfAccessConfigured() ? 'cloudflare_access' : 'password'
  return m
}

function roleForEmail(email: string, fallback: Role): Role {
  const inList = (key: string) =>
    envStr(key)
      .split(',')
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
      .includes(email.toLowerCase())
  if (inList('ADMINS')) return 'admin'
  if (inList('EDITORS')) return 'editor'
  if (inList('VIEWERS')) return 'viewer'
  return fallback
}

let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null
function getJwks(teamDomain: string) {
  if (!jwksCache) {
    jwksCache = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`))
  }
  return jwksCache
}

async function verifyCfAccess(): Promise<User | null> {
  const token = getRequestHeader('cf-access-jwt-assertion')
  if (!token) return null
  const teamDomain = envStr('CF_ACCESS_TEAM_DOMAIN')
  const aud = envStr('CF_ACCESS_AUD')
  try {
    const { payload } = await jwtVerify(token, getJwks(teamDomain), {
      issuer: teamDomain,
      audience: aud,
    })
    const email = typeof payload.email === 'string' ? payload.email : undefined
    if (!email) return null
    // Default to admin allowlist; if no allowlists configured at all, treat as admin.
    const anyList = envStr('ADMINS') || envStr('EDITORS') || envStr('VIEWERS')
    const role = anyList ? roleForEmail(email, 'viewer') : 'admin'
    return { email, role, via: 'cloudflare_access' }
  } catch {
    return null
  }
}

/** Returns the authenticated user, or null if not authenticated. Never throws. */
export async function getUser(): Promise<User | null> {
  const mode = effectiveMode()

  if (mode === 'none') {
    return { email: 'local@pgplane', role: 'admin', via: 'none' }
  }

  if (mode === 'cloudflare_access') {
    return await verifyCfAccess()
  }

  // password mode → signed session cookie
  const session = await getAppSession()
  if (session.data?.email && session.data.role) {
    return { email: session.data.email, role: session.data.role, via: 'password' }
  }
  return null
}

/** Permission helper for write operations. */
export function canWrite(user: User | null): boolean {
  return user?.role === 'admin' || user?.role === 'editor'
}
export function canAdmin(user: User | null): boolean {
  return user?.role === 'admin'
}

/** True when the deployment is using the built-in password fallback with the
 * default/weak password — surfaced in the UI as a warning. */
export function usingDefaultPassword(): boolean {
  return effectiveMode() === 'password' && envStr('ADMIN_PASSWORD', '') === ''
}

const DEFAULT_PASSWORD = 'pgplane'

export async function loginWithPassword(password: string): Promise<User | null> {
  const expected = envStr('ADMIN_PASSWORD') || DEFAULT_PASSWORD
  if (password !== expected) return null
  const user: User = { email: 'admin', role: 'admin', via: 'password' }
  const session = await getAppSession()
  await session.update({ email: user.email, role: user.role, at: Date.now() })
  return user
}

export async function logout() {
  const session = await getAppSession()
  await session.clear()
}
