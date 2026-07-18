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
