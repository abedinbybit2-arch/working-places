import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Mail,
  Phone,
  ShieldCheck,
  Smartphone,
  Trash2,
} from 'lucide-react'
import './FacebookRecovery.css'

const STORAGE_KEY = 'wp_fb_recovery_notes_v1'

const OFFICIAL = {
  identify: 'https://www.facebook.com/login/identify/?ctx=recover&ars=facebook_login',
  recover: 'https://www.facebook.com/recover/initiate/?privacy_mutation_token',
  login: 'https://www.facebook.com/login/',
  help: 'https://www.facebook.com/help/123930245154294',
  hacked: 'https://www.facebook.com/hacked',
  accountsCenter: 'https://accountscenter.facebook.com/password_and_security',
} as const

type Note = {
  id: string
  contact: string
  kind: 'email' | 'phone' | 'unknown'
  at: number
}

function detectKind(value: string): Note['kind'] {
  const v = value.trim()
  if (v.includes('@')) return 'email'
  if (/^\+?[\d\s()-]{8,}$/.test(v)) return 'phone'
  return 'unknown'
}

function loadNotes(): Note[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as Note[]
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function saveNotes(notes: Note[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes.slice(0, 20)))
}

export function FacebookRecovery() {
  const [contact, setContact] = useState('')
  const [ownAccount, setOwnAccount] = useState(false)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [notes, setNotes] = useState<Note[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    setNotes(loadNotes())
  }, [])

  const kind = useMemo(() => detectKind(contact), [contact])

  function openOfficial(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  function handleContinue() {
    setError('')
    if (!ownAccount) {
      setError('Confirm this is your own Facebook account only.')
      return
    }
    const value = contact.trim()
    if (!value) {
      setError('Enter the email or mobile number on your Facebook account.')
      return
    }

    const note: Note = {
      id: `${Date.now()}`,
      contact: value,
      kind: detectKind(value),
      at: Date.now(),
    }
    const next = [note, ...notes].slice(0, 20)
    setNotes(next)
    saveNotes(next)
    setStep(2)

    // Official Facebook identify / recover only — no unofficial ID scrapers
    openOfficial(OFFICIAL.identify)
  }

  function goForgetOnFacebook() {
    setStep(3)
    openOfficial(OFFICIAL.identify)
  }

  function clearNotes() {
    localStorage.removeItem(STORAGE_KEY)
    setNotes([])
  }

  return (
    <div className="fb-wrap">
      <div className="fb-hero">
        <div>
          <div className="fb-kicker">
            <KeyRound size={14} /> WP 04 · Facebook Recovery
          </div>
          <h2>Official password recovery assistant</h2>
          <p>
            Only for <strong>your own</strong> Facebook account. This tool opens Facebook’s official
            “Forgot password / Find your account” pages. We do <strong>not</strong> scrape IDs,
            store your Facebook password, or use unofficial recovery APIs.
          </p>
        </div>
        <div className="fb-badge">
          <ShieldCheck size={18} />
          Official Meta flow
        </div>
      </div>

      <div className="fb-warn">
        <AlertTriangle size={16} />
        <div>
          <strong>Own account only.</strong> Using recovery against someone else’s account is abuse
          and may be illegal. Unofficial “show all IDs for a number” tools are blocked here because
          they violate Facebook terms and enable account theft.
        </div>
      </div>

      <ol className="fb-steps">
        <li className={step >= 1 ? 'is-on' : ''}>1. Email / phone</li>
        <li className={step >= 2 ? 'is-on' : ''}>2. Facebook account list</li>
        <li className={step >= 3 ? 'is-on' : ''}>3. Forgot password</li>
      </ol>

      {error && <div className="alert error">{error}</div>}

      <section className="fb-card">
        <h3>
          {kind === 'email' ? <Mail size={16} /> : <Phone size={16} />}
          Find your account (official)
        </h3>
        <p className="fb-card-sub">
          Facebook will show accounts linked to this email/phone (on their site). Then choose{' '}
          <strong>your</strong> profile → Continue → code via SMS/email → new password.
        </p>

        <label className="fb-field">
          <span>Email or mobile number on your account</span>
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="you@email.com  or  +8801XXXXXXXXX"
            autoComplete="username"
          />
        </label>

        <label className="fb-check">
          <input
            type="checkbox"
            checked={ownAccount}
            onChange={(e) => setOwnAccount(e.target.checked)}
          />
          I confirm this is my own Facebook account and I am authorized to reset it.
        </label>

        <div className="fb-actions">
          <button className="btn primary" type="button" onClick={handleContinue}>
            <ExternalLink size={16} />
            Continue → Facebook find account
          </button>
          <button className="btn ghost" type="button" onClick={goForgetOnFacebook}>
            <KeyRound size={16} />
            Open Forgot password
          </button>
        </div>
      </section>

      <div className="fb-grid">
        <section className="fb-card">
          <h3>
            <CheckCircle2 size={16} /> What happens on Facebook
          </h3>
          <ol className="fb-guide">
            <li>
              Facebook opens <strong>Identify / Find your account</strong>.
            </li>
            <li>
              Enter the same email or phone → Search. Facebook may show a{' '}
              <strong>list of profiles</strong> linked to it (on facebook.com only).
            </li>
            <li>
              Select <strong>your</strong> account (photo / name).
            </li>
            <li>
              Choose recovery: SMS code, email code, or other options Facebook offers.
            </li>
            <li>
              Enter code → set a <strong>new password</strong> → log in.
            </li>
          </ol>
        </section>

        <section className="fb-card">
          <h3>
            <Smartphone size={16} /> Official links
          </h3>
          <div className="fb-links">
            <a href={OFFICIAL.identify} target="_blank" rel="noreferrer">
              Find your account
            </a>
            <a href={OFFICIAL.login} target="_blank" rel="noreferrer">
              Facebook login
            </a>
            <a href={OFFICIAL.help} target="_blank" rel="noreferrer">
              Help: reset password
            </a>
            <a href={OFFICIAL.hacked} target="_blank" rel="noreferrer">
              Account hacked?
            </a>
            <a href={OFFICIAL.accountsCenter} target="_blank" rel="noreferrer">
              Accounts Center security
            </a>
          </div>
        </section>
      </div>

      {notes.length > 0 && (
        <section className="fb-card">
          <div className="fb-notes-head">
            <h3>Your recovery notes (this browser only)</h3>
            <button className="btn ghost" type="button" onClick={clearNotes}>
              <Trash2 size={14} /> Clear
            </button>
          </div>
          <p className="fb-card-sub">
            Saved locally so refresh keeps your last attempts — not sent to any server.
          </p>
          <ul className="fb-notes">
            {notes.map((n) => (
              <li key={n.id}>
                <strong>{n.contact}</strong>
                <span>
                  {n.kind} · {new Date(n.at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
