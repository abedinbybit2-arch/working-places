import { useCallback, useEffect, useState } from 'react'
import type { Api } from 'telegram'
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  KeyRound,
  Loader2,
  RefreshCw,
  Shield,
  Smartphone,
  User,
} from 'lucide-react'
import {
  getMe,
  getSavedCreds,
  getSessionString,
  hasStoredSession,
  isAuthorized,
  refreshAndExportSession,
} from '../../lib/telegramClient'
import {
  buildExports,
  copyToClipboard,
  downloadTextFile,
  type ExportedSessions,
} from '../../lib/sessionExport'
import './TelegramSessionExtract.css'

type AccountInfo = {
  name: string
  username: string
  phone: string
  userId: string
  isBot: boolean
}

type Status = 'loading' | 'need_login' | 'ready' | 'extracted' | 'error'

function friendlyError(err: unknown) {
  const raw = err instanceof Error ? err.message : String(err)
  if (raw.includes('type is not a function') || raw.includes('os.default')) {
    return 'Browser Telegram client failed. Hard-refresh (Ctrl+F5) and try again.'
  }
  if (raw.includes('Not logged in') || raw.includes('AUTH')) {
    return 'No active Telegram login. Open WP01 · Telegram Workspace and sign in first.'
  }
  if (raw.includes('API ID') || raw.includes('API_ID')) {
    return 'API credentials missing. Set them in WP01 from my.telegram.org.'
  }
  if (raw.includes('FLOOD')) return 'Too many attempts. Wait a few minutes and try again.'
  return raw
}

function maskSession(s: string, head = 18, tail = 12) {
  if (s.length <= head + tail + 3) return s
  return `${s.slice(0, head)}…${s.slice(-tail)}`
}

export function TelegramSessionExtract() {
  const [status, setStatus] = useState<Status>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [account, setAccount] = useState<AccountInfo | null>(null)
  const [exports, setExports] = useState<ExportedSessions | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const [ackRisk, setAckRisk] = useState(false)

  const boot = useCallback(async () => {
    setError('')
    setStatus('loading')
    try {
      const creds = getSavedCreds()
      if (!creds?.apiId || !hasStoredSession()) {
        setAccount(null)
        setExports(null)
        setStatus('need_login')
        return
      }

      const ok = await isAuthorized()
      if (!ok) {
        setAccount(null)
        setExports(null)
        setStatus('need_login')
        return
      }

      const me = await getMe()
      const user = me as Api.User
      const name =
        me && 'firstName' in me
          ? [user.firstName, user.lastName].filter(Boolean).join(' ')
          : 'Telegram User'
      setAccount({
        name: name || 'Telegram User',
        username: user.username ? `@${user.username}` : '—',
        phone: user.phone ? `+${user.phone}` : '—',
        userId: String(user.id),
        isBot: !!user.bot,
      })
      setStatus('ready')
    } catch (e) {
      setError(friendlyError(e))
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    void boot()
  }, [boot])

  async function handleExtract() {
    setError('')
    if (!ackRisk) {
      setError('Confirm the security warning before extracting your session.')
      return
    }
    setBusy(true)
    try {
      const creds = getSavedCreds()
      if (!creds?.apiId) throw new Error('API credentials missing. Sign in via WP01 first.')

      const sessionString = await refreshAndExportSession()
      const me = await getMe()
      const user = me as Api.User
      const userId = String(user.id)
      const isBot = !!user.bot

      const pack = buildExports({
        sessionString,
        apiId: creds.apiId,
        userId,
        isBot,
      })

      // Sanity: ensure we can re-parse GramJS body
      if (!pack.gramjs.startsWith('1') || pack.gramjs.length < 40) {
        throw new Error('Generated GramJS session looks invalid')
      }
      if (!pack.telethon.startsWith('1') || pack.telethon.length < 40) {
        throw new Error('Generated Telethon session looks invalid')
      }
      if (!pack.pyrogram || pack.pyrogram.length < 40) {
        throw new Error('Generated Pyrogram session looks invalid')
      }

      setExports(pack)
      setAccount({
        name:
          'firstName' in user
            ? [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Telegram User'
            : 'Telegram User',
        username: user.username ? `@${user.username}` : '—',
        phone: user.phone ? `+${user.phone}` : '—',
        userId,
        isBot,
      })
      setStatus('extracted')
      setRevealed({})
    } catch (e) {
      setError(friendlyError(e))
      // Keep previous exports if any
      if (!exports) setStatus(hasStoredSession() ? 'ready' : 'need_login')
    } finally {
      setBusy(false)
    }
  }

  async function handleCopy(key: string, value: string) {
    const ok = await copyToClipboard(value)
    if (ok) {
      setCopied(key)
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600)
    } else {
      setError('Copy failed — select the text and copy manually.')
    }
  }

  function handleDownloadAll() {
    if (!exports || !account) return
    const body = [
      '# Working Places — Telegram session export (YOUR account only)',
      `# Generated: ${new Date().toISOString()}`,
      `# User: ${account.name} ${account.username} id=${account.userId}`,
      `# Phone: ${account.phone}`,
      `# API ID: ${exports.apiId}`,
      `# DC: ${exports.dcId} (${exports.serverAddress}:${exports.port})`,
      '',
      '## WARNING',
      'Anyone with these strings can fully control this Telegram account.',
      'Never share them. Revoke other sessions from Telegram Settings if leaked.',
      '',
      '## API credentials (needed with session)',
      `API_ID=${exports.apiId}`,
      'API_HASH=<use the same hash from my.telegram.org / WP01>',
      '',
      '## GramJS StringSession',
      exports.gramjs,
      '',
      '## Telethon StringSession',
      exports.telethon,
      '',
      '## Pyrogram StringSession',
      exports.pyrogram,
      '',
    ].join('\n')
    downloadTextFile(`tg-session-${account.userId}.txt`, body)
  }

  function SessionBlock({
    id,
    title,
    subtitle,
    value,
  }: {
    id: string
    title: string
    subtitle: string
    value: string
  }) {
    const show = revealed[id]
    return (
      <div className="sx-block">
        <div className="sx-block-head">
          <div>
            <strong>{title}</strong>
            <p>{subtitle}</p>
          </div>
          <div className="sx-block-actions">
            <button type="button" className="sx-btn ghost" onClick={() => setRevealed((r) => ({ ...r, [id]: !r[id] }))}>
              {show ? 'Hide' : 'Reveal'}
            </button>
            <button type="button" className="sx-btn ghost" onClick={() => void handleCopy(id, value)}>
              <Copy size={14} />
              {copied === id ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              className="sx-btn ghost"
              onClick={() => downloadTextFile(`${id}-session.txt`, value)}
            >
              <Download size={14} />
              File
            </button>
          </div>
        </div>
        <pre className="sx-pre" spellCheck={false}>
          {show ? value : maskSession(value)}
        </pre>
      </div>
    )
  }

  if (status === 'loading') {
    return (
      <div className="sx-wrap">
        <div className="sx-center">
          <Loader2 className="spin" size={28} />
          <p>Checking your Telegram session…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="sx-wrap">
      <section className="sx-hero">
        <div>
          <div className="sx-kicker">
            <Shield size={14} /> WP06 · Session tools
          </div>
          <h2>Telegram Session Extractor</h2>
          <p>
            Export your <strong>own</strong> Telegram session (already signed in via WP01) as
            GramJS, Telethon, and Pyrogram string sessions — for your scripts and bots only.
          </p>
        </div>
        <div className="sx-badge">
          <KeyRound size={14} />
          Local only · never uploaded
        </div>
      </section>

      <div className="sx-warn">
        <AlertTriangle size={18} />
        <div>
          <strong>Security — read carefully</strong>
          <p>
            A session string is full account access (same as being logged in). Never paste it into
            unknown websites, groups, or “free tools”. If it leaks, open Telegram → Settings →
            Devices and terminate unknown sessions immediately.
          </p>
        </div>
      </div>

      {error ? (
        <div className="sx-error" role="alert">
          {error}
        </div>
      ) : null}

      {status === 'need_login' || status === 'error' ? (
        <section className="sx-card">
          <div className="sx-card-title">
            <Smartphone size={18} />
            <h3>Login required (WP01)</h3>
          </div>
          <p className="sx-sub">
            This module reads the session already saved in your browser by{' '}
            <strong>WP01 · Telegram Workspace</strong>. Nothing is sent to our servers.
          </p>
          <ol className="sx-steps">
            <li>Open sidebar → <strong>Telegram</strong> (WP01)</li>
            <li>Enter API ID / Hash from <a href="https://my.telegram.org" target="_blank" rel="noreferrer">my.telegram.org</a></li>
            <li>Sign in with phone + code (+ 2FA if enabled)</li>
            <li>Come back here and click <strong>Extract session</strong></li>
          </ol>
          <div className="sx-actions">
            <button type="button" className="sx-btn primary" onClick={() => void boot()} disabled={busy}>
              <RefreshCw size={16} />
              Recheck login
            </button>
          </div>
          {getSessionString() ? (
            <p className="sx-hint">A session string exists in storage but is not authorized — re-login on WP01.</p>
          ) : null}
        </section>
      ) : null}

      {(status === 'ready' || status === 'extracted') && account ? (
        <>
          <section className="sx-card">
            <div className="sx-card-title">
              <User size={18} />
              <h3>Signed-in account</h3>
              <span className="sx-live">
                <CheckCircle2 size={14} /> Active
              </span>
            </div>
            <div className="sx-meta">
              <div>
                <span>Name</span>
                <strong>{account.name}</strong>
              </div>
              <div>
                <span>Username</span>
                <strong>{account.username}</strong>
              </div>
              <div>
                <span>Phone</span>
                <strong>{account.phone}</strong>
              </div>
              <div>
                <span>User ID</span>
                <strong className="mono">{account.userId}</strong>
              </div>
              <div>
                <span>API ID</span>
                <strong className="mono">{getSavedCreds()?.apiId ?? '—'}</strong>
              </div>
              <div>
                <span>Type</span>
                <strong>{account.isBot ? 'Bot' : 'User account'}</strong>
              </div>
            </div>

            <label className="sx-ack">
              <input
                type="checkbox"
                checked={ackRisk}
                onChange={(e) => setAckRisk(e.target.checked)}
              />
              <span>
                I understand this exports full access to <strong>my own</strong> account and I will
                not share the strings.
              </span>
            </label>

            <div className="sx-actions">
              <button
                type="button"
                className="sx-btn primary"
                onClick={() => void handleExtract()}
                disabled={busy || !ackRisk}
              >
                {busy ? <Loader2 className="spin" size={16} /> : <KeyRound size={16} />}
                {busy ? 'Extracting…' : status === 'extracted' ? 'Re-extract session' : 'Extract session'}
              </button>
              <button type="button" className="sx-btn ghost" onClick={() => void boot()} disabled={busy}>
                <RefreshCw size={16} />
                Refresh account
              </button>
            </div>
          </section>

          {status === 'extracted' && exports ? (
            <section className="sx-card">
              <div className="sx-card-title">
                <KeyRound size={18} />
                <h3>Exported sessions</h3>
              </div>
              <p className="sx-sub">
                DC <strong>{exports.dcId}</strong> · {exports.serverAddress}:{exports.port} · use the{' '}
                <strong>same API ID / Hash</strong> from my.telegram.org with these strings.
              </p>

              <div className="sx-actions" style={{ marginBottom: '0.75rem' }}>
                <button type="button" className="sx-btn primary" onClick={handleDownloadAll}>
                  <Download size={16} />
                  Download all (.txt)
                </button>
              </div>

              <SessionBlock
                id="gramjs"
                title="GramJS StringSession"
                subtitle="Use with GramJS / this app (WP01 format)"
                value={exports.gramjs}
              />
              <SessionBlock
                id="telethon"
                title="Telethon StringSession"
                subtitle="Python: TelegramClient(StringSession(...), api_id, api_hash)"
                value={exports.telethon}
              />
              <SessionBlock
                id="pyrogram"
                title="Pyrogram StringSession"
                subtitle="Python: Client(..., session_string=..., in_memory=True) or Storage"
                value={exports.pyrogram}
              />

              <div className="sx-usage">
                <h4>Quick usage</h4>
                <pre className="sx-pre code">{`# Telethon
from telethon import TelegramClient
from telethon.sessions import StringSession
client = TelegramClient(StringSession("""${maskSession(exports.telethon, 12, 8)}"""), API_ID, API_HASH)

# Pyrogram
from pyrogram import Client
app = Client("me", api_id=API_ID, api_hash=API_HASH, session_string="""${maskSession(exports.pyrogram, 12, 8)}""")`}</pre>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
