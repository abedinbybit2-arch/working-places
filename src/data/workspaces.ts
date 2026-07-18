export type WorkspaceStatus = 'live' | 'coming_soon'

export type Workspace = {
  id: number
  slug: string
  name: string
  short: string
  description: string
  status: WorkspaceStatus
  accent: string
  icon: 'telegram' | 'spark' | 'chart' | 'mail' | 'bot' | 'cloud' | 'shield' | 'code' | 'wallet' | 'globe'
}

export const workspaces: Workspace[] = [
  {
    id: 1,
    slug: 'telegram',
    name: 'Telegram Workspace',
    short: 'Telegram',
    description: 'Login with Telegram, read chats, and send messages from one professional console.',
    status: 'live',
    accent: '#2AABEE',
    icon: 'telegram',
  },
  {
    id: 2,
    slug: 'spot',
    name: 'World Cup Spot',
    short: 'Spot',
    description: 'FIFA World Cup live scores, fixtures, table, and official free highlights.',
    status: 'live',
    accent: '#fbbf24',
    icon: 'chart',
  },
  {
    id: 3,
    slug: 'mail',
    name: 'Mail Studio',
    short: 'Mail',
    description: 'Unified inbox and campaign composer.',
    status: 'coming_soon',
    accent: '#f472b6',
    icon: 'mail',
  },
  {
    id: 4,
    slug: 'bots',
    name: 'Bot Factory',
    short: 'Bots',
    description: 'Build and monitor automation bots.',
    status: 'coming_soon',
    accent: '#34d399',
    icon: 'bot',
  },
  {
    id: 5,
    slug: 'cloud',
    name: 'Cloud Ops',
    short: 'Cloud',
    description: 'Deployments, logs, and infra controls.',
    status: 'coming_soon',
    accent: '#38bdf8',
    icon: 'cloud',
  },
  {
    id: 6,
    slug: 'security',
    name: 'Security Hub',
    short: 'Security',
    description: 'Keys, sessions, and access policies.',
    status: 'coming_soon',
    accent: '#fbbf24',
    icon: 'shield',
  },
  {
    id: 7,
    slug: 'dev',
    name: 'Dev Lab',
    short: 'Dev Lab',
    description: 'Snippets, webhooks, and API playground.',
    status: 'coming_soon',
    accent: '#a78bfa',
    icon: 'code',
  },
  {
    id: 8,
    slug: 'finance',
    name: 'Finance Board',
    short: 'Finance',
    description: 'Wallets, payouts, and settlement tools.',
    status: 'coming_soon',
    accent: '#4ade80',
    icon: 'wallet',
  },
  {
    id: 9,
    slug: 'crm',
    name: 'CRM Pulse',
    short: 'CRM',
    description: 'Leads, pipelines, and follow-ups.',
    status: 'coming_soon',
    accent: '#fb7185',
    icon: 'spark',
  },
  {
    id: 10,
    slug: 'web',
    name: 'Web Console',
    short: 'Web',
    description: 'Sites, domains, and content publish flow.',
    status: 'coming_soon',
    accent: '#22d3ee',
    icon: 'globe',
  },
]
