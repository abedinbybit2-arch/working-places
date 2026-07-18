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
    name: 'Temp Mail',
    short: 'Temp Mail',
    description: 'Disposable inbox that survives browser refresh. mail.tm + 1secmail fallback.',
    status: 'live',
    accent: '#f472b6',
    icon: 'mail',
  },
  {
    id: 4,
    slug: 'facebook-recovery',
    name: 'Facebook Recovery',
    short: 'FB Recover',
    description: 'Official Facebook forgot-password assistant for your own account only.',
    status: 'live',
    accent: '#3b82f6',
    icon: 'bot',
  },
  {
    id: 5,
    slug: 'telegram-bot',
    name: 'Bot Automation',
    short: 'Bot Auto',
    description: 'Telegram group custom auto-reply rules + worker for 24/7 replies.',
    status: 'live',
    accent: '#34d399',
    icon: 'bot',
  },
  {
    id: 6,
    slug: 'session-extract',
    name: 'Session Extractor',
    short: 'Session',
    description: 'Export your own Telegram session as GramJS, Telethon, and Pyrogram strings.',
    status: 'live',
    accent: '#fbbf24',
    icon: 'shield',
  },
  {
    id: 7,
    slug: 'ton-wallet',
    name: 'TON Wallet & Explorer',
    short: 'TON',
    description: 'Create TON wallet, balances, jettons, and tonviewer-style blockchain search.',
    status: 'live',
    accent: '#a78bfa',
    icon: 'wallet',
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
