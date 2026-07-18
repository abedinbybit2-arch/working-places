import { LayoutGrid, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { workspaces, type Workspace } from '../data/workspaces'
import { WorkspaceIcon } from './WorkspaceIcon'

type Props = {
  activeId: number
  collapsed: boolean
  onToggle: () => void
  onSelect: (ws: Workspace) => void
}

export function Sidebar({ activeId, collapsed, onToggle, onSelect }: Props) {
  return (
    <aside className={`sidebar ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="sidebar-top">
        <div className="brand">
          <div className="brand-mark" aria-hidden>
            <LayoutGrid size={18} />
          </div>
          {!collapsed && (
            <div className="brand-text">
              <strong>Working Places</strong>
              <span>Professional Hub</span>
            </div>
          )}
        </div>
        <button className="icon-btn" onClick={onToggle} title={collapsed ? 'Expand' : 'Collapse'} type="button">
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      {!collapsed && <p className="sidebar-label">Workspaces · 10</p>}

      <nav className="sidebar-nav" aria-label="Working places">
        {workspaces.map((ws) => {
          const active = ws.id === activeId
          return (
            <button
              key={ws.id}
              type="button"
              className={`nav-item ${active ? 'is-active' : ''} ${ws.status === 'coming_soon' ? 'is-soon' : ''}`}
              onClick={() => onSelect(ws)}
              title={ws.name}
              style={{ ['--accent' as string]: ws.accent }}
            >
              <span className="nav-icon">
                <WorkspaceIcon icon={ws.icon} />
              </span>
              {!collapsed && (
                <>
                  <span className="nav-copy">
                    <span className="nav-name">{ws.short}</span>
                    <span className="nav-meta">WP {String(ws.id).padStart(2, '0')}</span>
                  </span>
                  {ws.status === 'live' ? (
                    <span className="pill pill-live">Live</span>
                  ) : (
                    <span className="pill">Soon</span>
                  )}
                </>
              )}
            </button>
          )
        })}
      </nav>

      {!collapsed && (
        <div className="sidebar-foot">
          <div className="foot-card">
            <strong>Pro tip</strong>
            <p>Open Telegram Workspace to login, read chats, and send messages securely in-browser.</p>
          </div>
        </div>
      )}
    </aside>
  )
}
