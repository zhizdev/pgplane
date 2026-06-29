// Minimal ambient declaration for the Cloudflare runtime module so TypeScript
// resolves `import { env } from 'cloudflare:workers'`. At runtime workerd
// provides the real binding object. Run `pnpm cf-typegen` for richer types.
declare module 'cloudflare:workers' {
  export const env: Record<string, any> & {
    HYPERDRIVE?: { connectionString: string }
  }
}
