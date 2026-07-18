import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircle2,
  KeyRound,
  Loader2,
  LogOut,
  MessageSquare,
  Phone,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
} from 'lucide-react'
import type { Api } from 'telegram'
import {
  clearTelegramSession,
  getMe,
  getMessages,
  getSavedCreds,
  isAuthorized,
  listDialogs,
  logoutTelegram,
  saveCreds,
  sendMessage,
  sendPhoneCode,
  signInWithCode,
  signInWithPassword,
  type TgDialog,
  type TgMessage,
} from '../../lib/telegramClient'

type Step = 'loading' | 'credentials' | 'phone' | 'code' | 'password' | 'app'

function friendlyError(err: unknown) {
  const raw = err instanceof Error ? err.message : String(err)
  if (raw.includes('type is not a function') || raw.includes('os.default')) {
    return 'Browser Telegram client init failed. Hard-refresh (Ctrl+F5) and try again.'
  }
  if (raw.includes('API_ID_INVALID')) return 'Invalid API ID. Check my.telegram.org values.'
  if (raw.includes('PHONE_NUMBER_INVALID')) return 'Invalid phone number. Use international format e.g. +8801...'
  if (raw.includes('PHONE_CODE_INVALID')) return 'Invalid login code. Request a new code and try again.'
  if (raw.includes('PASSWORD_HASH_INVALID')) return 'Wrong two-step password.'
  if (raw.includes('FLOOD')) return 'Too many attempts. Wait a few minutes and try again.'
  return raw
}

export function TelegramWorkspace() {
  const saved = useMemo(() => getSavedCreds(), [])
  const [step, setStep] = useState<Step>('loading')
  const [apiId, setApiId] = useState(saved?.apiId?.toString() || '')
  const [apiHash, setApiHash] = useState(saved?.apiHash || '')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [meName, setMeName] = useState('')
  const [dialogs, setDialogs] = useState<TgDialog[]>([])
  const [active, setActive] = useState<TgDialog | null>(null)
  const [messages, setMessages] = useState<TgMessage[]>([])
  const [draft, setDraft] = useState('')
  const [msgLoading, setMsgLoading] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)

  const boot = useCallback(async () => {
    setError('')
    const creds = getSavedCreds()
    if (!creds) {
      setStep('credentials')
      return
    }
    try {
      setBusy(true)
      const ok = await isAuthorized()
      if (!ok) {
        setStep('phone')
        return
      }
      const me = await getMe()
      const name =
        me && 'firstName' in me
          ? [me.firstName, (me as Api.User).lastName].filter(Boolean).join(' ')
          : 'Telegram User'
      setMeName(name || 'Telegram User')
      const list = await listDialogs(50)
      setDialogs(list)
      setStep('app')
    } catch (e) {
      setError(friendlyError(e))
      setStep(creds ? 'phone' : 'credentials')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void boot()
  }, [boot])

  useEffect(() => {
    if (scroller.current) {
      scroller.current.scrollTop = scroller.current.scrollHeight
    }
  }, [messages, active])

  async function handleSaveCreds(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const id = Number(apiId.trim())
    if (!id || !apiHash.trim()) {
      setError('Enter a valid API ID and API Hash from my.telegram.org')
      return
    }
    saveCreds(id, apiHash.trim())
    setStep('phone')
  }

  async function handlePhone(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await sendPhoneCode(phone.trim())
      setStep('code')
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleCode(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const result = await signInWithCode(code.trim())
      if (result === '2fa') {
        setStep('password')
        return
      }
      await boot()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await signInWithPassword(password)
      await boot()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  async function openChat(dialog: TgDialog) {
    setActive(dialog)
    setMsgLoading(true)
    setError('')
    try {
      const msgs = await getMessages(dialog.entity, 50)
      setMessages(msgs)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setMsgLoading(false)
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!active || !draft.trim()) return
    setBusy(true)
    setError('')
    try {
      await sendMessage(active.entity, draft.trim())
      setDraft('')
      const msgs = await getMessages(active.entity, 50)
      setMessages(msgs)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleLogout() {
    setBusy(true)
    try {
      await logoutTelegram()
    } catch {
      clearTelegramSession()
    }
    setDialogs([])
    setActive(null)
    setMessages([])
    setMeName('')
    setStep('credentials')
    setBusy(false)
  }

  if (step === 'loading') {
    return (
      <div className="tg-center">
        <Loader2 className="spin" size={28} />
        <p>Connecting Telegram workspace…</p>
      </div>
    )
  }

  if (step !== 'app') {
    return (
      <div className="tg-auth">
        <div className="tg-auth-card">
          <div className="tg-auth-head">
            <div className="tg-logo">TG</div>
            <div>
              <h2>Telegram Login</h2>
              <p>Secure in-browser client · read & send messages</p>
            </div>
          </div>

          <ol className="tg-steps">
            <li className={step === 'credentials' ? 'is-on' : 'is-done'}>API keys</li>
            <li className={step === 'phone' ? 'is-on' : step === 'code' || step === 'password' ? 'is-done' : ''}>
              Phone
            </li>
            <li className={step === 'code' ? 'is-on' : step === 'password' ? 'is-done' : ''}>Code</li>
            <li className={step === 'password' ? 'is-on' : ''}>2FA</li>
          </ol>

          {error && <div className="alert error">{error}</div>}

          {step === 'credentials' && (
            <form onSubmit={handleSaveCreds} className="tg-form">
              <div className="hint-box">
                <ShieldCheck size={16} />
                <div>
                  Get free API ID & Hash from{' '}
                  <a href="https://my.telegram.org" target="_blank" rel="noreferrer">
                    my.telegram.org
                  </a>{' '}
                  → API development tools. Keys stay in your browser only.
                </div>
              </div>
              <label>
                <span>
                  <KeyRound size={14} /> API ID
                </span>
                <input
                  value={apiId}
                  onChange={(e) => setApiId(e.target.value)}
                  placeholder="12345678"
                  inputMode="numeric"
                  required
                />
              </label>
              <label>
                <span>
                  <KeyRound size={14} /> API Hash
                </span>
                <input
                  value={apiHash}
                  onChange={(e) => setApiHash(e.target.value)}
                  placeholder="your api hash"
                  required
                />
              </label>
              <button className="btn primary" type="submit" disabled={busy}>
                Continue
              </button>
            </form>
          )}

          {step === 'phone' && (
            <form onSubmit={handlePhone} className="tg-form">
              <label>
                <span>
                  <Phone size={14} /> Phone number
                </span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+8801XXXXXXXXX"
                  required
                />
              </label>
              <button className="btn primary" type="submit" disabled={busy}>
                {busy ? <Loader2 className="spin" size={16} /> : <Smartphone size={16} />}
                Send login code
              </button>
              <button className="btn ghost" type="button" onClick={() => setStep('credentials')}>
                Back to API keys
              </button>
            </form>
          )}

          {step === 'code' && (
            <form onSubmit={handleCode} className="tg-form">
              <label>
                <span>
                  <MessageSquare size={14} /> Code from Telegram
                </span>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="12345"
                  required
                />
              </label>
              <button className="btn primary" type="submit" disabled={busy}>
                {busy ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />}
                Verify & login
              </button>
            </form>
          )}

          {step === 'password' && (
            <form onSubmit={handlePassword} className="tg-form">
              <label>
                <span>
                  <ShieldCheck size={14} /> Two-step password
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Cloud password"
                  required
                />
              </label>
              <button className="btn primary" type="submit" disabled={busy}>
                {busy ? <Loader2 className="spin" size={16} /> : 'Unlock account'}
              </button>
            </form>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="tg-app">
      <div className="tg-app-bar">
        <div>
          <h2>Telegram Workspace</h2>
          <p>Signed in as <strong>{meName}</strong></p>
        </div>
        <div className="tg-app-actions">
          <button className="btn ghost" type="button" onClick={() => void boot()} disabled={busy}>
            <RefreshCw size={15} /> Refresh
          </button>
          <button className="btn danger" type="button" onClick={() => void handleLogout()} disabled={busy}>
            <LogOut size={15} /> Logout
          </button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="tg-shell">
        <div className="tg-dialogs">
          <div className="tg-pane-title">Chats</div>
          <div className="tg-dialog-list">
            {dialogs.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`tg-dialog ${active?.id === d.id ? 'is-active' : ''}`}
                onClick={() => void openChat(d)}
              >
                <div className="tg-avatar">{d.title.slice(0, 1).toUpperCase()}</div>
                <div className="tg-dialog-meta">
                  <strong>{d.title}</strong>
                  <span>
                    {d.isUser ? 'User' : d.isChannel ? 'Channel' : 'Group'}
                    {d.unread > 0 ? ` · ${d.unread} unread` : ''}
                  </span>
                </div>
              </button>
            ))}
            {dialogs.length === 0 && <p className="empty">No chats found.</p>}
          </div>
        </div>

        <div className="tg-chat">
          {!active ? (
            <div className="tg-center muted">
              <MessageSquare size={28} />
              <p>Select a chat to read and send messages</p>
            </div>
          ) : (
            <>
              <div className="tg-chat-head">
                <strong>{active.title}</strong>
                <span>{active.isUser ? 'Private chat' : active.isChannel ? 'Channel' : 'Group'}</span>
              </div>
              <div className="tg-messages" ref={scroller}>
                {msgLoading && (
                  <div className="tg-center muted">
                    <Loader2 className="spin" size={20} />
                  </div>
                )}
                {!msgLoading &&
                  messages.map((m) => (
                    <div key={m.id} className={`bubble ${m.out ? 'out' : 'in'}`}>
                      {!m.out && <small>{m.senderName}</small>}
                      <p>{m.text}</p>
                      <time>
                        {m.date
                          ? new Date(m.date * 1000).toLocaleString(undefined, {
                              hour: '2-digit',
                              minute: '2-digit',
                              month: 'short',
                              day: 'numeric',
                            })
                          : ''}
                      </time>
                    </div>
                  ))}
              </div>
              <form className="tg-composer" onSubmit={handleSend}>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Write a message…"
                />
                <button className="btn primary" type="submit" disabled={busy || !draft.trim()}>
                  <Send size={16} />
                  Send
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
