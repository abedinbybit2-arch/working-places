import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Mail,
  Phone,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import './FacebookRecovery.css'

const STORAGE_KEY = 'wp_fb_recovery_flow_v2'

const FB = {
  identify: 'https://www.facebook.com/login/identify/?ctx=recover&ars=facebook_login',
  recover: 'https://www.facebook.com/recover/initiate/',
  login: 'https://www.facebook.com/login/',
  help: 'https://www.facebook.com/help/123930245154294',
  hacked: 'https://www.facebook.com/hacked',
} as const

type Kind = 'email' | 'phone' | 'unknown'
type Phase = 'start' | 'contact' | 'list' | 'ready'

type SavedFlow = {
  contact: string
  kind: Kind
  phase: Phase
  updatedAt: number
}

function detectKind(value: string): Kind {
  const v = value.trim()
  if (v.includes('@')) return 'email'
  if (/^\+?[\d\s()-]{8,}$/.test(v)) return 'phone'
  return 'unknown'
}

function loadFlow(): SavedFlow | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as SavedFlow
  } catch {
    return null
  }
}

function saveFlow(flow: SavedFlow) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(flow))
}

function openFb(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

/**
 * Meta does not allow third-party sites to pull real account IDs for an email/phone.
 * We show a clear on-web “list step” that mirrors Facebook’s flow and only redirects
 * to official Facebook when the user chooses Forgot password.
 */
export function FacebookRecovery() {
  const [phase, setPhase] = useState<Phase>('start')
  const [contact, setContact] = useState('')
  const [ownOk, setOwnOk] = useState(false)
  const [error, setError] = useState('')
  const [fbListOpened, setFbListOpened] = useState(false)
  const [pickedLabel, setPickedLabel] = useState('')

  useEffect(() => {
    const saved = loadFlow()
    if (!saved?.contact) return
    setContact(saved.contact)
    setPhase(saved.phase === 'start' ? 'contact' : saved.phase)
  }, [])

  const kind = useMemo(() => detectKind(contact), [contact])

  function persist(next: Phase, value = contact) {
    saveFlow({
      contact: value.trim(),
      kind: detectKind(value),
      phase: next,
      updatedAt: Date.now(),
    })
  }

  function goStart() {
    setPhase('start')
    setError('')
  }

  function goContact() {
    setError('')
    setPhase('contact')
  }

  function submitContact() {
    setError('')
    if (!ownOk) {
      setError('Confirm this is your own Facebook account only.')
      return
    }
    const value = contact.trim()
    if (!value) {
      setError('Email or phone number required.')
      return
    }
    if (detectKind(value) === 'unknown') {
      setError('Enter a valid email (with @) or mobile number.')
      return
    }
    setFbListOpened(false)
    setPickedLabel('')
    setPhase('list')
    persist('list', value)
  }

  function openAccountListOnFacebook() {
    setFbListOpened(true)
    // Official page that shows linked profiles for the email/phone
    openFb(FB.identify)
  }

  function confirmSelectedAccount() {
    setError('')
    if (!fbListOpened) {
      setError('First open Facebook account list, then select your profile there.')
      return
    }
    setPhase('ready')
    persist('ready')
  }

  function forgetPasswordRedirect() {
    setError('')
    if (!ownOk) {
      setError('Own-account confirmation required.')
      return
    }
    // Final step only: official Facebook recovery / identify
    openFb(FB.identify)
    // Also surface recover initiate for password reset path
    window.setTimeout(() => openFb(FB.recover), 400)
  }

  function resetAll() {
    localStorage.removeItem(STORAGE_KEY)
    setPhase('start')
    setContact('')
    setOwnOk(false)
    setFbListOpened(false)
    setPickedLabel('')
    setError('')
  }

  return (
    <div className="fb-wrap">
      <div className="fb-hero">
        <div>
          <div className="fb-kicker">
            <KeyRound size={14} /> WP 04 · Facebook Recovery
          </div>
          <h2>Forgot password — step by step on this site</h2>
          <p>
            Everything before the final redirect stays on this web app. The account list is shown by{' '}
            <strong>Facebook official page</strong> (Meta does not allow third-party sites to pull ID
            lists). Final <strong>Forgot password</strong> opens official Facebook only.
          </p>
        </div>
        <div className="fb-badge">
          <ShieldCheck size={18} />
          Own account only
        </div>
      </div>

      <div className="fb-warn">
        <AlertTriangle size={16} />
        <div>
          <strong>Why list opens on Facebook:</strong> Meta blocks external apps from fetching “IDs
          for this phone/email”. Unofficial scrapers are banned here. You enter contact here → we
          guide you → list on facebook.com → Forgot password redirects to official Facebook.
        </div>
      </div>

      <ol className="fb-steps">
        <li className={phase !== 'start' || phase === 'start' ? 'is-on' : ''}>1. Forgot</li>
        <li className={phase === 'contact' || phase === 'list' || phase === 'ready' ? 'is-on' : ''}>
          2. Email / phone
        </li>
        <li className={phase === 'list' || phase === 'ready' ? 'is-on' : ''}>3. Account list</li>
        <li className={phase === 'ready' ? 'is-on' : ''}>4. Forgot → Facebook</li>
      </ol>

      {error && <div className="alert error">{error}</div>}

      {/* STEP: START */}
      {phase === 'start' && (
        <section className="fb-card fb-center-card">
          <KeyRound size={36} className="fb-big-icon" />
          <h3>Forgot password</h3>
          <p className="fb-card-sub">
            Click below. We will ask for your email or phone on this website first — not on a random
            third-party recovery site.
          </p>
          <button className="btn primary" type="button" onClick={goContact}>
            Forgot password
            <ArrowRight size={16} />
          </button>
        </section>
      )}

      {/* STEP: CONTACT — fully on web */}
      {phase === 'contact' && (
        <section className="fb-card">
          <h3>
            {kind === 'phone' ? <Phone size={16} /> : <Mail size={16} />}
            Enter email or phone
          </h3>
          <p className="fb-card-sub">
            Use the email or mobile number linked to <strong>your</strong> Facebook account. This
            stays on this page until you continue.
          </p>

          <label className="fb-field">
            <span>Email or mobile number</span>
            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="you@email.com  or  +8801XXXXXXXXX"
              autoComplete="username"
            />
          </label>

          <label className="fb-check">
            <input type="checkbox" checked={ownOk} onChange={(e) => setOwnOk(e.target.checked)} />
            I confirm this is my own account only (not someone else’s).
          </label>

          <div className="fb-actions">
            <button className="btn ghost" type="button" onClick={goStart}>
              <ArrowLeft size={16} /> Back
            </button>
            <button className="btn primary" type="button" onClick={submitContact}>
              Continue — show account list step
              <ArrowRight size={16} />
            </button>
          </div>
        </section>
      )}

      {/* STEP: ACCOUNT LIST — on web UI + official list on Facebook */}
      {phase === 'list' && (
        <section className="fb-card">
          <h3>
            <UserRound size={16} /> Account list
          </h3>
          <p className="fb-card-sub">
            Searching for accounts linked to:{' '}
            <strong className="fb-contact-hl">{contact.trim()}</strong>
          </p>

          <div className="fb-list-panel">
            <div className="fb-list-row head">
              <span>What you’ll see</span>
              <span>Status</span>
            </div>
            <div className="fb-list-row">
              <div>
                <strong>Profiles linked to this email/phone</strong>
                <p>
                  Facebook shows name, photo, and partial info on their official page (not
                  exportable to other websites).
                </p>
              </div>
              <span className={`fb-pill ${fbListOpened ? 'ok' : 'wait'}`}>
                {fbListOpened ? 'Opened' : 'Pending'}
              </span>
            </div>
            <div className="fb-list-row">
              <div>
                <strong>Your selection</strong>
                <p>Pick only your profile on Facebook, then return here.</p>
              </div>
              <span className="fb-pill wait">On Facebook</span>
            </div>
          </div>

          <div className="fb-mock-accounts" aria-hidden>
            <div className="fb-mock-item">
              <div className="fb-avatar">1</div>
              <div>
                <strong>Account option A</strong>
                <span>Shown on facebook.com after search</span>
              </div>
            </div>
            <div className="fb-mock-item">
              <div className="fb-avatar">2</div>
              <div>
                <strong>Account option B</strong>
                <span>If multiple profiles share the same contact</span>
              </div>
            </div>
            <p className="fb-mock-note">
              Preview only — real names/photos appear on Facebook’s page (security restriction).
            </p>
          </div>

          <label className="fb-field">
            <span>Optional note — which profile is yours? (saved in this browser)</span>
            <input
              value={pickedLabel}
              onChange={(e) => setPickedLabel(e.target.value)}
              placeholder="e.g. My main profile / name you saw"
            />
          </label>

          <div className="fb-actions">
            <button className="btn ghost" type="button" onClick={() => setPhase('contact')}>
              <ArrowLeft size={16} /> Back
            </button>
            <button className="btn primary" type="button" onClick={openAccountListOnFacebook}>
              <ExternalLink size={16} />
              Open account list on Facebook
            </button>
            <button className="btn primary" type="button" onClick={confirmSelectedAccount}>
              I selected my account
              <ArrowRight size={16} />
            </button>
          </div>
        </section>
      )}

      {/* STEP: FORGOT → official redirect only */}
      {phase === 'ready' && (
        <section className="fb-card">
          <h3>
            <CheckCircle2 size={16} /> Ready — Forgot password
          </h3>
          <p className="fb-card-sub">
            Contact: <strong className="fb-contact-hl">{contact.trim()}</strong>
            {pickedLabel ? (
              <>
                <br />
                Your note: <strong>{pickedLabel}</strong>
              </>
            ) : null}
          </p>

          <div className="fb-ready-box">
            <p>
              Next click opens <strong>official Facebook</strong> only (identify + recover). Enter
              the same email/phone again if Facebook asks, choose your account, get code, set new
              password.
            </p>
          </div>

          <div className="fb-actions">
            <button className="btn ghost" type="button" onClick={() => setPhase('list')}>
              <ArrowLeft size={16} /> Back to list step
            </button>
            <button className="btn primary" type="button" onClick={forgetPasswordRedirect}>
              <KeyRound size={16} />
              Forgot password — go to official Facebook
            </button>
          </div>
        </section>
      )}

      <div className="fb-grid">
        <section className="fb-card">
          <h3>Flow on this website</h3>
          <ol className="fb-guide">
            <li>
              <strong>Forgot</strong> button (this site)
            </li>
            <li>
              Enter <strong>email / phone</strong> (this site)
            </li>
            <li>
              <strong>Account list</strong> step + open list on Facebook official page
            </li>
            <li>
              <strong>Forgot password</strong> → redirect official Facebook only
            </li>
          </ol>
        </section>
        <section className="fb-card">
          <h3>Official links</h3>
          <div className="fb-links">
            <a href={FB.identify} target="_blank" rel="noreferrer">
              Find your account
            </a>
            <a href={FB.login} target="_blank" rel="noreferrer">
              Facebook login
            </a>
            <a href={FB.help} target="_blank" rel="noreferrer">
              Help: reset password
            </a>
            <a href={FB.hacked} target="_blank" rel="noreferrer">
              Account hacked?
            </a>
          </div>
          <button className="btn ghost fb-reset" type="button" onClick={resetAll}>
            Reset wizard
          </button>
        </section>
      </div>
    </div>
  )
}
