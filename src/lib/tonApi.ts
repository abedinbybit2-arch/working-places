/**
 * TON blockchain data via TonAPI (same stack powering tonviewer.com).
 * Docs: https://tonapi.io · https://docs.tonconsole.com/tonapi/rest-api
 */

/** Always go through app proxy (Vite dev + Vercel rewrite) to avoid browser CORS. */
const BASE = '/api/tonapi'

export type TonNetworkStatus = {
  rest_online: boolean
  indexing_latency: number
  last_known_masterchain_seqno: number
}

export type TonRates = {
  prices: Record<string, number>
  diff_24h?: Record<string, string>
  diff_7d?: Record<string, string>
  diff_30d?: Record<string, string>
}

export type TonAccount = {
  address: string
  balance: number | string
  status?: string
  interfaces?: string[]
  name?: string
  is_wallet?: boolean
  is_scam?: boolean
  icon?: string
  memo_required?: boolean
  get_methods?: string[]
  last_activity?: number
  code_hash?: string
  data_hash?: string
}

export type TonJettonBalance = {
  balance: string
  wallet_address?: { address?: string }
  jetton: {
    address: string
    name?: string
    symbol?: string
    decimals?: number
    image?: string
    verification?: string
    score?: number
  }
  price?: { prices?: Record<string, number> }
}

export type TonNftItem = {
  address: string
  index?: number
  owner?: { address?: string }
  collection?: { address?: string; name?: string }
  metadata?: {
    name?: string
    description?: string
    image?: string
    attributes?: { trait_type?: string; value?: string }[]
  }
  previews?: { resolution?: string; url?: string }[]
  verified?: boolean
  trust?: string
}

export type TonEvent = {
  event_id: string
  timestamp: number
  actions: {
    type?: string
    status?: string
    simple_preview?: {
      name?: string
      description?: string
      value?: string
      value_image?: string
      accounts?: { address?: string; name?: string }[]
    }
  }[]
  account?: { address?: string }
  is_scam?: boolean
  lt?: number
  in_progress?: boolean
}

export type TonTransaction = {
  hash: string
  lt: number
  account?: { address?: string }
  success?: boolean
  utime?: number
  orig_status?: string
  end_status?: string
  total_fees?: number
  end_balance?: number
  transaction_type?: string
  in_msg?: {
    source?: { address?: string }
    destination?: { address?: string }
    value?: number
    decoded_body?: { comment?: string; text?: string }
    decoded_op_name?: string
    op_code?: string
  }
  out_msgs?: unknown[]
  block?: string
}

export type TonJettonInfo = {
  mintable?: boolean
  total_supply?: string
  metadata?: {
    address?: string
    name?: string
    symbol?: string
    decimals?: string | number
    image?: string
    description?: string
  }
  verification?: string
  holders_count?: number
  admin?: { address?: string }
  preview?: string
  price?: { prices?: Record<string, number>; diff_24h?: Record<string, string> }
  market_cap?: string
  volume_24h?: string
}

export type TonBlock = {
  workchain_id: number
  shard: string
  seqno: number
  root_hash?: string
  file_hash?: string
  gen_utime?: number
  tx_quantity?: number
  value_flow?: { fees_collected?: { grams?: number | string } }
}

export type TonDnsAuction = {
  domain: string
  owner?: string
  price?: number | string
  bids_count?: number
  date?: number
}

export type TonAddressParse = {
  raw_form?: string
  bounceable?: { b64url?: string; b64?: string }
  non_bounceable?: { b64url?: string; b64?: string }
  given_type?: string
  test_only?: boolean
}

async function tonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = path.startsWith('http') ? path : `${BASE}${path}`
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers || {}),
    },
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const j = (await res.json()) as { error?: string; message?: string }
      detail = j.error || j.message || detail
    } catch {
      /* ignore */
    }
    throw new Error(detail || `TON API ${res.status}`)
  }
  return res.json() as Promise<T>
}

export function nanoToTon(nano: number | string | undefined | null, decimals = 9): number {
  if (nano === undefined || nano === null || nano === '') return 0
  const s = String(nano)
  try {
    const neg = s.startsWith('-')
    const raw = neg ? s.slice(1) : s
    const padded = raw.padStart(decimals + 1, '0')
    const whole = padded.slice(0, -decimals) || '0'
    const frac = padded.slice(-decimals)
    const n = Number(`${whole}.${frac}`)
    return neg ? -n : n
  } catch {
    return Number(nano) / 10 ** decimals
  }
}

export function formatTon(nano: number | string | undefined, digits = 4): string {
  const n = nanoToTon(nano)
  if (!Number.isFinite(n)) return '0'
  return n.toLocaleString(undefined, { maximumFractionDigits: digits })
}

export function formatUsd(n: number | undefined, digits = 2): string {
  if (n === undefined || !Number.isFinite(n)) return '—'
  return n.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: digits,
  })
}

export function shortAddr(addr: string, left = 6, right = 4): string {
  if (!addr || addr.length < left + right + 3) return addr || '—'
  return `${addr.slice(0, left)}…${addr.slice(-right)}`
}

export function looksLikeTonAddress(q: string): boolean {
  const s = q.trim()
  return /^(EQ|UQ|kQ|0Q)[A-Za-z0-9_-]{46}$/.test(s) || /^-?\d:[a-fA-F0-9]{64}$/.test(s)
}

export function looksLikeTxHash(q: string): boolean {
  return /^[a-fA-F0-9]{64}$/.test(q.trim())
}

export function looksLikeDomain(q: string): boolean {
  const s = q.trim().toLowerCase()
  return s.endsWith('.ton') || s.endsWith('.t.me')
}

export async function getStatus() {
  return tonFetch<TonNetworkStatus>('/v2/status')
}

export async function getMasterchainHead() {
  return tonFetch<TonBlock>('/v2/blockchain/masterchain-head')
}

export async function getRates(tokens = 'ton', currencies = 'usd') {
  const data = await tonFetch<{ rates: Record<string, TonRates> }>(
    `/v2/rates?tokens=${encodeURIComponent(tokens)}&currencies=${encodeURIComponent(currencies)}`,
  )
  return data.rates
}

export async function getAccount(address: string) {
  return tonFetch<TonAccount>(`/v2/accounts/${encodeURIComponent(address)}`)
}

export async function getAccountJettons(address: string) {
  const data = await tonFetch<{ balances: TonJettonBalance[] }>(
    `/v2/accounts/${encodeURIComponent(address)}/jettons?currencies=usd`,
  )
  return data.balances || []
}

export async function getAccountNfts(address: string, limit = 50) {
  const data = await tonFetch<{ nft_items: TonNftItem[] }>(
    `/v2/accounts/${encodeURIComponent(address)}/nfts?limit=${limit}&indirect_ownership=true`,
  )
  return data.nft_items || []
}

export async function getAccountEvents(address: string, limit = 30) {
  const data = await tonFetch<{ events: TonEvent[] }>(
    `/v2/accounts/${encodeURIComponent(address)}/events?limit=${limit}`,
  )
  return data.events || []
}

export async function getAccountTransactions(address: string, limit = 30) {
  const data = await tonFetch<{ transactions: TonTransaction[] }>(
    `/v2/blockchain/accounts/${encodeURIComponent(address)}/transactions?limit=${limit}`,
  )
  return data.transactions || []
}

export async function getTransaction(hash: string) {
  return tonFetch<TonTransaction>(`/v2/blockchain/transactions/${encodeURIComponent(hash)}`)
}

export async function getEvent(eventId: string) {
  return tonFetch<TonEvent>(`/v2/events/${encodeURIComponent(eventId)}`)
}

export async function getJettons(limit = 50) {
  const data = await tonFetch<{ jettons: TonJettonInfo[] }>(`/v2/jettons?limit=${limit}`)
  return data.jettons || []
}

export async function getJetton(address: string) {
  return tonFetch<TonJettonInfo>(`/v2/jettons/${encodeURIComponent(address)}`)
}

export async function getJettonHolders(address: string, limit = 20) {
  const data = await tonFetch<{
    addresses: { address: string; owner?: { address?: string }; balance: string }[]
  }>(`/v2/jettons/${encodeURIComponent(address)}/holders?limit=${limit}`)
  return data.addresses || []
}

export async function getNftItem(address: string) {
  return tonFetch<TonNftItem>(`/v2/nfts/${encodeURIComponent(address)}`)
}

export async function getNftCollection(address: string) {
  return tonFetch<{
    address: string
    next_item_index?: number
    owner?: { address?: string }
    metadata?: { name?: string; description?: string; image?: string }
    previews?: { url?: string }[]
  }>(`/v2/nfts/collections/${encodeURIComponent(address)}`)
}

export async function getNftCollections(limit = 24) {
  const data = await tonFetch<{
    nft_collections: {
      address: string
      next_item_index?: number
      metadata?: { name?: string; description?: string; image?: string }
      previews?: { url?: string }[]
    }[]
  }>(`/v2/nfts/collections?limit=${limit}`)
  return data.nft_collections || []
}

export async function resolveDns(domain: string) {
  return tonFetch<{
    wallet?: { address?: string; name?: string; is_wallet?: boolean }
    sites?: string[]
    storage?: string
    expiring_at?: number
  }>(`/v2/dns/${encodeURIComponent(domain)}/resolve`)
}

export async function getDnsAuctions(limit = 30) {
  const data = await tonFetch<{ data: TonDnsAuction[] }>(`/v2/dns/auctions`)
  const list = data.data || []
  return list.slice(0, limit)
}

export async function searchAccounts(name: string, limit = 15) {
  try {
    const data = await tonFetch<{ addresses: { address: string; name?: string }[] }>(
      `/v2/accounts/search?name=${encodeURIComponent(name)}&limit=${limit}`,
    )
    return data.addresses || []
  } catch {
    return []
  }
}

export async function parseAddress(address: string) {
  return tonFetch<TonAddressParse>(`/v2/address/${encodeURIComponent(address)}/parse`)
}

export async function getBlockchainConfig() {
  return tonFetch<Record<string, unknown>>('/v2/blockchain/config')
}

export async function getStakingPools() {
  try {
    const data = await tonFetch<{ pools: unknown[] }>('/v2/staking/nominator_pools?available_for=')
    return data.pools || []
  } catch {
    try {
      const data = await tonFetch<{ pools: unknown[] }>('/v2/staking/pools')
      return data.pools || []
    } catch {
      return []
    }
  }
}

export async function getValidators() {
  try {
    return tonFetch<{
      elect_at?: number
      elect_close?: number
      min_stake?: number
      total_stake?: number
      validators?: { address?: string; adnl_addr?: string; weight?: number; stake?: number }[]
    }>('/v2/blockchain/validators')
  } catch {
    return { validators: [] }
  }
}

export async function getRecentBlocks(limit = 15) {
  const head = await getMasterchainHead()
  const blocks: TonBlock[] = [head]
  // Fetch previous masterchain blocks by seqno
  const start = head.seqno
  const jobs: Promise<TonBlock | null>[] = []
  for (let i = 1; i < limit; i++) {
    const seq = start - i
    if (seq < 0) break
    jobs.push(
      tonFetch<TonBlock>(`/v2/blockchain/blocks/${encodeURIComponent(`(-1,8000000000000000,${seq})`)}`).catch(
        () => null,
      ),
    )
  }
  const rest = await Promise.all(jobs)
  for (const b of rest) if (b) blocks.push(b)
  return blocks
}

export type SearchResult =
  | { kind: 'account'; account: TonAccount }
  | { kind: 'transaction'; tx: TonTransaction }
  | { kind: 'domain'; domain: string; resolve: Awaited<ReturnType<typeof resolveDns>> }
  | { kind: 'jetton'; jetton: TonJettonInfo }
  | { kind: 'nft'; nft: TonNftItem }
  | { kind: 'accounts'; list: { address: string; name?: string }[] }
  | { kind: 'empty' }

/**
 * Universal TON search (tonviewer-style): address · tx · domain · jetton · name.
 */
export async function tonSearch(query: string): Promise<SearchResult> {
  const q = query.trim()
  if (!q) return { kind: 'empty' }

  if (looksLikeTxHash(q)) {
    try {
      const tx = await getTransaction(q)
      return { kind: 'transaction', tx }
    } catch {
      /* fall through */
    }
  }

  if (looksLikeDomain(q)) {
    try {
      const resolve = await resolveDns(q)
      return { kind: 'domain', domain: q, resolve }
    } catch {
      /* fall through */
    }
  }

  if (looksLikeTonAddress(q)) {
    // Try account first, then jetton master, then NFT
    try {
      const account = await getAccount(q)
      // Prefer jetton if interface says so
      if (account.interfaces?.some((i) => i.includes('jetton_master'))) {
        try {
          const jetton = await getJetton(q)
          return { kind: 'jetton', jetton }
        } catch {
          /* use account */
        }
      }
      if (account.interfaces?.some((i) => i.includes('nft'))) {
        try {
          const nft = await getNftItem(q)
          return { kind: 'nft', nft }
        } catch {
          /* use account */
        }
      }
      return { kind: 'account', account }
    } catch {
      try {
        const jetton = await getJetton(q)
        return { kind: 'jetton', jetton }
      } catch {
        try {
          const nft = await getNftItem(q)
          return { kind: 'nft', nft }
        } catch {
          /* empty */
        }
      }
    }
  }

  // Name search + optional jetton list filter
  const list = await searchAccounts(q)
  if (list.length === 1) {
    try {
      const account = await getAccount(list[0].address)
      return { kind: 'account', account }
    } catch {
      return { kind: 'accounts', list }
    }
  }
  if (list.length > 1) return { kind: 'accounts', list }

  // Try domain without TLD
  if (!q.includes('.')) {
    try {
      const resolve = await resolveDns(`${q}.ton`)
      return { kind: 'domain', domain: `${q}.ton`, resolve }
    } catch {
      /* empty */
    }
  }

  return { kind: 'empty' }
}

export function tonviewerUrl(path: string) {
  const p = path.startsWith('/') ? path : `/${path}`
  return `https://tonviewer.com${p}`
}
