import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions'
import { Api } from 'telegram'
import { computeCheck } from 'telegram/Password'

const SESSION_KEY = 'wp_tg_session'
const CREDS_KEY = 'wp_tg_creds'
const PHONE_KEY = 'wp_tg_phone'

export type TgCreds = { apiId: number; apiHash: string }

export type TgDialog = {
  id: string
  title: string
  unread: number
  entity: Api.TypeEntityLike
  isUser: boolean
  isGroup: boolean
  isChannel: boolean
  /** True only when current user can post/send messages here */
  canSend: boolean
  sendBlockedReason?: string
}

/** Detect send permission from Telegram entity flags (no extra RPC). */
export function canSendToEntity(entity: unknown): { canSend: boolean; reason?: string } {
  if (!entity || typeof entity !== 'object') {
    return { canSend: false, reason: 'Unknown chat' }
  }

  const e = entity as {
    className?: string
    deleted?: boolean
    bot?: boolean
    left?: boolean
    kicked?: boolean
    restricted?: boolean
    creator?: boolean
    broadcast?: boolean
    megagroup?: boolean
    adminRights?: {
      postMessages?: boolean
      sendMessages?: boolean
    } | null
    bannedRights?: { sendMessages?: boolean } | null
    defaultBannedRights?: { sendMessages?: boolean } | null
  }

  const kind = e.className || ''

  if (kind === 'User' || kind === 'UserEmpty') {
    if (e.deleted) return { canSend: false, reason: 'Deleted account' }
    return { canSend: true }
  }

  if (kind === 'Chat' || kind === 'ChatForbidden') {
    if (kind === 'ChatForbidden' || e.left || e.kicked) {
      return { canSend: false, reason: 'You cannot send messages in this group' }
    }
    return { canSend: true }
  }

  if (kind === 'Channel' || kind === 'ChannelForbidden') {
    if (kind === 'ChannelForbidden' || e.left) {
      return { canSend: false, reason: 'You cannot send messages here' }
    }

    // Broadcast channel — only admins/creators with post rights
    if (e.broadcast) {
      if (e.creator) return { canSend: true }
      if (e.adminRights?.postMessages) return { canSend: true }
      return { canSend: false, reason: 'Channel is read-only (no post permission)' }
    }

    // Supergroup / megagroup
    if (e.creator) return { canSend: true }
    if (e.adminRights) {
      // Admin with explicit ban on send is rare; allow unless bannedRights blocks
      if (e.bannedRights?.sendMessages) {
        return { canSend: false, reason: 'Sending is restricted for your account' }
      }
      return { canSend: true }
    }
    if (e.bannedRights?.sendMessages) {
      return { canSend: false, reason: 'You are restricted from sending messages' }
    }
    if (e.defaultBannedRights?.sendMessages) {
      return { canSend: false, reason: 'Sending is disabled in this group' }
    }
    return { canSend: true }
  }

  return { canSend: false, reason: 'Cannot send in this chat' }
}

export type TgMessage = {
  id: number
  text: string
  out: boolean
  date: number
  senderName: string
}

let client: TelegramClient | null = null
let phoneCodeHash = ''

function loadCreds(): TgCreds | null {
  try {
    const raw = localStorage.getItem(CREDS_KEY)
    if (!raw) return null
    return JSON.parse(raw) as TgCreds
  } catch {
    return null
  }
}

export function saveCreds(apiId: number, apiHash: string) {
  localStorage.setItem(CREDS_KEY, JSON.stringify({ apiId, apiHash }))
}

export function getSavedCreds() {
  return loadCreds()
}

export function getSessionString() {
  return localStorage.getItem(SESSION_KEY) || ''
}

export function clearTelegramSession() {
  localStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(PHONE_KEY)
  if (client) {
    void client.disconnect()
    client = null
  }
}

export async function getClient(): Promise<TelegramClient> {
  const creds = loadCreds()
  if (!creds?.apiId || !creds?.apiHash) {
    throw new Error('API ID and API Hash are required. Get them from https://my.telegram.org')
  }
  if (client) return client

  const session = new StringSession(getSessionString())
  // Browser: never let GramJS call node:os (os.default.type is not a function in Vite)
  client = new TelegramClient(session, creds.apiId, creds.apiHash, {
    connectionRetries: 5,
    useWSS: true,
    deviceModel: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 32) : 'Working Places Web',
    systemVersion: 'Web',
    appVersion: '1.0.0',
    langCode: 'en',
    systemLangCode: typeof navigator !== 'undefined' ? navigator.language || 'en' : 'en',
  })
  await client.connect()
  return client
}

export async function isAuthorized(): Promise<boolean> {
  try {
    const c = await getClient()
    return c.connected ? await c.checkAuthorization() : false
  } catch {
    return false
  }
}

export async function sendPhoneCode(phone: string): Promise<void> {
  const c = await getClient()
  localStorage.setItem(PHONE_KEY, phone)
  const result = await c.sendCode(
    {
      apiId: loadCreds()!.apiId,
      apiHash: loadCreds()!.apiHash,
    },
    phone,
  )
  phoneCodeHash = result.phoneCodeHash
}

export async function signInWithCode(code: string): Promise<'ok' | '2fa'> {
  const c = await getClient()
  const phone = localStorage.getItem(PHONE_KEY) || ''
  try {
    await c.invoke(
      new Api.auth.SignIn({
        phoneNumber: phone,
        phoneCodeHash,
        phoneCode: code,
      }),
    )
    await persistSession()
    return 'ok'
  } catch (err: unknown) {
    const msg = String(err)
    if (msg.includes('SESSION_PASSWORD_NEEDED')) return '2fa'
    throw err
  }
}

export async function signInWithPassword(password: string): Promise<void> {
  const c = await getClient()
  const srp = await c.invoke(new Api.account.GetPassword())
  const check = await computeCheck(srp, password)
  await c.invoke(new Api.auth.CheckPassword({ password: check }))
  await persistSession()
}

async function persistSession() {
  if (!client) return
  const session = client.session.save() as unknown as string
  localStorage.setItem(SESSION_KEY, session)
}

/**
 * Ensure authorized client is connected, re-save the StringSession,
 * and return the fresh GramJS session string (also stored in localStorage).
 */
export async function refreshAndExportSession(): Promise<string> {
  const c = await getClient()
  const ok = await c.checkAuthorization()
  if (!ok) {
    throw new Error('Not logged in. Open WP01 Telegram Workspace and sign in first.')
  }
  // Touch API so session is fully established
  await c.getMe()
  const session = c.session.save() as unknown as string
  if (!session) {
    throw new Error('Could not save session string from Telegram client')
  }
  localStorage.setItem(SESSION_KEY, session)
  return session
}

export function hasStoredSession(): boolean {
  return Boolean(getSessionString() && loadCreds()?.apiId)
}

export async function getMe() {
  const c = await getClient()
  return c.getMe()
}

export async function listDialogs(limit = 40): Promise<TgDialog[]> {
  const c = await getClient()
  const dialogs = await c.getDialogs({ limit })
  return dialogs.map((d) => {
    const entity = d.entity
    const id = String(d.id)
    const title = d.title || 'Chat'
    const isUser = entity?.className === 'User'
    const isChannel = entity?.className === 'Channel'
    const isBroadcast = isChannel && !!(entity as Api.Channel).broadcast
    const isGroup = entity?.className === 'Chat' || (isChannel && !isBroadcast)
    const send = canSendToEntity(entity)
    return {
      id,
      title,
      unread: d.unreadCount || 0,
      entity: entity as Api.TypeEntityLike,
      isUser: !!isUser,
      isGroup: !!isGroup,
      isChannel: !!isBroadcast,
      canSend: send.canSend,
      sendBlockedReason: send.reason,
    }
  })
}

export async function sendMessage(entity: Api.TypeEntityLike, text: string): Promise<void> {
  const perm = canSendToEntity(entity)
  if (!perm.canSend) {
    throw new Error(perm.reason || 'No permission to send messages in this chat')
  }
  const c = await getClient()
  await c.sendMessage(entity, { message: text })
}

export async function getMessages(entity: Api.TypeEntityLike, limit = 40): Promise<TgMessage[]> {
  const c = await getClient()
  const messages = await c.getMessages(entity, { limit })
  const result: TgMessage[] = []

  for (const m of messages) {
    if (!m.message && !m.media) continue
    let senderName = m.out ? 'You' : 'Contact'
    try {
      if (m.senderId) {
        const sender = await m.getSender()
        if (sender && 'firstName' in sender) {
          const u = sender as Api.User
          senderName = [u.firstName, u.lastName].filter(Boolean).join(' ') || senderName
        } else if (sender && 'title' in sender) {
          senderName = (sender as Api.Channel).title || senderName
        }
      }
    } catch {
      /* ignore */
    }
    result.push({
      id: m.id,
      text: m.message || (m.media ? '[media]' : ''),
      out: !!m.out,
      date: m.date || 0,
      senderName,
    })
  }

  return result.reverse()
}

export async function logoutTelegram(): Promise<void> {
  try {
    if (client) {
      await client.invoke(new Api.auth.LogOut())
      await client.disconnect()
    }
  } catch {
    /* ignore */
  }
  client = null
  clearTelegramSession()
  localStorage.removeItem(CREDS_KEY)
}
