import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Loader2,
  Plus,
  Power,
  Radio,
  Save,
  Square,
  Trash2,
  Users,
} from 'lucide-react'
import {
  callTelegram,
  isGroupChat,
  loadBotConfig,
  matchRule,
  mergeGroup,
  newRule,
  persistConfigSync,
  saveBotConfig,
  shouldReplyInGroup,
  testBotToken,
  type AutoReplyRule,
  type BotAutomationConfig,
  type DetectedGroup,
  type MatchMode,
} from '../../lib/botAutomation'
import './TelegramBotAutomation.css'

type LogLine = { id: string; t: number; text: string; kind: 'info' | 'ok' | 'err' }

type TgChat = { id: number; title?: string; type?: string; username?: string }
type TgMessage = {
  message_id: number
  text?: string
  caption?: string
  from?: { is_bot?: boolean; username?: string; first_name?: string }
  chat?: TgChat
}
type TgUpdate = {
  update_id: number
  message?: TgMessage
  edited_message?: TgMessage
  channel_post?: TgMessage
  my_chat_member?: {
    chat?: TgChat
    new_chat_member?: { status?: string }
  }
}

export function TelegramBotAutomation() {
  const [cfg, setCfg] = useState<BotAutomationConfig>(() => loadBotConfig())
  const [running, setRunning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [status, setStatus] = useState('Idle — press Start auto-reply')
  const [logs, setLogs] = useState<LogLine[]>([])
  const [error, setError] = useState('')
  const [manualId, setManualId] = useState('')

  const cfgRef = useRef(cfg)
  const runningRef = useRef(false)
  const offsetRef = useRef(0)
  const loopGen = useRef(0)
  const statsRef = useRef({ updates: 0, messages: 0, replies: 0 })

  useEffect(() => {
    cfgRef.current = cfg
  }, [cfg])

  const log = useCallback((text: string, kind: LogLine['kind'] = 'info') => {
    setLogs((prev) =>
      [{ id: `${Date.now()}_${Math.random()}`, t: Date.now(), text, kind }, ...prev].slice(0, 50),
    )
  }, [])

  function commit(next: BotAutomationConfig) {
    const saved = persistConfigSync(next)
    cfgRef.current = saved
    setCfg(saved)
    return saved
  }

  function update(partial: Partial<BotAutomationConfig>) {
    const next = { ...cfgRef.current, ...partial }
    cfgRef.current = next
    setCfg(next)
  }

  function handleSave() {
    saveBotConfig(cfgRef.current)
    setCfg({ ...cfgRef.current })
    setSavedFlash(true)
    window.setTimeout(() => setSavedFlash(false), 1200)
  }

  function updateRule(id: string, partial: Partial<AutoReplyRule>) {
    const next = {
      ...cfgRef.current,
      rules: cfgRef.current.rules.map((r) => (r.id === id ? { ...r, ...partial } : r)),
    }
    commit(next)
  }

  function addRule() {
    commit({ ...cfgRef.current, rules: [...cfgRef.current.rules, newRule()] })
  }

  function removeRule(id: string) {
    commit({ ...cfgRef.current, rules: cfgRef.current.rules.filter((r) => r.id !== id) })
  }

  function toggleGroup(id: string, enabled: boolean) {
    commit({
      ...cfgRef.current,
      groups: cfgRef.current.groups.map((g) => (g.id === id ? { ...g, enabled } : g)),
    })
  }

  function enableAllGroups() {
    commit({
      ...cfgRef.current,
      replyAllGroups: true,
      groups: cfgRef.current.groups.map((g) => ({ ...g, enabled: true })),
    })
    log('All groups enabled', 'ok')
  }

  function addManualGroup() {
    const id = manualId.trim()
    if (!id) return
    const groups = mergeGroup(
      cfgRef.current.groups,
      { id, title: `Group ${id}`, type: 'supergroup' },
      true,
    )
    commit({ ...cfgRef.current, groups })
    setManualId('')
    log(`Manual group added: ${id}`, 'ok')
  }

  async function handleConnect() {
    setBusy(true)
    setError('')
    try {
      const me = await testBotToken(cfgRef.current.botToken)
      commit({ ...cfgRef.current, botUsername: me.username, botId: me.id })
      setStatus(`Connected @${me.username}`)
      log(`Connected as @${me.username}`, 'ok')
      try {
        await callTelegram(cfgRef.current.botToken, 'deleteWebhook', { drop_pending_updates: false })
        log('Webhook cleared (getUpdates ready)', 'info')
      } catch {
        /* ignore */
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      log(msg, 'err')
    } finally {
      setBusy(false)
    }
  }

  const processUpdate = useCallback(
    async (update: TgUpdate) => {
      statsRef.current.updates += 1
      let c = cfgRef.current

      // Bot added / status change in group
      const memberChat = update.my_chat_member?.chat
      if (memberChat && isGroupChat(memberChat.type)) {
        const groups = mergeGroup(c.groups, memberChat, true)
        c = commit({ ...c, groups })
        log(`Group detected: ${memberChat.title || memberChat.id}`, 'ok')
      }

      const msg = update.message || update.edited_message
      if (!msg?.chat) return

      const chat = msg.chat
      const isGroup = isGroupChat(chat.type)

      // Always track groups we see
      if (isGroup) {
        const groups = mergeGroup(c.groups, chat, true)
        c = commit({ ...c, groups })
      }

      if (c.onlyGroups && !isGroup) {
        log(`Private msg ignored (groups only): ${msg.text || ''}`, 'info')
        return
      }

      if (msg.from?.is_bot) return

      const text = (msg.text || msg.caption || '').trim()
      if (!text) return

      statsRef.current.messages += 1
      const chatId = String(chat.id)
      log(`Msg in ${chat.title || chatId}: ${text.slice(0, 60)}`, 'info')

      // Sync read of config after commit
      c = cfgRef.current
      if (!shouldReplyInGroup(c, chatId)) {
        log(`Skip — group ${chatId} not enabled (turn on “ALL groups” or enable checkbox)`, 'err')
        return
      }

      let matched = false
      for (const rule of c.rules) {
        if (!matchRule(text, rule)) continue
        matched = true
        const params: Record<string, unknown> = {
          chat_id: chat.id,
          text: rule.reply,
        }
        if (c.replyToMessage) params.reply_to_message_id = msg.message_id
        try {
          await callTelegram(c.botToken, 'sendMessage', params)
          statsRef.current.replies += 1
          log(`✅ Replied in "${chat.title || chatId}" (rule: ${rule.keyword})`, 'ok')
        } catch (e) {
          log(`Send failed: ${e instanceof Error ? e.message : String(e)}`, 'err')
        }
        break
      }
      if (!matched) {
        log(`No rule matched for: ${text.slice(0, 40)}`, 'info')
      }
    },
    [log],
  )

  const stopRunner = useCallback(() => {
    runningRef.current = false
    loopGen.current += 1
    setRunning(false)
    setStatus('Stopped')
    log('Auto-reply stopped', 'info')
  }, [log])

  const startRunner = useCallback(async () => {
    setError('')
    if (!cfgRef.current.botToken.trim()) {
      setError('Enter bot token first')
      return
    }
    // Ensure reply-all for reliability
    if (!cfgRef.current.replyAllGroups && cfgRef.current.groups.every((g) => !g.enabled)) {
      commit({ ...cfgRef.current, replyAllGroups: true })
      log('Enabled “ALL groups” so replies work immediately', 'info')
    }

    setBusy(true)
    try {
      const me = await testBotToken(cfgRef.current.botToken)
      commit({ ...cfgRef.current, botUsername: me.username, botId: me.id })
      await callTelegram(cfgRef.current.botToken, 'deleteWebhook', { drop_pending_updates: true })
      offsetRef.current = 0
      statsRef.current = { updates: 0, messages: 0, replies: 0 }
      log(`Bot @${me.username} ready. Privacy must be OFF in BotFather.`, 'ok')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setBusy(false)
      log(msg, 'err')
      return
    }
    setBusy(false)

    const gen = ++loopGen.current
    runningRef.current = true
    setRunning(true)
    setStatus(`Live @${cfgRef.current.botUsername || 'bot'} — keep tab open`)
    log('Listening for group messages…', 'ok')

    ;(async () => {
      while (runningRef.current && loopGen.current === gen) {
        if (typeof document !== 'undefined' && document.hidden) {
          await new Promise((r) => setTimeout(r, 1200))
          continue
        }
        try {
          const updates = await callTelegram<TgUpdate[]>(cfgRef.current.botToken, 'getUpdates', {
            offset: offsetRef.current,
            timeout: 0,
            limit: 50,
            allowed_updates: ['message', 'edited_message', 'my_chat_member'],
          })

          if (updates?.length) {
            for (const u of updates) {
              offsetRef.current = u.update_id + 1
              try {
                await processUpdate(u)
              } catch (e) {
                log(e instanceof Error ? e.message : String(e), 'err')
              }
            }
          }

          const s = statsRef.current
          setStatus(
            `Live @${cfgRef.current.botUsername || 'bot'} · groups ${cfgRef.current.groups.length} · msgs ${s.messages} · replies ${s.replies} · ${new Date().toLocaleTimeString()}`,
          )
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          log(msg, 'err')
          setStatus(`Error — retrying… ${msg}`)
          await new Promise((r) => setTimeout(r, 2000))
        }
        await new Promise((r) => setTimeout(r, 800))
      }
    })()
  }, [log, processUpdate])

  useEffect(() => {
    return () => {
      runningRef.current = false
      loopGen.current += 1
    }
  }, [])

  return (
    <div className="ba-wrap">
      <div className="ba-hero">
        <div>
          <div className="ba-kicker">
            <Bot size={14} /> WP 05 · Telegram Bot Automation
          </div>
          <h2>Group auto-reply (live in browser)</h2>
          <p>
            Token → Start → groups auto-detect → keyword reply. Works while this tab is open. No
            extra server process.
          </p>
        </div>
        <div className="ba-hero-actions">
          {!running ? (
            <button className="btn primary" type="button" onClick={() => void startRunner()} disabled={busy}>
              {busy ? <Loader2 className="spin" size={16} /> : <Radio size={16} />}
              Start auto-reply
            </button>
          ) : (
            <button className="btn danger" type="button" onClick={stopRunner}>
              <Square size={16} /> Stop
            </button>
          )}
          <button className="btn ghost" type="button" onClick={handleSave}>
            <Save size={16} /> {savedFlash ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>

      <div className={`ba-live ${running ? 'on' : ''}`}>
        <Power size={16} />
        <span>{status}</span>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="ba-warn">
        <AlertTriangle size={16} />
        <div>
          <strong>If group not working — check these:</strong>
          <br />
          1) BotFather → <code>/setprivacy</code> → <strong>Disable</strong> (required)
          <br />
          2) Bot must be <strong>member</strong> of the group
          <br />
          3) Press <strong>Start auto-reply</strong> and keep this page open
          <br />
          4) In group type a rule word e.g. <code>hello</code> or <code>hi</code>
          <br />
          5) Deploy on <strong>Vercel</strong> (needs <code>/api/telegram</code>) or local{' '}
          <code>npm run dev</code>
        </div>
      </div>

      <section className="ba-card">
        <div className="ba-card-head">
          <h3>Bot token</h3>
          {cfg.botUsername && (
            <span className="ba-user">
              <CheckCircle2 size={14} /> @{cfg.botUsername}
            </span>
          )}
        </div>
        <label className="ba-field">
          <span>Token from @BotFather</span>
          <input
            type="password"
            value={cfg.botToken}
            onChange={(e) => update({ botToken: e.target.value })}
            placeholder="123456:ABC-DEF..."
            autoComplete="off"
          />
        </label>
        <div className="ba-checks">
          <label>
            <input
              type="checkbox"
              checked={cfg.onlyGroups}
              onChange={(e) => update({ onlyGroups: e.target.checked })}
            />
            Only groups / supergroups
          </label>
          <label>
            <input
              type="checkbox"
              checked={cfg.replyToMessage}
              onChange={(e) => update({ replyToMessage: e.target.checked })}
            />
            Reply to original message
          </label>
          <label>
            <input
              type="checkbox"
              checked={cfg.replyAllGroups}
              onChange={(e) => update({ replyAllGroups: e.target.checked })}
            />
            Auto-reply in ALL groups (recommended)
          </label>
        </div>
        <button className="btn ghost" type="button" onClick={() => void handleConnect()} disabled={busy}>
          {busy ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />}
          Test / connect bot
        </button>
      </section>

      <section className="ba-card">
        <div className="ba-card-head">
          <h3>
            <Users size={16} /> Detected groups
          </h3>
          <div className="ba-actions">
            <button className="btn ghost" type="button" onClick={enableAllGroups}>
              Enable all
            </button>
            <span className="ba-hint">{cfg.groups.length} found</span>
          </div>
        </div>
        <p className="ba-sub">
          Start auto-reply, then send any message in the group (or add the bot). Groups show here
          automatically.
        </p>
        <div className="ba-row">
          <label className="ba-field grow">
            <span>Or paste group chat id manually</span>
            <input
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
              placeholder="-100xxxxxxxxxx"
            />
          </label>
          <button className="btn ghost" type="button" onClick={addManualGroup} style={{ alignSelf: 'end' }}>
            Add
          </button>
        </div>
        {cfg.groups.length === 0 ? (
          <div className="ba-empty">No groups yet — Start + message the group.</div>
        ) : (
          <div className="ba-groups">
            {cfg.groups.map((g: DetectedGroup) => (
              <label key={g.id} className={`ba-group ${g.enabled || cfg.replyAllGroups ? 'on' : ''}`}>
                <input
                  type="checkbox"
                  checked={cfg.replyAllGroups || g.enabled}
                  disabled={cfg.replyAllGroups}
                  onChange={(e) => toggleGroup(g.id, e.target.checked)}
                />
                <div>
                  <strong>{g.title}</strong>
                  <span>
                    {g.type} · {g.id}
                    {g.username ? ` · @${g.username}` : ''}
                    {g.enabled || cfg.replyAllGroups ? ' · ACTIVE' : ' · off'}
                  </span>
                </div>
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="ba-card">
        <div className="ba-card-head">
          <h3>Custom auto-reply rules</h3>
          <button className="btn ghost" type="button" onClick={addRule}>
            <Plus size={16} /> Add rule
          </button>
        </div>
        <div className="ba-rules">
          {cfg.rules.map((r, i) => (
            <div key={r.id} className={`ba-rule ${r.enabled ? '' : 'off'}`}>
              <div className="ba-rule-top">
                <span className="ba-rule-num">#{i + 1}</span>
                <label className="ba-mini">
                  <input
                    type="checkbox"
                    checked={r.enabled}
                    onChange={(e) => updateRule(r.id, { enabled: e.target.checked })}
                  />
                  On
                </label>
                <select
                  value={r.mode}
                  onChange={(e) => updateRule(r.id, { mode: e.target.value as MatchMode })}
                >
                  <option value="contains">Contains</option>
                  <option value="exact">Exact</option>
                  <option value="starts_with">Starts with</option>
                  <option value="regex">Regex</option>
                </select>
                <label className="ba-mini">
                  <input
                    type="checkbox"
                    checked={r.ignoreCase}
                    onChange={(e) => updateRule(r.id, { ignoreCase: e.target.checked })}
                  />
                  Ignore case
                </label>
                <button className="icon-btn" type="button" onClick={() => removeRule(r.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
              <label className="ba-field">
                <span>When message matches</span>
                <input
                  value={r.keyword}
                  onChange={(e) => updateRule(r.id, { keyword: e.target.value })}
                  placeholder="hello"
                />
              </label>
              <label className="ba-field">
                <span>Bot replies</span>
                <textarea
                  value={r.reply}
                  onChange={(e) => updateRule(r.id, { reply: e.target.value })}
                  rows={2}
                />
              </label>
            </div>
          ))}
        </div>
      </section>

      <section className="ba-card">
        <h3>Activity log</h3>
        <div className="ba-logs">
          {logs.length === 0 && <div className="ba-empty">No activity yet — press Start</div>}
          {logs.map((l) => (
            <div key={l.id} className={`ba-log ${l.kind}`}>
              <time>{new Date(l.t).toLocaleTimeString()}</time>
              <span>{l.text}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
