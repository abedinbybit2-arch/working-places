import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['buffer', 'process', 'util', 'stream', 'events', 'path', 'crypto'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
    {
      name: 'tonapi-proxy',
      configureServer(server) {
        server.middlewares.use('/api/tonapi', async (req, res) => {
          try {
            const pathWithQuery = (req.url || '').replace(/^\/api\/tonapi/, '') || '/'
            const target = `https://tonapi.io${pathWithQuery}`
            const headers: Record<string, string> = { Accept: 'application/json' }
            if (req.headers['authorization']) headers.Authorization = String(req.headers['authorization'])
            const tgRes = await fetch(target, {
              method: req.method || 'GET',
              headers,
            })
            const body = await tgRes.arrayBuffer()
            res.statusCode = tgRes.status
            res.setHeader('Content-Type', tgRes.headers.get('content-type') || 'application/json')
            res.end(Buffer.from(body))
          } catch (e) {
            res.statusCode = 502
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                error: e instanceof Error ? e.message : 'tonapi proxy error',
              }),
            )
          }
        })
      },
    },
    {
      name: 'telegram-bot-api-proxy',
      configureServer(server) {
        server.middlewares.use('/api/telegram', (req, res, next) => {
          if (req.method === 'OPTIONS') {
            res.statusCode = 204
            res.end()
            return
          }
          if (req.method !== 'POST') {
            next()
            return
          }
          const chunks: Buffer[] = []
          req.on('data', (c) => chunks.push(Buffer.from(c)))
          req.on('end', async () => {
            try {
              const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as {
                token?: string
                method?: string
                params?: Record<string, unknown>
              }
              const token = String(body.token || '').trim()
              const method = String(body.method || '').trim()
              const params = body.params || {}
              if (!token || !method) {
                res.statusCode = 400
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ ok: false, description: 'token and method required' }))
                return
              }
              const tgRes = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params),
              })
              const data = await tgRes.text()
              res.statusCode = 200
              res.setHeader('Content-Type', 'application/json')
              res.end(data)
            } catch (e) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(
                JSON.stringify({
                  ok: false,
                  description: e instanceof Error ? e.message : 'proxy error',
                }),
              )
            }
          })
        })
      },
    },
  ],
  resolve: {
    alias: {
      // Prevent GramJS from calling broken browser polyfill: os.default.type()
      os: path.resolve(__dirname, 'src/shims/os.ts'),
      'node:os': path.resolve(__dirname, 'src/shims/os.ts'),
    },
  },
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['telegram', 'buffer', 'big-integer'],
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 2000,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
})
