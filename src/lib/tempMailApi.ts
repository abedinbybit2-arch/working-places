/**
 * Temporary email — primary: mail.tm, fallback: 1secmail.
 * Session (address + credentials) persists in localStorage across refresh.
 */

const MAILTM = 'https://api.mail.tm'
const SECMAIL = 'https://www.1secmail.com/api/v1'
const STORAGE_KEY = 'wp_temp_mail_v1'

export type MailProvider = 'mail.tm' | '1secmail'

export type TempMailbox = {
  provider: MailProvider
  address: string
  /** mail.tm only */
  password?: string
  token?: string
  /** 1secmail parts */
  login?: string
  domain?: string
  createdAt: number
}

export type TempMessage = {
  id: string
  from: string
  subject: string
  intro?: string
  date?: string
  seen?: boolean
  bodyText?: string
  bodyHtml?: string
}

async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = 15000): Promise<T> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(text || `HTTP ${res.status}`)
    }
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  } finally {
    clearTimeout(t)
  }
}

export function loadSavedMailbox(): TempMailbox | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const box = JSON.parse(raw) as TempMailbox
    if (!box?.address || !box?.provider) return null
    return box
  } catch {
    return null
  }
}

export function saveMailbox(box: TempMailbox) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(box))
}

export function clearSavedMailbox() {
  localStorage.removeItem(STORAGE_KEY)
}

function randomLocal(len = 10) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

function randomPassword(len = 14) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$'
  let s = ''
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

/* ─── mail.tm ─── */

async function mailtmDomains(): Promise<string[]> {
  const data = await fetchJson<{
    'hydra:member'?: { domain: string; isActive?: boolean }[]
  }>(`${MAILTM}/domains?page=1`)
  const list = data['hydra:member'] || []
  return list.filter((d) => d.isActive !== false).map((d) => d.domain)
}

async function mailtmCreate(): Promise<TempMailbox> {
  const domains = await mailtmDomains()
  if (!domains.length) throw new Error('mail.tm: no active domains')
  const domain = domains[Math.floor(Math.random() * Math.min(3, domains.length))]
  const address = `${randomLocal(12)}@${domain}`
  const password = randomPassword()

  await fetchJson(`${MAILTM}/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ address, password }),
  })

  const tokenRes = await fetchJson<{ token: string }>(`${MAILTM}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ address, password }),
  })

  if (!tokenRes?.token) throw new Error('mail.tm: token missing')

  return {
    provider: 'mail.tm',
    address,
    password,
    token: tokenRes.token,
    createdAt: Date.now(),
  }
}

async function mailtmRefreshToken(box: TempMailbox): Promise<string> {
  if (!box.password) throw new Error('mail.tm: missing password')
  const tokenRes = await fetchJson<{ token: string }>(`${MAILTM}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ address: box.address, password: box.password }),
  })
  if (!tokenRes?.token) throw new Error('mail.tm: re-auth failed')
  box.token = tokenRes.token
  saveMailbox(box)
  return tokenRes.token
}

async function mailtmMessages(box: TempMailbox): Promise<TempMessage[]> {
  let token = box.token
  if (!token) token = await mailtmRefreshToken(box)

  const load = async (tk: string) =>
    fetchJson<{
      'hydra:member'?: {
        id: string
        from?: { address?: string; name?: string }
        subject?: string
        intro?: string
        createdAt?: string
        seen?: boolean
      }[]
    }>(`${MAILTM}/messages`, {
      headers: { Authorization: `Bearer ${tk}`, Accept: 'application/json' },
    })

  let data
  try {
    data = await load(token)
  } catch {
    token = await mailtmRefreshToken(box)
    data = await load(token)
  }

  return (data['hydra:member'] || []).map((m) => ({
    id: String(m.id),
    from: m.from?.address || m.from?.name || 'unknown',
    subject: m.subject || '(no subject)',
    intro: m.intro,
    date: m.createdAt,
    seen: m.seen,
  }))
}

async function mailtmRead(box: TempMailbox, id: string): Promise<TempMessage> {
  let token = box.token || (await mailtmRefreshToken(box))
  const load = async (tk: string) =>
    fetchJson<{
      id: string
      from?: { address?: string }
      subject?: string
      intro?: string
      createdAt?: string
      text?: string
      html?: string[] | string
    }>(`${MAILTM}/messages/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${tk}`, Accept: 'application/json' },
    })

  let m
  try {
    m = await load(token)
  } catch {
    token = await mailtmRefreshToken(box)
    m = await load(token)
  }

  const html = Array.isArray(m.html) ? m.html.join('\n') : m.html
  return {
    id: String(m.id),
    from: m.from?.address || 'unknown',
    subject: m.subject || '(no subject)',
    intro: m.intro,
    date: m.createdAt,
    bodyText: m.text,
    bodyHtml: html,
  }
}

/* ─── 1secmail fallback ─── */

async function secmailCreate(): Promise<TempMailbox> {
  const list = await fetchJson<string[]>(`${SECMAIL}/?action=genRandomMailbox&count=1`)
  const address = list?.[0]
  if (!address || !address.includes('@')) throw new Error('1secmail: create failed')
  const [login, domain] = address.split('@')
  return {
    provider: '1secmail',
    address,
    login,
    domain,
    createdAt: Date.now(),
  }
}

async function secmailMessages(box: TempMailbox): Promise<TempMessage[]> {
  if (!box.login || !box.domain) throw new Error('1secmail: invalid mailbox')
  const list = await fetchJson<
    { id: number; from: string; subject: string; date: string }[]
  >(`${SECMAIL}/?action=getMessages&login=${encodeURIComponent(box.login)}&domain=${encodeURIComponent(box.domain)}`)

  return (list || []).map((m) => ({
    id: String(m.id),
    from: m.from,
    subject: m.subject || '(no subject)',
    date: m.date,
  }))
}

async function secmailRead(box: TempMailbox, id: string): Promise<TempMessage> {
  if (!box.login || !box.domain) throw new Error('1secmail: invalid mailbox')
  const m = await fetchJson<{
    id: number
    from: string
    subject: string
    date: string
    textBody?: string
    htmlBody?: string
    body?: string
  }>(
    `${SECMAIL}/?action=readMessage&login=${encodeURIComponent(box.login)}&domain=${encodeURIComponent(box.domain)}&id=${encodeURIComponent(id)}`,
  )
  return {
    id: String(m.id),
    from: m.from,
    subject: m.subject || '(no subject)',
    date: m.date,
    bodyText: m.textBody || m.body,
    bodyHtml: m.htmlBody,
  }
}

/* ─── public API ─── */

export async function createTempMailbox(): Promise<TempMailbox> {
  try {
    const box = await mailtmCreate()
    saveMailbox(box)
    return box
  } catch (e1) {
    try {
      const box = await secmailCreate()
      saveMailbox(box)
      return box
    } catch (e2) {
      const a = e1 instanceof Error ? e1.message : String(e1)
      const b = e2 instanceof Error ? e2.message : String(e2)
      throw new Error(`Temp mail create failed. mail.tm: ${a} | 1secmail: ${b}`)
    }
  }
}

/** Restore saved box; refresh mail.tm token if needed. Does not delete on refresh. */
export async function restoreTempMailbox(): Promise<TempMailbox | null> {
  const box = loadSavedMailbox()
  if (!box) return null
  if (box.provider === 'mail.tm' && box.password) {
    try {
      await mailtmRefreshToken(box)
    } catch {
      // keep stored box; token may refresh later on message fetch
    }
  }
  return loadSavedMailbox()
}

export async function listTempMessages(box: TempMailbox): Promise<TempMessage[]> {
  if (box.provider === 'mail.tm') return mailtmMessages(box)
  return secmailMessages(box)
}

export async function readTempMessage(box: TempMailbox, id: string): Promise<TempMessage> {
  if (box.provider === 'mail.tm') return mailtmRead(box, id)
  return secmailRead(box, id)
}

export function deleteLocalMailbox() {
  clearSavedMailbox()
}
