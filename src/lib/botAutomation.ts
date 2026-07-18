/** Telegram group auto-reply config (persisted in browser; worker uses exported JSON). */

const STORAGE_KEY = 'wp_tg_bot_auto_v1'

export type MatchMode = 'contains' | 'exact' | 'starts_with' | 'regex'

export type AutoReplyRule = {
  id: string
  enabled: boolean
  keyword: string
  mode: MatchMode
  reply: string
  /** case-insensitive match */
  ignoreCase: boolean
}

export type BotAutomationConfig = {
  botToken: string
  botUsername?: string
  /** Empty = all groups the bot is in */
  allowedChatIds: string
  onlyGroups: boolean
  replyToMessage: boolean
  enabled: boolean
  rules: AutoReplyRule[]
  updatedAt: number
}

export function defaultConfig(): BotAutomationConfig {
  return {
    botToken: '',
    botUsername: '',
    allowedChatIds: '',
    onlyGroups: true,
    replyToMessage: true,
    enabled: true,
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
    updatedAt: Date.now(),
  }
}

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function loadBotConfig(): BotAutomationConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultConfig()
    const parsed = JSON.parse(raw) as BotAutomationConfig
    return {
      ...defaultConfig(),
      ...parsed,
      rules: Array.isArray(parsed.rules) ? parsed.rules : defaultConfig().rules,
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

export function exportConfigJson(cfg: BotAutomationConfig) {
  return JSON.stringify(
    {
      botToken: cfg.botToken,
      allowedChatIds: cfg.allowedChatIds
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean),
      onlyGroups: cfg.onlyGroups,
      replyToMessage: cfg.replyToMessage,
      enabled: cfg.enabled,
      rules: cfg.rules
        .filter((r) => r.enabled && r.keyword.trim() && r.reply.trim())
        .map((r) => ({
          keyword: r.keyword,
          mode: r.mode,
          reply: r.reply,
          ignoreCase: r.ignoreCase,
        })),
    },
    null,
    2,
  )
}

const TG = 'https://api.telegram.org'

export async function testBotToken(token: string): Promise<{ ok: true; username: string; id: number } | { ok: false; error: string }> {
  const t = token.trim()
  if (!t) return { ok: false, error: 'Bot token is empty' }
  try {
    // May fail in browser due to CORS — UI will show clear message
    const res = await fetch(`${TG}/bot${t}/getMe`, { method: 'GET' })
    const data = (await res.json()) as {
      ok?: boolean
      description?: string
      result?: { username?: string; id?: number }
    }
    if (!data.ok || !data.result) {
      return { ok: false, error: data.description || 'Invalid token' }
    }
    return {
      ok: true,
      username: data.result.username || 'bot',
      id: data.result.id || 0,
    }
  } catch {
    return {
      ok: false,
      error:
        'Browser blocked Telegram API (CORS). Token can still work with the Node worker — export config and run npm run bot.',
    }
  }
}
