import { Buffer } from 'buffer'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// GramJS expects Node globals in the browser
const g = globalThis as typeof globalThis & {
  Buffer?: typeof Buffer
  global?: typeof globalThis
  process?: { env: Record<string, string | undefined> }
}

g.Buffer = Buffer
g.global = globalThis
if (!g.process) {
  // Minimal stub for GramJS / polyfills (full Node Process types not needed in browser)
  g.process = { env: {} } as typeof g.process
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
