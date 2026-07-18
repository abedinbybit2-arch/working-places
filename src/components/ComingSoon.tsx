import { Clock3, Rocket } from 'lucide-react'
import type { Workspace } from '../data/workspaces'
import { WorkspaceIcon } from './WorkspaceIcon'

export function ComingSoon({ workspace }: { workspace: Workspace }) {
  return (
    <div className="coming-wrap">
      <div className="coming-card" style={{ ['--accent' as string]: workspace.accent }}>
        <div className="coming-icon">
          <WorkspaceIcon icon={workspace.icon} size={28} />
        </div>
        <div className="coming-badge">
          <Clock3 size={14} /> Coming Soon
        </div>
        <h2>{workspace.name}</h2>
        <p>{workspace.description}</p>
        <ul className="coming-list">
          <li>Professional module UI reserved</li>
          <li>Same sidebar navigation & design system</li>
          <li>Will unlock without redesigning the hub</li>
        </ul>
        <div className="coming-cta">
          <Rocket size={16} />
          <span>Workspace {workspace.id} of 10 — shipping next</span>
        </div>
      </div>
    </div>
  )
}
