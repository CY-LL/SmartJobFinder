import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

// Dev only: serve /api/<name> from netlify/functions/<name>.mts so the app works under `npm run dev`.
// Set APIFY_TOKEN in your shell to use real searches locally.
function netlifyFunctions(): Plugin {
  return {
    name: 'dev-netlify-functions',
    apply: 'serve',
    configureServer(server) {
      ;(globalThis as { Netlify?: unknown }).Netlify = { env: { get: (k: string) => process.env[k] } }
      server.middlewares.use(async (req, res, next) => {
        const name = req.url?.match(/^\/api\/(\w+)/)?.[1]
        if (!name) return next()
        try {
          const mod = await server.ssrLoadModule(`/netlify/functions/${name}.mts`)
          const chunks: Buffer[] = []
          for await (const c of req) chunks.push(c as Buffer)
          const request = new Request(`http://localhost${req.url}`, { method: req.method, headers: { 'content-type': 'application/json' }, body: chunks.length ? Buffer.concat(chunks) : undefined })
          const response: Response = await mod.default(request)
          res.statusCode = response.status
          res.setHeader('content-type', response.headers.get('content-type') ?? 'application/json')
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (e) {
          next(e)
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), netlifyFunctions()],
})
