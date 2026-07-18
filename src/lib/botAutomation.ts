/** Telegram group auto-reply — browser live runner (while site tab is open). */

const STORAGE_KEY = 'wp_tg_bot_auto_v2'

export type MatchMode = 'contains' | 'exact' | 'starts_with' | 'regex'

export type AutoReplyRule = {
  id: string
  enabled: boolean
  keyword: string
  mode: MatchMode
  reply: string
  ignoreCase: boolean
}

export type DetectedGroup = {
  id: string
  title: string
  type: string
  username?: string
  /** user enabled auto-reply for this group */
  enabled: boolean
  lastSeen: number
}

export type BotAutomationConfig = {
  botToken: string
  botUsername?: string
  botId?: number
  onlyGroups: boolean
  replyToMessage: boolean
  /** if true, reply in every detected group; if false, only groups with enabled=true */
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
    replyAllGroups: false,
    rules: [
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
        keyword: 'price',
        mode: 'contains',
        reply: 'Please check pinned message for prices.',
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
      // migrate v1 if present
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
          replyAllGroups: groups.length === 0,
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

/** Call Telegram via same-origin /api/telegram proxy (avoids browser CORS). */
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
    throw new Error('Invalid response from API proxy. Deploy on Vercel or run npm run dev.')
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
  if (!rule.enabled || !rule.keyword.trim() || !rule.reply.trim()) return false
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

export function mergeGroup(
  groups: DetectedGroup[],
  chat: { id: number | string; title?: string; type?: string; username?: string },
  autoEnable = false,
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
  return !!g?.enabled
}
