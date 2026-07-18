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
  loadBotConfig,
  matchRule,
  mergeGroup,
  newRule,
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

export function TelegramBotAutomation() {
  const [cfg, setCfg] = useState<BotAutomationConfig>(() => loadBotConfig())
  const [running, setRunning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [status, setStatus] = useState('Idle — start auto-reply while this page stays open')
  const [logs, setLogs] = useState<LogLine[]>([])
  const [error, setError] = useState('')

  const cfgRef = useRef(cfg)
  const runningRef = useRef(false)
  const offsetRef = useRef(0)
  const loopGen = useRef(0)

  useEffect(() => {
    cfgRef.current = cfg
  }, [cfg])

  const log = useCallback((text: string, kind: LogLine['kind'] = 'info') => {
    setLogs((prev) =>
      [{ id: `${Date.now()}_${Math.random()}`, t: Date.now(), text, kind }, ...prev].slice(0, 40),
    )
  }, [])

  function persist(next: BotAutomationConfig) {
    const saved = saveBotConfig(next)
    setCfg(saved)
    cfgRef.current = saved
    return saved
  }

  function update(partial: Partial<BotAutomationConfig>) {
    setCfg((c) => {
      const next = { ...c, ...partial }
      cfgRef.current = next
      return next
    })
  }

  function handleSave() {
    persist(cfg)
    setSavedFlash(true)
    window.setTimeout(() => setSavedFlash(false), 1200)
  }

  function updateRule(id: string, partial: Partial<AutoReplyRule>) {
    setCfg((c) => {
      const next = { ...c, rules: c.rules.map((r) => (r.id === id ? { ...r, ...partial } : r)) }
      cfgRef.current = next
      return next
    })
  }

  function addRule() {
    setCfg((c) => {
      const next = { ...c, rules: [...c.rules, newRule()] }
      cfgRef.current = next
      return next
    })
  }

  function removeRule(id: string) {
    setCfg((c) => {
      const next = { ...c, rules: c.rules.filter((r) => r.id !== id) }
      cfgRef.current = next
      return next
    })
  }

  function toggleGroup(id: string, enabled: boolean) {
    setCfg((c) => {
      const next = {
        ...c,
        groups: c.groups.map((g) => (g.id === id ? { ...g, enabled } : g)),
      }
      cfgRef.current = next
      localStorage.setItem('wp_tg_bot_auto_v2', JSON.stringify({ ...next, updatedAt: Date.now() }))
      return next
    })
  }

  async function handleConnect() {
    setBusy(true)
    setError('')
    try {
      const me = await testBotToken(cfg.botToken)
      const next = persist({ ...cfg, botUsername: me.username, botId: me.id })
      setStatus(`Connected @${me.username}`)
      log(`Connected as @${me.username}`, 'ok')
      // Drop old webhook so getUpdates works
      try {
        await callTelegram(next.botToken, 'deleteWebhook', { drop_pending_updates: false })
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
    async (update: {
      update_id: number
      message?: {
        message_id: number
        text?: string
        caption?: string
        from?: { is_bot?: boolean; username?: string }
        chat?: { id: number; title?: string; type?: string; username?: string }
      }
      my_chat_member?: {
        chat?: { id: number; title?: string; type?: string; username?: string }
      }
    }) => {
      const c = cfgRef.current
      const chatFromMember = update.my_chat_member?.chat
      if (chatFromMember && (chatFromMember.type === 'group' || chatFromMember.type === 'supergroup')) {
        setCfg((prev) => {
          const groups = mergeGroup(prev.groups, chatFromMember, true)
          const next = { ...prev, groups }
          cfgRef.current = next
          localStorage.setItem('wp_tg_bot_auto_v2', JSON.stringify({ ...next, updatedAt: Date.now() }))
          return next
        })
        log(`Group detected: ${chatFromMember.title || chatFromMember.id}`, 'ok')
      }

      const msg = update.message
      if (!msg?.chat) return
      const chat = msg.chat
      const isGroup = chat.type === 'group' || chat.type === 'supergroup'
      if (c.onlyGroups && !isGroup) return

      if (isGroup) {
        setCfg((prev) => {
          const groups = mergeGroup(prev.groups, chat, false)
          const next = { ...prev, groups }
          cfgRef.current = next
          localStorage.setItem('wp_tg_bot_auto_v2', JSON.stringify({ ...next, updatedAt: Date.now() }))
          return next
        })
      }

      if (msg.from?.is_bot) return
      const text = msg.text || msg.caption || ''
      if (!text.trim()) return

      const chatId = String(chat.id)
      // refresh shouldReply from latest
      const latest = cfgRef.current
      if (!shouldReplyInGroup(latest, chatId)) return

      for (const rule of latest.rules) {
        if (!matchRule(text, rule)) continue
        const params: Record<string, unknown> = {
          chat_id: chat.id,
          text: rule.reply,
        }
        if (latest.replyToMessage) params.reply_to_message_id = msg.message_id
        await callTelegram(latest.botToken, 'sendMessage', params)
        log(`Replied in "${chat.title || chatId}" → ${rule.keyword}`, 'ok')
        break
      }
    },
    [log],
  )

  const stopRunner = useCallback(() => {
    runningRef.current = false
    loopGen.current += 1
    setRunning(false)
    setStatus('Stopped — open this page again and press Start to resume')
    log('Auto-reply stopped', 'info')
  }, [log])

  const startRunner = useCallback(async () => {
    setError('')
    if (!cfgRef.current.botToken.trim()) {
      setError('Enter bot token first')
      return
    }

    setBusy(true)
    try {
      const me = await testBotToken(cfgRef.current.botToken)
      persist({ ...cfgRef.current, botUsername: me.username, botId: me.id })
      await callTelegram(cfgRef.current.botToken, 'deleteWebhook', { drop_pending_updates: false })
      // skip backlog once
      try {
        const skipped = await callTelegram<{ update_id: number }[]>(cfgRef.current.botToken, 'getUpdates', {
          offset: -1,
          timeout: 0,
          limit: 1,
        })
        if (skipped?.[0]?.update_id) offsetRef.current = skipped[0].update_id + 1
      } catch {
        offsetRef.current = 0
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setBusy(false)
      return
    }
    setBusy(false)

    const gen = ++loopGen.current
    runningRef.current = true
    setRunning(true)
    setStatus(`Live @${cfgRef.current.botUsername || 'bot'} — keep this tab open`)
    log('Auto-reply started (works while this website tab stays open)', 'ok')

    ;(async () => {
      while (runningRef.current && loopGen.current === gen) {
        if (typeof document !== 'undefined' && document.hidden) {
          await new Promise((r) => setTimeout(r, 1500))
          continue
        }
        try {
          // short poll — works with Vercel proxy timeouts
          const updates = await callTelegram<
            {
              update_id: number
              message?: {
                message_id: number
                text?: string
                caption?: string
                from?: { is_bot?: boolean }
                chat?: { id: number; title?: string; type?: string; username?: string }
              }
              my_chat_member?: {
                chat?: { id: number; title?: string; type?: string; username?: string }
              }
            }[]
          >(cfgRef.current.botToken, 'getUpdates', {
            offset: offsetRef.current,
            timeout: 0,
            limit: 50,
            allowed_updates: ['message', 'my_chat_member'],
          })

          for (const u of updates || []) {
            offsetRef.current = u.update_id + 1
            try {
              await processUpdate(u)
            } catch (e) {
              log(e instanceof Error ? e.message : String(e), 'err')
            }
          }
          setStatus(
            `Live @${cfgRef.current.botUsername || 'bot'} · groups: ${cfgRef.current.groups.length} · ${new Date().toLocaleTimeString()}`,
          )
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          log(msg, 'err')
          setStatus(`Retrying… ${msg}`)
          await new Promise((r) => setTimeout(r, 2500))
        }
        // small delay between short polls
        await new Promise((r) => setTimeout(r, 1200))
      }
    })()
  }, [log, processUpdate])

  // Stop when tab hidden for long? User wants while open — pause when hidden to save, resume when visible
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && runningRef.current) {
        setStatus('Tab hidden — polling paused (open tab again to continue)')
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      runningRef.current = false
      loopGen.current += 1
    }
  }, [])

  // Pause polling loop body when hidden by checking in loop - add check
  useEffect(() => {
    if (!running) return
    // re-bind: when visible and was running, status update only
  }, [running])

  return (
    <div className="ba-wrap">
      <div className="ba-hero">
        <div>
          <div className="ba-kicker">
            <Bot size={14} /> WP 05 · Telegram Bot Automation
          </div>
          <h2>Group auto-reply (no extra server)</h2>
          <p>
            Paste bot token → bot <strong>detects groups automatically</strong> → enable groups →
            custom auto-reply runs <strong>while this website tab is open</strong> on PC or mobile.
            Close the tab = stop. No separate Node process required.
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
          <strong>Setup:</strong> @BotFather → create bot → token. Add bot to group. Send{' '}
          <code>/setprivacy</code> → <strong>Disable</strong> so bot can read group messages. Send any
          message in the group (or add bot) so it appears in Detected groups. Keep this page open for
          auto-reply.
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
            Auto-reply in ALL detected groups (or pick below)
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
          <span className="ba-hint">{cfg.groups.length} found</span>
        </div>
        <p className="ba-sub">
          Groups appear automatically when the bot is added or someone messages while auto-reply is
          running. Enable the groups you want.
        </p>
        {cfg.groups.length === 0 ? (
          <div className="ba-empty">
            No groups yet. Start auto-reply, then write something in your Telegram group (or re-add
            the bot).
          </div>
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
                    {g.type} · id {g.id}
                    {g.username ? ` · @${g.username}` : ''}
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
                  placeholder="keyword"
                />
              </label>
              <label className="ba-field">
                <span>Bot replies</span>
                <textarea
                  value={r.reply}
                  onChange={(e) => updateRule(r.id, { reply: e.target.value })}
                  rows={2}
                  placeholder="Auto reply text"
                />
              </label>
            </div>
          ))}
        </div>
      </section>

      <section className="ba-card">
        <h3>Activity log</h3>
        <div className="ba-logs">
          {logs.length === 0 && <div className="ba-empty">No activity yet</div>}
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
