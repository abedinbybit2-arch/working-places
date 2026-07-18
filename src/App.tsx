import { lazy, Suspense, useMemo, useState } from 'react'
import { Loader2, Menu, Sparkles } from 'lucide-react'
import { workspaces, type Workspace } from './data/workspaces'
import { Sidebar } from './components/Sidebar'
import { ComingSoon } from './components/ComingSoon'
import { WorkspaceIcon } from './components/WorkspaceIcon'
import './App.css'

const TelegramWorkspace = lazy(() =>
  import('./components/telegram/TelegramWorkspace').then((m) => ({ default: m.TelegramWorkspace })),
)

const WorldCupSpot = lazy(() =>
  import('./components/spot/WorldCupSpot').then((m) => ({ default: m.WorldCupSpot })),
)

const TempMailWorkspace = lazy(() =>
  import('./components/mail/TempMailWorkspace').then((m) => ({ default: m.TempMailWorkspace })),
)

const FacebookRecovery = lazy(() =>
  import('./components/facebook/FacebookRecovery').then((m) => ({ default: m.FacebookRecovery })),
)

export default function App() {
  const [activeId, setActiveId] = useState(1)
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const active = useMemo(
    () => workspaces.find((w) => w.id === activeId) || workspaces[0],
    [activeId],
  )

  function selectWorkspace(ws: Workspace) {
    setActiveId(ws.id)
    setMobileOpen(false)
  }

  return (
    <div className={`app-shell ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="mobile-backdrop" onClick={() => setMobileOpen(false)} />

      <Sidebar
        activeId={activeId}
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        onSelect={selectWorkspace}
      />

      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-btn mobile-only" type="button" onClick={() => setMobileOpen(true)}>
              <Menu size={18} />
            </button>
            <div className="topbar-title">
              <div className="crumb">Working Places / WP {String(active.id).padStart(2, '0')}</div>
              <h1>
                <span className="title-icon" style={{ color: active.accent }}>
                  <WorkspaceIcon icon={active.icon} size={20} />
                </span>
                {active.name}
              </h1>
            </div>
          </div>
          <div className="topbar-right">
            <span className={`status-chip ${active.status === 'live' ? 'live' : ''}`}>
              {active.status === 'live' ? 'Live module' : 'Coming soon'}
            </span>
            <div className="user-chip">
              <Sparkles size={14} />
              Pro Hub
            </div>
          </div>
        </header>

        <main className="content">
          {active.id === 1 ? (
            <Suspense
              fallback={
                <div className="tg-center">
                  <Loader2 className="spin" size={28} />
                  <p>Loading Telegram workspace…</p>
                </div>
              }
            >
              <TelegramWorkspace />
            </Suspense>
          ) : active.id === 2 ? (
            <Suspense
              fallback={
                <div className="tg-center">
                  <Loader2 className="spin" size={28} />
                  <p>Loading World Cup Spot…</p>
                </div>
              }
            >
              <WorldCupSpot />
            </Suspense>
          ) : active.id === 3 ? (
            <Suspense
              fallback={
                <div className="tg-center">
                  <Loader2 className="spin" size={28} />
                  <p>Loading Temp Mail…</p>
                </div>
              }
            >
              <TempMailWorkspace />
            </Suspense>
          ) : active.id === 4 ? (
            <Suspense
              fallback={
                <div className="tg-center">
                  <Loader2 className="spin" size={28} />
                  <p>Loading Facebook Recovery…</p>
                </div>
              }
            >
              <FacebookRecovery />
            </Suspense>
          ) : (
            <ComingSoon workspace={active} />
          )}
        </main>
      </div>
    </div>
  )
}
