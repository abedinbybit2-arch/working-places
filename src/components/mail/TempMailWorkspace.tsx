import { useCallback, useEffect, useState } from 'react'
import {
  Check,
  Copy,
  Inbox,
  Loader2,
  Mail,
  RefreshCw,
  Trash2,
  Plus,
} from 'lucide-react'
import {
  createTempMailbox,
  deleteLocalMailbox,
  listTempMessages,
  loadSavedMailbox,
  readTempMessage,
  restoreTempMailbox,
  type TempMailbox,
  type TempMessage,
} from '../../lib/tempMailApi'
import './TempMailWorkspace.css'

export function TempMailWorkspace() {
  const [box, setBox] = useState<TempMailbox | null>(null)
  const [messages, setMessages] = useState<TempMessage[]>([])
  const [active, setActive] = useState<TempMessage | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [auto, setAuto] = useState(true)

  const refreshInbox = useCallback(async (mailbox: TempMailbox, silent = false) => {
    if (!silent) setBusy(true)
    setError('')
    try {
      const list = await listTempMessages(mailbox)
      setMessages(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load inbox')
    } finally {
      if (!silent) setBusy(false)
    }
  }, [])

  // Restore on mount — survives browser refresh
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const saved = loadSavedMailbox()
        if (saved) {
          const restored = (await restoreTempMailbox()) || saved
          if (cancelled) return
          setBox(restored)
          await refreshInbox(restored, true)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Restore failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshInbox])

  // Auto-refresh inbox every 8s
  useEffect(() => {
    if (!box || !auto) return
    const id = window.setInterval(() => {
      void refreshInbox(box, true)
    }, 8000)
    return () => window.clearInterval(id)
  }, [box, auto, refreshInbox])

  async function handleCreate() {
    setBusy(true)
    setError('')
    setActive(null)
    setMessages([])
    try {
      const created = await createTempMailbox()
      setBox(created)
      await refreshInbox(created, true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleOpen(msg: TempMessage) {
    if (!box) return
    setBusy(true)
    setError('')
    try {
      const full = await readTempMessage(box, msg.id)
      setActive(full)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open message')
    } finally {
      setBusy(false)
    }
  }

  async function handleCopy() {
    if (!box?.address) return
    try {
      await navigator.clipboard.writeText(box.address)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('Copy failed — select the address manually')
    }
  }

  function handleDeleteLocal() {
    deleteLocalMailbox()
    setBox(null)
    setMessages([])
    setActive(null)
    setError('')
  }

  if (loading) {
    return (
      <div className="tm-center">
        <Loader2 className="spin" size={28} />
        <p>Restoring temp mail session…</p>
      </div>
    )
  }

  return (
    <div className="tm-wrap">
      <div className="tm-hero">
        <div>
          <div className="tm-kicker">
            <Mail size={14} /> WP 03 · Temp Mail
          </div>
          <h2>Temporary Email</h2>
          <p>
            Create a disposable inbox. Address is saved in this browser — refresh will{' '}
            <strong>not</strong> remove it. Uses mail.tm with 1secmail fallback.
          </p>
        </div>
        <div className="tm-hero-actions">
          <button className="btn primary" type="button" onClick={() => void handleCreate()} disabled={busy}>
            {busy ? <Loader2 className="spin" size={16} /> : <Plus size={16} />}
            {box ? 'New address' : 'Create email'}
          </button>
          {box && (
            <button className="btn ghost" type="button" onClick={handleDeleteLocal}>
              <Trash2 size={16} /> Remove from browser
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      {!box ? (
        <div className="tm-empty-card">
          <Inbox size={32} />
          <h3>No mailbox yet</h3>
          <p>Click Create email. After create, the address stays even if you refresh the page.</p>
          <button className="btn primary" type="button" onClick={() => void handleCreate()} disabled={busy}>
            Create temp email
          </button>
        </div>
      ) : (
        <>
          <section className="tm-address-bar">
            <div>
              <span className="tm-label">Your temp address</span>
              <div className="tm-address">{box.address}</div>
              <div className="tm-meta">
                Provider: <strong>{box.provider}</strong>
                {' · '}
                Saved: {new Date(box.createdAt).toLocaleString()}
                {' · '}
                <label className="tm-auto">
                  <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
                  Auto refresh
                </label>
              </div>
            </div>
            <div className="tm-address-actions">
              <button className="btn primary" type="button" onClick={() => void handleCopy()}>
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                className="btn ghost"
                type="button"
                onClick={() => void refreshInbox(box)}
                disabled={busy}
              >
                {busy ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
                Refresh inbox
              </button>
            </div>
          </section>

          <div className="tm-shell">
            <div className="tm-list">
              <div className="tm-pane-title">
                Inbox {messages.length > 0 ? `(${messages.length})` : ''}
              </div>
              {messages.length === 0 ? (
                <div className="tm-empty">No messages yet. Send a test mail to this address.</div>
              ) : (
                messages.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`tm-msg ${active?.id === m.id ? 'is-active' : ''}`}
                    onClick={() => void handleOpen(m)}
                  >
                    <strong>{m.subject}</strong>
                    <span>{m.from}</span>
                    {m.intro && <em>{m.intro}</em>}
                    {m.date && <time>{new Date(m.date).toLocaleString()}</time>}
                  </button>
                ))
              )}
            </div>

            <div className="tm-reader">
              {!active ? (
                <div className="tm-empty reader">
                  <Mail size={28} />
                  <p>Select a message to read</p>
                </div>
              ) : (
                <>
                  <div className="tm-reader-head">
                    <h3>{active.subject}</h3>
                    <p>
                      From: <strong>{active.from}</strong>
                      {active.date && <> · {new Date(active.date).toLocaleString()}</>}
                    </p>
                  </div>
                  <div className="tm-reader-body">
                    {active.bodyHtml ? (
                      <iframe
                        title="email body"
                        sandbox=""
                        srcDoc={active.bodyHtml}
                        className="tm-html-frame"
                      />
                    ) : (
                      <pre>{active.bodyText || active.intro || '(empty body)'}</pre>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
