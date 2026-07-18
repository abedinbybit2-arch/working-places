/**
 * Local TON wallet create / import (non-custodial).
 * Keys stay in the browser only — never uploaded.
 */

import { mnemonicNew, mnemonicToPrivateKey, mnemonicValidate } from '@ton/crypto'
import { WalletContractV4, WalletContractV5R1 } from '@ton/ton'

const STORAGE_KEY = 'wp_ton_wallets_v1'

/** Max wallets stored in this browser. */
export const MAX_WALLETS_TOTAL = 150
/** Max wallets created in one bulk run. */
export const MAX_BULK_CREATE = 100

export type StoredWallet = {
  id: string
  label: string
  /** Bounceable EQ… form for explorer APIs */
  address: string
  /** Non-bounceable UQ… form (user-friendly) */
  addressNonBounce: string
  version: 'v4r2' | 'v5r1'
  /** 24-word mnemonic — sensitive */
  mnemonic: string[]
  createdAt: number
}

export type PublicWallet = Omit<StoredWallet, 'mnemonic'> & { hasMnemonic: boolean }

function loadAll(): StoredWallet[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as StoredWallet[]
  } catch {
    return []
  }
}

function saveAll(list: StoredWallet[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

export function listWallets(): PublicWallet[] {
  return loadAll().map(({ mnemonic: _m, ...rest }) => ({ ...rest, hasMnemonic: true }))
}

export function walletCount(): number {
  return loadAll().length
}

export function remainingWalletSlots(): number {
  return Math.max(0, MAX_WALLETS_TOTAL - walletCount())
}

export function getWallet(id: string): StoredWallet | null {
  return loadAll().find((w) => w.id === id) || null
}

export function getMnemonic(id: string): string[] | null {
  return getWallet(id)?.mnemonic || null
}

export function deleteWallet(id: string) {
  saveAll(loadAll().filter((w) => w.id !== id))
}

export function renameWallet(id: string, label: string) {
  const list = loadAll()
  const w = list.find((x) => x.id === id)
  if (!w) return
  w.label = label.trim() || w.label
  saveAll(list)
}

function addressesFromKey(publicKey: Buffer, version: 'v4r2' | 'v5r1') {
  if (version === 'v5r1') {
    const wallet = WalletContractV5R1.create({ publicKey })
    const bounceable = wallet.address.toString({ urlSafe: true, bounceable: true, testOnly: false })
    const nonBounce = wallet.address.toString({ urlSafe: true, bounceable: false, testOnly: false })
    return { address: bounceable, addressNonBounce: nonBounce }
  }
  const wallet = WalletContractV4.create({ workchain: 0, publicKey })
  const bounceable = wallet.address.toString({ urlSafe: true, bounceable: true, testOnly: false })
  const nonBounce = wallet.address.toString({ urlSafe: true, bounceable: false, testOnly: false })
  return { address: bounceable, addressNonBounce: nonBounce }
}

async function buildWallet(opts: {
  label: string
  version: 'v4r2' | 'v5r1'
  indexHint?: number
}): Promise<StoredWallet> {
  const mnemonic = await mnemonicNew(24)
  const key = await mnemonicToPrivateKey(mnemonic)
  const { address, addressNonBounce } = addressesFromKey(key.publicKey as Buffer, opts.version)
  return {
    id: `w_${Date.now()}_${opts.indexHint ?? 0}_${Math.random().toString(36).slice(2, 9)}`,
    label: opts.label,
    address,
    addressNonBounce,
    version: opts.version,
    mnemonic,
    createdAt: Date.now(),
  }
}

export async function createWallet(opts?: {
  label?: string
  version?: 'v4r2' | 'v5r1'
}): Promise<StoredWallet> {
  if (remainingWalletSlots() < 1) {
    throw new Error(`Wallet limit reached (${MAX_WALLETS_TOTAL}). Delete some wallets first.`)
  }
  const version = opts?.version || 'v4r2'
  const n = loadAll().length + 1
  const wallet = await buildWallet({
    label: opts?.label?.trim() || `Wallet ${n}`,
    version,
    indexHint: n,
  })
  const list = loadAll()
  list.unshift(wallet)
  saveAll(list)
  return wallet
}

/**
 * Bulk-create up to MAX_BULK_CREATE wallets per run, capped by remaining slots (max 150 total).
 * Yields to the event loop every few wallets so the UI can update progress.
 */
export async function createWalletsBulk(opts: {
  count: number
  version?: 'v4r2' | 'v5r1'
  labelPrefix?: string
  onProgress?: (done: number, total: number) => void
}): Promise<StoredWallet[]> {
  const version = opts.version || 'v4r2'
  const prefix = opts.labelPrefix?.trim() || 'Bulk'
  let count = Math.floor(Number(opts.count) || 0)
  if (count < 1) throw new Error('Enter how many wallets to create (1–100)')
  if (count > MAX_BULK_CREATE) {
    throw new Error(`Bulk create max is ${MAX_BULK_CREATE} at once`)
  }

  const free = remainingWalletSlots()
  if (free < 1) {
    throw new Error(`Wallet limit reached (${MAX_WALLETS_TOTAL}). Delete some wallets first.`)
  }
  if (count > free) count = free

  const created: StoredWallet[] = []
  const base = loadAll().length
  const list = loadAll()

  for (let i = 0; i < count; i++) {
    const wallet = await buildWallet({
      label: `${prefix} ${base + i + 1}`,
      version,
      indexHint: base + i + 1,
    })
    created.push(wallet)
    list.unshift(wallet)
    opts.onProgress?.(i + 1, count)
    // Keep UI responsive during large batches
    if (i % 5 === 4) {
      await new Promise((r) => setTimeout(r, 0))
    }
  }

  saveAll(list)
  return created
}

/** CSV export: label, address (UQ), address (EQ), version, mnemonic */
export function exportWalletsCsv(wallets?: StoredWallet[]): string {
  const rows = wallets || loadAll()
  const lines = ['label,address_uq,address_eq,version,mnemonic']
  for (const w of rows) {
    const seed = w.mnemonic.join(' ')
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
    lines.push(
      [esc(w.label), esc(w.addressNonBounce), esc(w.address), esc(w.version), esc(seed)].join(','),
    )
  }
  return lines.join('\n')
}

export function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function importWallet(opts: {
  mnemonic: string
  label?: string
  version?: 'v4r2' | 'v5r1'
}): Promise<StoredWallet> {
  const words = opts.mnemonic
    .trim()
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(Boolean)
  if (words.length !== 12 && words.length !== 24) {
    throw new Error('Mnemonic must be 12 or 24 words')
  }
  const ok = await mnemonicValidate(words)
  if (!ok) throw new Error('Invalid mnemonic — check words and order')

  const version = opts.version || 'v4r2'
  const key = await mnemonicToPrivateKey(words)
  const { address, addressNonBounce } = addressesFromKey(key.publicKey as Buffer, version)

  // Avoid duplicates
  const existing = loadAll().find((w) => w.address === address && w.version === version)
  if (existing) return existing

  if (remainingWalletSlots() < 1) {
    throw new Error(`Wallet limit reached (${MAX_WALLETS_TOTAL}). Delete some wallets first.`)
  }

  const wallet: StoredWallet = {
    id: `w_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    label: opts.label?.trim() || `Imported ${short(address)}`,
    address,
    addressNonBounce,
    version,
    mnemonic: words,
    createdAt: Date.now(),
  }
  const list = loadAll()
  list.unshift(wallet)
  saveAll(list)
  return wallet
}

function short(a: string) {
  return `${a.slice(0, 4)}…${a.slice(-4)}`
}

/** Preferred address for display (UQ non-bounceable). */
export function displayAddress(w: { addressNonBounce?: string; address: string }) {
  return w.addressNonBounce || w.address
}
