/**
 * Local TON wallet create / import (non-custodial).
 * Keys stay in the browser only — never uploaded.
 */

import { mnemonicNew, mnemonicToPrivateKey, mnemonicValidate } from '@ton/crypto'
import { WalletContractV4, WalletContractV5R1 } from '@ton/ton'

const STORAGE_KEY = 'wp_ton_wallets_v1'

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

export async function createWallet(opts?: {
  label?: string
  version?: 'v4r2' | 'v5r1'
}): Promise<StoredWallet> {
  const version = opts?.version || 'v4r2'
  const mnemonic = await mnemonicNew(24)
  const key = await mnemonicToPrivateKey(mnemonic)
  const { address, addressNonBounce } = addressesFromKey(key.publicKey as Buffer, version)
  const wallet: StoredWallet = {
    id: `w_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    label: opts?.label?.trim() || `Wallet ${listWallets().length + 1}`,
    address,
    addressNonBounce,
    version,
    mnemonic,
    createdAt: Date.now(),
  }
  const list = loadAll()
  list.unshift(wallet)
  saveAll(list)
  return wallet
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
