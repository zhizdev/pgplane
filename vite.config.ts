import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

// Force postgres.js to its Cloudflare/workerd build (cloudflare:sockets + startTls).
// The default resolution / dep-optimizer otherwise picks the node:net+node:tls build,
// whose TLS upgrade hangs inside workerd.
const postgresCf = fileURLToPath(
  new URL('./node_modules/postgres/cf/src/index.js', import.meta.url),
)

const config = defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: [{ find: /^postgres$/, replacement: postgresCf }],
  },
  ssr: {
    optimizeDeps: { exclude: ['postgres'] },
  },
  plugins: [
    devtools(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
