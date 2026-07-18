/** Telegram group auto-reply — browser live runner (while site tab is open). */

const STORAGE_KEY = 'wp_tg_bot_auto_v2'

export type MatchMode = 'contains' | 'exact' | 'starts_with' | 'regex' | 'link'

export type AutoReplyRule = {
  id: string
  enabled: boolean
  /** For link mode: optional domain filter (e.g. youtube.com). Empty = any link. */
  keyword: string
  mode: MatchMode
  reply: string
  ignoreCase: boolean
}

/** Detect http(s) / www links in a message */
export function extractLinks(text: string): string[] {
  if (!text) return []
  const re =
    /(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi
  const found = text.match(re) || []
  // also bare domains with common TLDs if needed
  return found.map((u) => u.replace(/[.,;:!?]+$/g, ''))
}

export function messageHasLink(text: string): boolean {
  return extractLinks(text).length > 0
}

export type DetectedGroup = {
  id: string
  title: string
  type: string
  username?: string
  enabled: boolean
  lastSeen: number
}

export type BotAutomationConfig = {
  botToken: string
  botUsername?: string
  botId?: number
  onlyGroups: boolean
  replyToMessage: boolean
  /** if true, reply in every group the bot sees */
  replyAllGroups: boolean
  rules: AutoReplyRule[]
  groups: DetectedGroup[]
  updatedAt: number
}

export function defaultConfig(): BotAutomationConfig {
  return {
    botToken: '',
    botUsername: '',
    onlyGroups: true,
    replyToMessage: true,
    replyAllGroups: true,
    rules: [
      {
        id: uid(),
        enabled: true,
        keyword: '',
        mode: 'link',
        reply: 'Links are not allowed here. Please read group rules.',
        ignoreCase: true,
      },
      {
        id: uid(),
        enabled: true,
        keyword: 'hello',
        mode: 'contains',
        reply: 'Hi! This is an automated reply 👋',
        ignoreCase: true,
      },
      {
        id: uid(),
        enabled: true,
        keyword: 'hi',
        mode: 'contains',
        reply: 'Hello! How can I help you?',
        ignoreCase: true,
      },
    ],
    groups: [],
    updatedAt: Date.now(),
  }
}

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function loadBotConfig(): BotAutomationConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const v1 = localStorage.getItem('wp_tg_bot_auto_v1')
      if (v1) {
        const old = JSON.parse(v1) as Partial<BotAutomationConfig> & { allowedChatIds?: string }
        const base = defaultConfig()
        const groups: DetectedGroup[] = []
        if (old.allowedChatIds) {
          for (const id of String(old.allowedChatIds).split(/[\s,]+/).filter(Boolean)) {
            groups.push({
              id,
              title: `Chat ${id}`,
              type: 'supergroup',
              enabled: true,
              lastSeen: Date.now(),
            })
          }
        }
        return {
          ...base,
          ...old,
          rules: Array.isArray(old.rules) ? old.rules : base.rules,
          groups: groups.length ? groups : base.groups,
          replyAllGroups: true,
        }
      }
      return defaultConfig()
    }
    const parsed = JSON.parse(raw) as BotAutomationConfig
    return {
      ...defaultConfig(),
      ...parsed,
      rules: Array.isArray(parsed.rules) ? parsed.rules : defaultConfig().rules,
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
      // prefer working defaults if missing
      replyAllGroups: parsed.replyAllGroups !== false,
    }
  } catch {
    return defaultConfig()
  }
}

export function saveBotConfig(cfg: BotAutomationConfig) {
  const next = { ...cfg, updatedAt: Date.now() }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

export function persistConfigSync(cfg: BotAutomationConfig) {
  const next = { ...cfg, updatedAt: Date.now() }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

export function newRule(): AutoReplyRule {
  return {
    id: uid(),
    enabled: true,
    keyword: '',
    mode: 'contains',
    reply: '',
    ignoreCase: true,
  }
}

type TgResponse<T> = { ok: boolean; description?: string; result?: T }

export async function callTelegram<T = unknown>(
  token: string,
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch('/api/telegram', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: token.trim(), method, params }),
  })
  let data: TgResponse<T>
  try {
    data = (await res.json()) as TgResponse<T>
  } catch {
    throw new Error('API proxy failed. Use Vercel deploy or npm run dev (not opening dist as file).')
  }
  if (!res.ok && !data?.ok) {
    throw new Error(data?.description || `HTTP ${res.status}`)
  }
  if (!data.ok) {
    throw new Error(data.description || `${method} failed`)
  }
  return data.result as T
}

export async function testBotToken(token: string) {
  const me = await callTelegram<{ username?: string; id?: number }>(token, 'getMe')
  return {
    username: me.username || 'bot',
    id: me.id || 0,
  }
}

export function matchRule(text: string, rule: AutoReplyRule): boolean {
  if (!rule.enabled || !rule.reply.trim()) return false

  // Link detection mode — keyword optional (domain filter)
  if (rule.mode === 'link') {
    const links = extractLinks(text)
    if (!links.length) return false
    const filter = rule.keyword.trim()
    if (!filter) return true // any link
    const f = rule.ignoreCase ? filter.toLowerCase() : filter
    return links.some((link) => {
      const l = rule.ignoreCase ? link.toLowerCase() : link
      return l.includes(f)
    })
  }

  if (!rule.keyword.trim()) return false
  let msg = text
  let key = rule.keyword
  if (rule.ignoreCase) {
    msg = msg.toLowerCase()
    key = key.toLowerCase()
  }
  try {
    if (rule.mode === 'exact') return msg.trim() === key.trim()
    if (rule.mode === 'starts_with') return msg.startsWith(key)
    if (rule.mode === 'regex') {
      return new RegExp(rule.keyword, rule.ignoreCase ? 'i' : '').test(text)
    }
    return msg.includes(key)
  } catch {
    return false
  }
}

export function isGroupChat(type?: string) {
  return type === 'group' || type === 'supergroup'
}

export function mergeGroup(
  groups: DetectedGroup[],
  chat: { id: number | string; title?: string; type?: string; username?: string },
  autoEnable = true,
): DetectedGroup[] {
  const id = String(chat.id)
  const existing = groups.find((g) => g.id === id)
  if (existing) {
    return groups.map((g) =>
      g.id === id
        ? {
            ...g,
            title: chat.title || g.title,
            type: chat.type || g.type,
            username: chat.username || g.username,
            lastSeen: Date.now(),
            // once seen again, keep previous enabled flag
            enabled: g.enabled,
          }
        : g,
    )
  }
  return [
    {
      id,
      title: chat.title || `Group ${id}`,
      type: chat.type || 'group',
      username: chat.username,
      enabled: autoEnable,
      lastSeen: Date.now(),
    },
    ...groups,
  ]
}

export function shouldReplyInGroup(cfg: BotAutomationConfig, chatId: string): boolean {
  if (cfg.replyAllGroups) return true
  const g = cfg.groups.find((x) => x.id === chatId)
  // unknown group: allow if replyAllGroups already handled; else require enabled
  if (!g) return false
  return g.enabled
}
