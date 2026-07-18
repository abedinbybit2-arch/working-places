import {
  BarChart3,
  Bot,
  Cloud,
  Code2,
  Globe2,
  Mail,
  MessageCircle,
  Shield,
  Sparkles,
  Wallet,
} from 'lucide-react'
import type { Workspace } from '../data/workspaces'

const map = {
  telegram: MessageCircle,
  spark: Sparkles,
  chart: BarChart3,
  mail: Mail,
  bot: Bot,
  cloud: Cloud,
  shield: Shield,
  code: Code2,
  wallet: Wallet,
  globe: Globe2,
} as const

export function WorkspaceIcon({
  icon,
  size = 18,
}: {
  icon: Workspace['icon']
  size?: number
}) {
  const Icon = map[icon]
  return <Icon size={size} strokeWidth={1.9} />
}
