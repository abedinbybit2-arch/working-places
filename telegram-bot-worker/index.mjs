/**
 * Telegram group auto-reply worker (long polling).
 * Usage:
 *   node telegram-bot-worker/index.mjs
 *   node telegram-bot-worker/index.mjs ./bot-config.json
 *   BOT_TOKEN=... node telegram-bot-worker/index.mjs
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const configPath = resolve(process.argv[2] || './bot-config.json')

function loadConfig() {
  let file = {}
  if (existsSync(configPath)) {
    file = JSON.parse(readFileSync(configPath, 'utf8'))
    console.log(`[bot] loaded config: ${configPath}`)
  } else {
    console.log(`[bot] no file at ${configPath} — using env BOT_TOKEN only`)
  }

  const botToken = (process.env.BOT_TOKEN || file.botToken || '').trim()
  if (!botToken) {
    console.error('[bot] Missing botToken. Export bot-config.json from WP05 or set BOT_TOKEN.')
    process.exit(1)
  }

  return {
    botToken,
    allowedChatIds: Array.isArray(file.allowedChatIds)
      ? file.allowedChatIds.map(String)
      : String(file.allowedChatIds || '')
          .split(/[\s,]+/)
          .map((s) => s.trim())
          .filter(Boolean),
    onlyGroups: file.onlyGroups !== false,
    replyToMessage: file.replyToMessage !== false,
    enabled: file.enabled !== false,
    rules: Array.isArray(file.rules) ? file.rules : [],
  }
}

const cfg = loadConfig()
const API = `https://api.telegram.org/bot${cfg.botToken}`

async function tg(method, body) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  if (!data.ok) {
    throw new Error(data.description || `${method} failed`)
  }
  return data.result
}

function matchRule(text, rule) {
  if (!rule || !rule.keyword || !rule.reply) return false
  let msg = String(text || '')
  let key = String(rule.keyword)
  if (rule.ignoreCase !== false) {
    msg = msg.toLowerCase()
    key = key.toLowerCase()
  }
  const mode = rule.mode || 'contains'
  try {
    if (mode === 'exact') return msg.trim() === key.trim()
    if (mode === 'starts_with') return msg.startsWith(key)
    if (mode === 'regex') {
      const flags = rule.ignoreCase !== false ? 'i' : ''
      return new RegExp(rule.keyword, flags).test(String(text || ''))
    }
    return msg.includes(key)
  } catch {
    return false
  }
}

function allowedChat(chat) {
  if (!chat) return false
  if (cfg.onlyGroups && chat.type !== 'group' && chat.type !== 'supergroup') return false
  if (cfg.allowedChatIds.length === 0) return true
  return cfg.allowedChatIds.includes(String(chat.id))
}

let offset = 0

async function handleUpdate(update) {
  const msg = update.message || update.edited_message
  if (!msg || !msg.chat) return
  if (!cfg.enabled) return
  if (msg.from?.is_bot) return
  if (!allowedChat(msg.chat)) return

  const text = msg.text || msg.caption || ''
  if (!text.trim()) return

  for (const rule of cfg.rules) {
    if (!matchRule(text, rule)) continue
    const payload = {
      chat_id: msg.chat.id,
      text: rule.reply,
    }
    if (cfg.replyToMessage) payload.reply_to_message_id = msg.message_id
    await tg('sendMessage', payload)
    console.log(
      `[bot] replied in ${msg.chat.id} (${msg.chat.title || msg.chat.type}) rule="${rule.keyword}"`,
    )
    break // first match only
  }
}

async function loop() {
  const me = await tg('getMe')
  console.log(`[bot] online as @${me.username} (id ${me.id})`)
  console.log(`[bot] rules: ${cfg.rules.length} | groups only: ${cfg.onlyGroups} | enabled: ${cfg.enabled}`)
  if (cfg.allowedChatIds.length) console.log(`[bot] chat filter: ${cfg.allowedChatIds.join(', ')}`)
  else console.log('[bot] chat filter: ALL groups')

  // Drop pending updates on start
  await tg('getUpdates', { offset: -1, timeout: 0 }).catch(() => {})

  for (;;) {
    try {
      const updates = await tg('getUpdates', {
        offset,
        timeout: 30,
        allowed_updates: ['message', 'edited_message'],
      })
      for (const u of updates) {
        offset = u.update_id + 1
        try {
          await handleUpdate(u)
        } catch (e) {
          console.error('[bot] handle error:', e.message || e)
        }
      }
    } catch (e) {
      console.error('[bot] poll error:', e.message || e)
      await new Promise((r) => setTimeout(r, 3000))
    }
  }
}

loop().catch((e) => {
  console.error('[bot] fatal:', e.message || e)
  process.exit(1)
})
