import { useEffect, useState } from 'react'
import {
  Bot,
  Copy,
  Download,
  Loader2,
  Plus,
  Power,
  RefreshCw,
  Save,
  Trash2,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'
import {
  exportConfigJson,
  loadBotConfig,
  newRule,
  saveBotConfig,
  testBotToken,
  type AutoReplyRule,
  type BotAutomationConfig,
  type MatchMode,
} from '../../lib/botAutomation'
import './TelegramBotAutomation.css'

export function TelegramBotAutomation() {
  const [cfg, setCfg] = useState<BotAutomationConfig>(() => loadBotConfig())
  const [savedFlash, setSavedFlash] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState('')
  const [testOk, setTestOk] = useState<boolean | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setCfg(loadBotConfig())
  }, [])

  function update(partial: Partial<BotAutomationConfig>) {
    setCfg((c) => ({ ...c, ...partial }))
  }

  function updateRule(id: string, partial: Partial<AutoReplyRule>) {
    setCfg((c) => ({
      ...c,
      rules: c.rules.map((r) => (r.id === id ? { ...r, ...partial } : r)),
    }))
  }

  function addRule() {
    setCfg((c) => ({ ...c, rules: [...c.rules, newRule()] }))
  }

  function removeRule(id: string) {
    setCfg((c) => ({ ...c, rules: c.rules.filter((r) => r.id !== id) }))
  }

  function handleSave() {
    const next = saveBotConfig(cfg)
    setCfg(next)
    setSavedFlash(true)
    window.setTimeout(() => setSavedFlash(false), 1500)
  }

  async function handleTest() {
    setTesting(true)
    setTestMsg('')
    setTestOk(null)
    const res = await testBotToken(cfg.botToken)
    if (res.ok) {
      setTestOk(true)
      setTestMsg(`Connected: @${res.username} (id ${res.id})`)
      update({ botUsername: res.username })
    } else {
      setTestOk(false)
      setTestMsg(res.error)
    }
    setTesting(false)
  }

  function handleExport() {
    handleSave()
    const json = exportConfigJson(cfg)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'bot-config.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleCopyExport() {
    handleSave()
    try {
      await navigator.clipboard.writeText(exportConfigJson(cfg))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setTestOk(false)
      setTestMsg('Copy failed')
    }
  }

  return (
    <div className="ba-wrap">
      <div className="ba-hero">
        <div>
          <div className="ba-kicker">
            <Bot size={14} /> WP 05 · Telegram Bot Automation
          </div>
          <h2>Group custom auto-reply</h2>
          <p>
            Configure a Telegram bot that auto-replies in groups when messages match your keywords.
            Settings stay in this browser. Run the included <strong>Node worker</strong> to keep the
            bot online 24/7.
          </p>
        </div>
        <div className="ba-hero-actions">
          <button className="btn primary" type="button" onClick={handleSave}>
            <Save size={16} />
            {savedFlash ? 'Saved' : 'Save'}
          </button>
          <button className="btn ghost" type="button" onClick={handleExport}>
            <Download size={16} /> Export JSON
          </button>
        </div>
      </div>

      <div className="ba-warn">
        <AlertTriangle size={16} />
        <div>
          <strong>BotFather setup:</strong> create bot → copy token → add bot to your group → disable
          privacy: <code>/setprivacy</code> → <strong>Disable</strong> (so it can read group
          messages). Make bot admin if needed. Never share your token publicly.
        </div>
      </div>

      <section className="ba-card">
        <div className="ba-card-head">
          <h3>Bot connection</h3>
          <label className="ba-switch">
            <input
              type="checkbox"
              checked={cfg.enabled}
              onChange={(e) => update({ enabled: e.target.checked })}
            />
            <Power size={14} /> Automation {cfg.enabled ? 'ON' : 'OFF'}
          </label>
        </div>

        <label className="ba-field">
          <span>Bot token (from @BotFather)</span>
          <input
            type="password"
            value={cfg.botToken}
            onChange={(e) => update({ botToken: e.target.value })}
            placeholder="123456:ABC-DEF..."
            autoComplete="off"
          />
        </label>

        <div className="ba-row">
          <label className="ba-field grow">
            <span>Allowed group chat IDs (optional, comma-separated)</span>
            <input
              value={cfg.allowedChatIds}
              onChange={(e) => update({ allowedChatIds: e.target.value })}
              placeholder="Leave empty = all groups · e.g. -1001234567890"
            />
          </label>
        </div>

        <div className="ba-checks">
          <label>
            <input
              type="checkbox"
              checked={cfg.onlyGroups}
              onChange={(e) => update({ onlyGroups: e.target.checked })}
            />
            Only groups / supergroups (ignore private chats)
          </label>
          <label>
            <input
              type="checkbox"
              checked={cfg.replyToMessage}
              onChange={(e) => update({ replyToMessage: e.target.checked })}
            />
            Reply to the original message
          </label>
        </div>

        <div className="ba-actions">
          <button className="btn primary" type="button" onClick={() => void handleTest()} disabled={testing}>
            {testing ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
            Test token
          </button>
          {cfg.botUsername && (
            <span className="ba-user">
              <CheckCircle2 size={14} /> @{cfg.botUsername}
            </span>
          )}
        </div>
        {testMsg && (
          <div className={`ba-test ${testOk ? 'ok' : 'bad'}`}>{testMsg}</div>
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
                <button className="icon-btn" type="button" title="Delete" onClick={() => removeRule(r.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
              <label className="ba-field">
                <span>When message matches</span>
                <input
                  value={r.keyword}
                  onChange={(e) => updateRule(r.id, { keyword: e.target.value })}
                  placeholder="keyword / phrase / regex"
                />
              </label>
              <label className="ba-field">
                <span>Bot replies with</span>
                <textarea
                  value={r.reply}
                  onChange={(e) => updateRule(r.id, { reply: e.target.value })}
                  placeholder="Auto reply text"
                  rows={2}
                />
              </label>
            </div>
          ))}
          {cfg.rules.length === 0 && (
            <div className="ba-empty">No rules yet. Add a keyword → reply pair.</div>
          )}
        </div>
      </section>

      <section className="ba-card">
        <h3>Run automation (worker)</h3>
        <ol className="ba-guide">
          <li>Save rules + token here, then <strong>Export JSON</strong> as <code>bot-config.json</code></li>
          <li>
            Put file in project root (next to <code>package.json</code>)
          </li>
          <li>
            Run: <code>npm run bot</code>
          </li>
          <li>Keep the terminal open (or host on Railway/VPS). Bot will auto-reply in groups.</li>
        </ol>
        <div className="ba-actions">
          <button className="btn ghost" type="button" onClick={() => void handleCopyExport()}>
            <Copy size={16} /> {copied ? 'Copied config' : 'Copy config JSON'}
          </button>
        </div>
        <pre className="ba-code">{`npm run bot
# or:
# node telegram-bot-worker/index.mjs ./bot-config.json`}</pre>
      </section>
    </div>
  )
}
