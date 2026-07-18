import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Blocks,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Gavel,
  Image as ImageIcon,
  KeyRound,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Wallet,
  Coins,
  Activity,
  Wrench,
  Globe,
} from 'lucide-react'
import {
  formatTon,
  formatUsd,
  getAccount,
  getAccountEvents,
  getAccountJettons,
  getAccountNfts,
  getAccountTransactions,
  getDnsAuctions,
  getJetton,
  getJettonHolders,
  getJettons,
  getMasterchainHead,
  getNftCollections,
  getNftItem,
  getRates,
  getRecentBlocks,
  getStatus,
  getTransaction,
  getValidators,
  nanoToTon,
  parseAddress,
  shortAddr,
  tonSearch,
  tonviewerUrl,
  type SearchResult,
  type TonAccount,
  type TonBlock,
  type TonDnsAuction,
  type TonEvent,
  type TonJettonBalance,
  type TonJettonInfo,
  type TonNetworkStatus,
  type TonNftItem,
  type TonTransaction,
} from '../../lib/tonApi'
import {
  createWallet,
  createWalletsBulk,
  deleteWallet,
  displayAddress,
  downloadText,
  exportWalletsCsv,
  getMnemonic,
  importWallet,
  listWallets,
  MAX_BULK_CREATE,
  MAX_WALLETS_TOTAL,
  remainingWalletSlots,
  walletCount,
  type PublicWallet,
} from '../../lib/tonWallet'
import './TonWalletWorkspace.css'

type Tab = 'wallet' | 'search' | 'tokens' | 'nfts' | 'stats' | 'auctions' | 'blocks' | 'tools'

type AccountBundle = {
  account: TonAccount
  jettons: TonJettonBalance[]
  nfts: TonNftItem[]
  events: TonEvent[]
  txs: TonTransaction[]
  tonUsd?: number
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function timeAgo(ts?: number) {
  if (!ts) return '—'
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(ts * 1000).toLocaleString()
}

function jettonAmount(balance: string, decimals = 9) {
  return nanoToTon(balance, decimals)
}

async function loadAccountBundle(address: string): Promise<AccountBundle> {
  const [account, jettons, nfts, events, txs, rates] = await Promise.all([
    getAccount(address),
    getAccountJettons(address).catch(() => [] as TonJettonBalance[]),
    getAccountNfts(address, 40).catch(() => [] as TonNftItem[]),
    getAccountEvents(address, 25).catch(() => [] as TonEvent[]),
    getAccountTransactions(address, 25).catch(() => [] as TonTransaction[]),
    getRates().catch(() => ({}) as Record<string, { prices?: Record<string, number> }>),
  ])
  return {
    account,
    jettons,
    nfts,
    events,
    txs,
    tonUsd: rates.TON?.prices?.USD,
  }
}

export function TonWalletWorkspace() {
  const [tab, setTab] = useState<Tab>('wallet')
  const [wallets, setWallets] = useState<PublicWallet[]>(() => listWallets())
  const [activeId, setActiveId] = useState<string | null>(() => listWallets()[0]?.id || null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')
  const [bundle, setBundle] = useState<AccountBundle | null>(null)
  const [showSeed, setShowSeed] = useState(false)
  const [seedWords, setSeedWords] = useState<string[] | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [walletVersion, setWalletVersion] = useState<'v4r2' | 'v5r1'>('v4r2')
  const [ackSeed, setAckSeed] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkCount, setBulkCount] = useState(10)
  const [bulkPrefix, setBulkPrefix] = useState('Bulk')
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null)
  const slotsLeft = remainingWalletSlots()
  const totalWallets = walletCount()

  // Search / explorer
  const [query, setQuery] = useState('')
  const [searchBusy, setSearchBusy] = useState(false)
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null)
  const [explored, setExplored] = useState<AccountBundle | null>(null)
  const [txDetail, setTxDetail] = useState<TonTransaction | null>(null)
  const [jettonDetail, setJettonDetail] = useState<{
    info: TonJettonInfo
    holders: { address: string; owner?: { address?: string }; balance: string }[]
  } | null>(null)
  const [nftDetail, setNftDetail] = useState<TonNftItem | null>(null)

  // Market / network
  const [tokens, setTokens] = useState<TonJettonInfo[]>([])
  const [collections, setCollections] = useState<
    { address: string; metadata?: { name?: string; image?: string }; previews?: { url?: string }[] }[]
  >([])
  const [status, setStatus] = useState<TonNetworkStatus | null>(null)
  const [head, setHead] = useState<TonBlock | null>(null)
  const [rates, setRates] = useState<{ usd?: number; d24?: string; d7?: string }>({})
  const [blocks, setBlocks] = useState<TonBlock[]>([])
  const [auctions, setAuctions] = useState<TonDnsAuction[]>([])
  const [validators, setValidators] = useState<{
    total_stake?: number
    validators?: { address?: string; stake?: number }[]
  } | null>(null)
  const [toolAddr, setToolAddr] = useState('')
  const [parsedAddr, setParsedAddr] = useState<Awaited<ReturnType<typeof parseAddress>> | null>(null)

  const active = useMemo(() => wallets.find((w) => w.id === activeId) || null, [wallets, activeId])

  const refreshWallets = useCallback(() => {
    const list = listWallets()
    setWallets(list)
    if (!list.find((w) => w.id === activeId)) setActiveId(list[0]?.id || null)
  }, [activeId])

  const loadWalletData = useCallback(async (address: string) => {
    setBusy(true)
    setError('')
    try {
      const b = await loadAccountBundle(address)
      setBundle(b)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (active?.address) void loadWalletData(active.address)
    else setBundle(null)
  }, [active?.address, loadWalletData])

  useEffect(() => {
    void (async () => {
      try {
        const [st, hd, rt] = await Promise.all([
          getStatus().catch(() => null),
          getMasterchainHead().catch(() => null),
          getRates().catch(() => null),
        ])
        if (st) setStatus(st)
        if (hd) setHead(hd)
        if (rt?.TON) {
          setRates({
            usd: rt.TON.prices?.USD,
            d24: rt.TON.diff_24h?.USD,
            d7: rt.TON.diff_7d?.USD,
          })
        }
      } catch {
        /* ignore boot */
      }
    })()
  }, [])

  useEffect(() => {
    if (tab === 'tokens' && tokens.length === 0) {
      void getJettons(40)
        .then(setTokens)
        .catch((e) => setError(String(e.message || e)))
    }
    if (tab === 'nfts' && collections.length === 0) {
      void getNftCollections(24)
        .then(setCollections)
        .catch((e) => setError(String(e.message || e)))
    }
    if (tab === 'stats' && !validators) {
      void getValidators()
        .then((v) => setValidators(v))
        .catch(() => setValidators({ validators: [] }))
    }
    if (tab === 'blocks' && blocks.length === 0) {
      void getRecentBlocks(12)
        .then(setBlocks)
        .catch((e) => setError(String(e.message || e)))
    }
    if (tab === 'auctions' && auctions.length === 0) {
      void getDnsAuctions(40)
        .then(setAuctions)
        .catch((e) => setError(String(e.message || e)))
    }
  }, [tab, tokens.length, collections.length, validators, blocks.length, auctions.length])

  function notify(msg: string) {
    setFlash(msg)
    window.setTimeout(() => setFlash(''), 1800)
  }

  async function handleCreate() {
    if (!ackSeed) {
      setError('Confirm you will back up the seed phrase offline before creating a wallet.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const w = await createWallet({ version: walletVersion })
      refreshWallets()
      setActiveId(w.id)
      setSeedWords(w.mnemonic)
      setShowSeed(true)
      setTab('wallet')
      notify('Wallet created — save your seed phrase now')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleBulkCreate() {
    if (!ackSeed) {
      setError('Confirm you will back up all seed phrases (download CSV) before bulk create.')
      return
    }
    const n = Math.floor(Number(bulkCount) || 0)
    if (n < 1) {
      setError('Enter a number between 1 and 100')
      return
    }
    if (n > MAX_BULK_CREATE) {
      setError(`Max ${MAX_BULK_CREATE} wallets per bulk run`)
      return
    }
    if (slotsLeft < 1) {
      setError(`Total limit ${MAX_WALLETS_TOTAL} reached. Delete some wallets first.`)
      return
    }
    const willCreate = Math.min(n, slotsLeft, MAX_BULK_CREATE)
    if (willCreate < n) {
      if (
        !confirm(
          `Only ${willCreate} slots left (total max ${MAX_WALLETS_TOTAL}). Create ${willCreate} wallets?`,
        )
      ) {
        return
      }
    }

    setBusy(true)
    setError('')
    setBulkProgress({ done: 0, total: willCreate })
    try {
      const created = await createWalletsBulk({
        count: willCreate,
        version: walletVersion,
        labelPrefix: bulkPrefix || 'Bulk',
        onProgress: (done, total) => setBulkProgress({ done, total }),
      })
      refreshWallets()
      if (created[0]) setActiveId(created[0].id)
      // Auto-download CSV of this batch (seeds included)
      const csv = exportWalletsCsv(created)
      downloadText(
        `ton-bulk-wallets-${created.length}-${Date.now()}.csv`,
        csv,
      )
      setBulkOpen(false)
      setShowSeed(false)
      setSeedWords(null)
      notify(`${created.length} wallets created · CSV downloaded (KEEP PRIVATE)`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      setBulkProgress(null)
    }
  }

  function handleExportAll() {
    if (walletCount() < 1) {
      setError('No wallets to export')
      return
    }
    if (!confirm('Export ALL wallets including seed phrases as CSV? Keep the file private.')) return
    downloadText(`ton-all-wallets-${walletCount()}-${Date.now()}.csv`, exportWalletsCsv())
    notify('All wallets exported (private CSV)')
  }

  async function handleImport() {
    setBusy(true)
    setError('')
    try {
      const w = await importWallet({ mnemonic: importText, version: walletVersion })
      refreshWallets()
      setActiveId(w.id)
      setImportOpen(false)
      setImportText('')
      notify('Wallet imported')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function handleDelete(id: string) {
    if (!confirm('Delete this wallet from this browser? Make sure seed is backed up.')) return
    deleteWallet(id)
    refreshWallets()
    setSeedWords(null)
    setShowSeed(false)
    notify('Wallet removed locally')
  }

  function revealSeed(id: string) {
    const m = getMnemonic(id)
    if (!m) {
      setError('Seed not found')
      return
    }
    setSeedWords(m)
    setShowSeed(true)
  }

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault()
    if (!query.trim()) return
    setSearchBusy(true)
    setError('')
    setSearchResult(null)
    setExplored(null)
    setTxDetail(null)
    setJettonDetail(null)
    setNftDetail(null)
    try {
      const res = await tonSearch(query.trim())
      setSearchResult(res)
      if (res.kind === 'account') {
        setExplored(await loadAccountBundle(res.account.address))
      } else if (res.kind === 'transaction') {
        setTxDetail(res.tx)
      } else if (res.kind === 'jetton') {
        const holders = await getJettonHolders(res.jetton.metadata?.address || query.trim(), 15).catch(
          () => [],
        )
        setJettonDetail({ info: res.jetton, holders })
      } else if (res.kind === 'nft') {
        setNftDetail(res.nft)
      } else if (res.kind === 'domain' && res.resolve.wallet?.address) {
        setExplored(await loadAccountBundle(res.resolve.wallet.address))
      } else if (res.kind === 'empty') {
        setError('Nothing found. Try address, tx hash, jetton, NFT, or name.ton domain.')
      }
      setTab('search')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSearchBusy(false)
    }
  }

  async function openAddress(addr: string) {
    setQuery(addr)
    setSearchBusy(true)
    setError('')
    try {
      setExplored(await loadAccountBundle(addr))
      setSearchResult({ kind: 'account', account: await getAccount(addr) })
      setTxDetail(null)
      setJettonDetail(null)
      setNftDetail(null)
      setTab('search')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSearchBusy(false)
    }
  }

  async function openTx(hash: string) {
    setSearchBusy(true)
    try {
      const tx = await getTransaction(hash)
      setTxDetail(tx)
      setSearchResult({ kind: 'transaction', tx })
      setTab('search')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSearchBusy(false)
    }
  }

  async function openJetton(addr: string) {
    setSearchBusy(true)
    try {
      const info = await getJetton(addr)
      const holders = await getJettonHolders(addr, 15).catch(() => [])
      setJettonDetail({ info, holders })
      setSearchResult({ kind: 'jetton', jetton: info })
      setTab('search')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSearchBusy(false)
    }
  }

  async function openNft(addr: string) {
    setSearchBusy(true)
    try {
      const nft = await getNftItem(addr)
      setNftDetail(nft)
      setSearchResult({ kind: 'nft', nft })
      setTab('search')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSearchBusy(false)
    }
  }

  async function handleParseAddr(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      setParsedAddr(await parseAddress(toolAddr.trim()))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const tonBal = bundle ? nanoToTon(bundle.account.balance) : 0
  const tonUsd = bundle?.tonUsd ? tonBal * bundle.tonUsd : undefined

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'wallet', label: 'Wallet', icon: <Wallet size={14} /> },
    { id: 'search', label: 'TON Search', icon: <Search size={14} /> },
    { id: 'tokens', label: 'Tokens', icon: <Coins size={14} /> },
    { id: 'nfts', label: 'NFTs', icon: <ImageIcon size={14} /> },
    { id: 'stats', label: 'Stats', icon: <Activity size={14} /> },
    { id: 'auctions', label: 'Auctions', icon: <Gavel size={14} /> },
    { id: 'blocks', label: 'Blocks', icon: <Blocks size={14} /> },
    { id: 'tools', label: 'Tools', icon: <Wrench size={14} /> },
  ]

  return (
    <div className="ton-wrap">
      <section className="ton-hero">
        <div>
          <div className="ton-kicker">
            <Layers size={14} /> WP07 · TON Web3
          </div>
          <h2>TON Wallet & Explorer</h2>
          <p>
            Create a non-custodial TON wallet, view balances & jettons, and search the chain like{' '}
            <a href="https://tonviewer.com/" target="_blank" rel="noreferrer">
              tonviewer.com
            </a>{' '}
            — powered by TonAPI.
          </p>
        </div>
        <div className="ton-hero-stats">
          <div>
            <span>TON / USD</span>
            <strong>{rates.usd ? formatUsd(rates.usd, 3) : '—'}</strong>
            <em className={String(rates.d24 || '').includes('−') || String(rates.d24 || '').includes('-') ? 'down' : 'up'}>
              {rates.d24 || '—'} 24h
            </em>
          </div>
          <div>
            <span>Masterchain</span>
            <strong>#{head?.seqno?.toLocaleString() || status?.last_known_masterchain_seqno || '—'}</strong>
            <em>{status?.rest_online ? 'API online' : '…'}</em>
          </div>
        </div>
      </section>

      <form className="ton-searchbar" onSubmit={(e) => void handleSearch(e)}>
        <Search size={18} className="ton-search-ico" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search address, tx hash, jetton, NFT, name.ton domain…"
          spellCheck={false}
        />
        <button type="submit" className="ton-btn primary" disabled={searchBusy}>
          {searchBusy ? <Loader2 className="spin" size={16} /> : <Search size={16} />}
          Search
        </button>
      </form>

      <nav className="ton-tabs" aria-label="TON sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`ton-tab ${tab === t.id ? 'on' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>

      {error ? (
        <div className="ton-error" role="alert">
          {error}
          <button type="button" className="ton-btn ghost sm" onClick={() => setError('')}>
            Dismiss
          </button>
        </div>
      ) : null}
      {flash ? (
        <div className="ton-flash">
          <CheckCircle2 size={16} /> {flash}
        </div>
      ) : null}

      {tab === 'wallet' ? (
        <div className="ton-grid">
          <section className="ton-card">
            <div className="ton-card-h">
              <h3>Your wallets</h3>
              <div className="ton-row">
                <select
                  value={walletVersion}
                  onChange={(e) => setWalletVersion(e.target.value as 'v4r2' | 'v5r1')}
                  className="ton-select"
                >
                  <option value="v4r2">Wallet v4R2</option>
                  <option value="v5r1">Wallet v5R1</option>
                </select>
                <button type="button" className="ton-btn primary sm" onClick={() => void handleCreate()} disabled={busy || slotsLeft < 1}>
                  <Plus size={14} /> Create
                </button>
                <button
                  type="button"
                  className="ton-btn ghost sm"
                  onClick={() => {
                    setBulkOpen((v) => !v)
                    setImportOpen(false)
                  }}
                  disabled={busy || slotsLeft < 1}
                >
                  Bulk
                </button>
                <button
                  type="button"
                  className="ton-btn ghost sm"
                  onClick={() => {
                    setImportOpen((v) => !v)
                    setBulkOpen(false)
                  }}
                >
                  Import
                </button>
                <button type="button" className="ton-btn ghost sm" onClick={handleExportAll} disabled={totalWallets < 1}>
                  <Download size={14} /> Export all
                </button>
              </div>
            </div>

            <div className="ton-limit-bar">
              <div className="ton-limit-meta">
                <span>
                  Stored <strong>{totalWallets}</strong> / {MAX_WALLETS_TOTAL}
                </span>
                <span>
                  Free slots <strong>{slotsLeft}</strong>
                </span>
                <span>
                  Bulk max / run <strong>{MAX_BULK_CREATE}</strong>
                </span>
              </div>
              <div className="ton-limit-track" aria-hidden>
                <div
                  className="ton-limit-fill"
                  style={{ width: `${Math.min(100, (totalWallets / MAX_WALLETS_TOTAL) * 100)}%` }}
                />
              </div>
            </div>

            <label className="ton-ack">
              <input type="checkbox" checked={ackSeed} onChange={(e) => setAckSeed(e.target.checked)} />
              <span>
                I will save all seed phrases offline (CSV download). Lost seed = lost funds. Keys never leave this
                browser.
              </span>
            </label>

            {bulkOpen ? (
              <div className="ton-bulk">
                <div className="ton-bulk-row">
                  <label>
                    <span>How many (1–{MAX_BULK_CREATE})</span>
                    <input
                      type="number"
                      min={1}
                      max={MAX_BULK_CREATE}
                      value={bulkCount}
                      onChange={(e) => setBulkCount(Number(e.target.value))}
                      disabled={busy}
                    />
                  </label>
                  <label>
                    <span>Label prefix</span>
                    <input
                      type="text"
                      value={bulkPrefix}
                      onChange={(e) => setBulkPrefix(e.target.value)}
                      placeholder="Bulk"
                      disabled={busy}
                    />
                  </label>
                </div>
                <p className="ton-muted ton-bulk-hint">
                  Will create up to <strong>{Math.min(bulkCount || 0, MAX_BULK_CREATE, slotsLeft)}</strong> wallets
                  now (room left: {slotsLeft}). CSV with seeds auto-downloads when done.
                </p>
                {bulkProgress ? (
                  <div className="ton-bulk-progress">
                    <div className="ton-limit-track">
                      <div
                        className="ton-limit-fill bulk"
                        style={{
                          width: `${Math.min(100, (bulkProgress.done / Math.max(1, bulkProgress.total)) * 100)}%`,
                        }}
                      />
                    </div>
                    <span>
                      Creating {bulkProgress.done} / {bulkProgress.total}…
                    </span>
                  </div>
                ) : null}
                <div className="ton-row">
                  <button
                    type="button"
                    className="ton-btn primary sm"
                    onClick={() => void handleBulkCreate()}
                    disabled={busy || slotsLeft < 1 || !ackSeed}
                  >
                    {busy && bulkProgress ? (
                      <Loader2 className="spin" size={14} />
                    ) : (
                      <Plus size={14} />
                    )}
                    Bulk create
                  </button>
                  <button
                    type="button"
                    className="ton-btn ghost sm"
                    onClick={() => setBulkCount(10)}
                    disabled={busy}
                  >
                    10
                  </button>
                  <button
                    type="button"
                    className="ton-btn ghost sm"
                    onClick={() => setBulkCount(50)}
                    disabled={busy}
                  >
                    50
                  </button>
                  <button
                    type="button"
                    className="ton-btn ghost sm"
                    onClick={() => setBulkCount(100)}
                    disabled={busy}
                  >
                    100
                  </button>
                </div>
              </div>
            ) : null}

            {importOpen ? (
              <div className="ton-import">
                <textarea
                  rows={3}
                  placeholder="Paste 12/24-word mnemonic…"
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  spellCheck={false}
                />
                <button type="button" className="ton-btn primary sm" onClick={() => void handleImport()} disabled={busy}>
                  Import wallet
                </button>
              </div>
            ) : null}

            {wallets.length === 0 ? (
              <p className="ton-muted">No wallet yet — create one, bulk create, or import.</p>
            ) : (
              <div className="ton-wallet-list">
                {wallets.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    className={`ton-wallet-item ${activeId === w.id ? 'on' : ''}`}
                    onClick={() => setActiveId(w.id)}
                  >
                    <div>
                      <strong>{w.label}</strong>
                      <span className="mono">{shortAddr(displayAddress(w), 8, 6)}</span>
                      <em>{w.version}</em>
                    </div>
                    <div className="ton-wallet-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="ton-icon"
                        title="Copy address"
                        onClick={() =>
                          void copyText(displayAddress(w)).then((ok) => notify(ok ? 'Address copied' : 'Copy failed'))
                        }
                      >
                        <Copy size={14} />
                      </button>
                      <button type="button" className="ton-icon" title="Show seed" onClick={() => revealSeed(w.id)}>
                        <KeyRound size={14} />
                      </button>
                      <button type="button" className="ton-icon danger" title="Delete" onClick={() => handleDelete(w.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {showSeed && seedWords ? (
              <div className="ton-seed">
                <div className="ton-card-h">
                  <h4>
                    <AlertTriangle size={14} /> Seed phrase — private
                  </h4>
                  <button type="button" className="ton-btn ghost sm" onClick={() => setShowSeed((s) => !s)}>
                    {showSeed ? <EyeOff size={14} /> : <Eye size={14} />}
                    Hide
                  </button>
                </div>
                <ol className="ton-seed-grid">
                  {seedWords.map((w, i) => (
                    <li key={`${w}-${i}`}>
                      <span>{i + 1}.</span> {w}
                    </li>
                  ))}
                </ol>
                <div className="ton-row">
                  <button
                    type="button"
                    className="ton-btn ghost sm"
                    onClick={() =>
                      void copyText(seedWords.join(' ')).then((ok) => notify(ok ? 'Seed copied' : 'Copy failed'))
                    }
                  >
                    <Copy size={14} /> Copy seed
                  </button>
                  <button
                    type="button"
                    className="ton-btn ghost sm"
                    onClick={() => {
                      const blob = new Blob([seedWords.join(' ')], { type: 'text/plain' })
                      const a = document.createElement('a')
                      a.href = URL.createObjectURL(blob)
                      a.download = 'ton-seed-KEEP-PRIVATE.txt'
                      a.click()
                    }}
                  >
                    <Download size={14} /> Download
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="ton-card ton-balance-card">
            <div className="ton-card-h">
              <h3>Balance & tokens</h3>
              <button
                type="button"
                className="ton-btn ghost sm"
                disabled={!active || busy}
                onClick={() => active && void loadWalletData(active.address)}
              >
                {busy ? <Loader2 className="spin" size={14} /> : <RefreshCw size={14} />}
                Refresh
              </button>
            </div>

            {!active ? (
              <p className="ton-muted">Select or create a wallet to see balances.</p>
            ) : busy && !bundle ? (
              <div className="ton-center">
                <Loader2 className="spin" size={24} />
                <p>Loading on-chain data…</p>
              </div>
            ) : bundle ? (
              <>
                <div className="ton-bal">
                  <div>
                    <span>TON balance</span>
                    <strong>{formatTon(bundle.account.balance, 6)} TON</strong>
                    <em>{tonUsd !== undefined ? formatUsd(tonUsd) : '—'}</em>
                  </div>
                  <div>
                    <span>Status</span>
                    <strong className="cap">{bundle.account.status || 'unknown'}</strong>
                    <em>{bundle.account.is_wallet ? 'Wallet contract' : 'Account'}</em>
                  </div>
                </div>
                <div className="ton-addr-box mono">
                  <span>EQ</span> {bundle.account.address}
                  <button
                    type="button"
                    className="ton-icon"
                    onClick={() =>
                      void copyText(bundle.account.address).then((ok) => notify(ok ? 'Copied' : 'Fail'))
                    }
                  >
                    <Copy size={14} />
                  </button>
                  <a
                    href={tonviewerUrl(bundle.account.address)}
                    target="_blank"
                    rel="noreferrer"
                    className="ton-icon"
                    title="Open on Tonviewer"
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>

                <h4 className="ton-subh">Jettons ({bundle.jettons.length})</h4>
                {bundle.jettons.length === 0 ? (
                  <p className="ton-muted">No jetton tokens on this wallet.</p>
                ) : (
                  <div className="ton-token-list">
                    {bundle.jettons.map((j) => {
                      const dec = j.jetton.decimals ?? 9
                      const amt = jettonAmount(j.balance, dec)
                      const px = j.price?.prices?.USD
                      return (
                        <button
                          key={j.jetton.address}
                          type="button"
                          className="ton-token-row"
                          onClick={() => void openJetton(j.jetton.address)}
                        >
                          {j.jetton.image ? (
                            <img src={j.jetton.image} alt="" />
                          ) : (
                            <div className="ton-token-ph">{(j.jetton.symbol || '?')[0]}</div>
                          )}
                          <div>
                            <strong>{j.jetton.symbol || j.jetton.name || 'Token'}</strong>
                            <span>{j.jetton.name}</span>
                          </div>
                          <div className="ton-token-amt">
                            <strong>
                              {amt.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                            </strong>
                            <span>{px ? formatUsd(amt * px) : '—'}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}

                <h4 className="ton-subh">NFTs ({bundle.nfts.length})</h4>
                {bundle.nfts.length === 0 ? (
                  <p className="ton-muted">No NFTs.</p>
                ) : (
                  <div className="ton-nft-grid">
                    {bundle.nfts.slice(0, 12).map((n) => (
                      <button key={n.address} type="button" className="ton-nft" onClick={() => void openNft(n.address)}>
                        <img
                          src={n.previews?.[1]?.url || n.previews?.[0]?.url || n.metadata?.image || ''}
                          alt=""
                          onError={(e) => {
                            ;(e.target as HTMLImageElement).style.display = 'none'
                          }}
                        />
                        <span>{n.metadata?.name || shortAddr(n.address)}</span>
                      </button>
                    ))}
                  </div>
                )}

                <h4 className="ton-subh">Recent activity</h4>
                <div className="ton-events">
                  {bundle.events.slice(0, 12).map((ev) => (
                    <div key={ev.event_id} className="ton-event">
                      <div>
                        <strong>{ev.actions[0]?.simple_preview?.name || ev.actions[0]?.type || 'Event'}</strong>
                        <span>{ev.actions[0]?.simple_preview?.description || ''}</span>
                      </div>
                      <em>{timeAgo(ev.timestamp)}</em>
                    </div>
                  ))}
                  {bundle.events.length === 0 ? <p className="ton-muted">No recent events.</p> : null}
                </div>
              </>
            ) : null}
          </section>
        </div>
      ) : null}

      {tab === 'search' ? (
        <section className="ton-card">
          <div className="ton-card-h">
            <h3>TON Search · Explorer</h3>
            <a className="ton-btn ghost sm" href="https://tonviewer.com/" target="_blank" rel="noreferrer">
              <Globe size={14} /> tonviewer.com
            </a>
          </div>
          <p className="ton-muted">
            Same data classes as Tonviewer: accounts, transactions, jettons, NFTs, DNS domains, events.
          </p>

          {searchBusy ? (
            <div className="ton-center">
              <Loader2 className="spin" size={24} />
              <p>Querying TonAPI…</p>
            </div>
          ) : null}

          {searchResult?.kind === 'accounts' ? (
            <div className="ton-list">
              {searchResult.list.map((a) => (
                <button key={a.address} type="button" className="ton-list-row" onClick={() => void openAddress(a.address)}>
                  <strong>{a.name || shortAddr(a.address)}</strong>
                  <span className="mono">{a.address}</span>
                </button>
              ))}
            </div>
          ) : null}

          {searchResult?.kind === 'domain' ? (
            <div className="ton-detail-box">
              <h4>DNS · {searchResult.domain}</h4>
              <p>
                Wallet:{' '}
                {searchResult.resolve.wallet?.address ? (
                  <button type="button" className="linkish" onClick={() => void openAddress(searchResult.resolve.wallet!.address!)}>
                    {searchResult.resolve.wallet.address}
                  </button>
                ) : (
                  '—'
                )}
              </p>
              {searchResult.resolve.sites?.length ? (
                <p>Sites: {searchResult.resolve.sites.join(', ')}</p>
              ) : null}
            </div>
          ) : null}

          {txDetail ? (
            <div className="ton-detail-box">
              <h4>Transaction</h4>
              <p className="mono break">{txDetail.hash}</p>
              <div className="ton-meta-grid">
                <div>
                  <span>Success</span>
                  <strong>{txDetail.success ? 'Yes' : 'No'}</strong>
                </div>
                <div>
                  <span>Time</span>
                  <strong>{txDetail.utime ? new Date(txDetail.utime * 1000).toLocaleString() : '—'}</strong>
                </div>
                <div>
                  <span>Fees</span>
                  <strong>{formatTon(txDetail.total_fees || 0)} TON</strong>
                </div>
                <div>
                  <span>Type</span>
                  <strong>{txDetail.transaction_type || txDetail.in_msg?.decoded_op_name || '—'}</strong>
                </div>
                <div>
                  <span>From</span>
                  <strong className="mono">{shortAddr(txDetail.in_msg?.source?.address || '—')}</strong>
                </div>
                <div>
                  <span>To</span>
                  <strong className="mono">{shortAddr(txDetail.in_msg?.destination?.address || '—')}</strong>
                </div>
                <div>
                  <span>Value</span>
                  <strong>{formatTon(txDetail.in_msg?.value || 0)} TON</strong>
                </div>
                <div>
                  <span>LT</span>
                  <strong>{txDetail.lt}</strong>
                </div>
              </div>
              <a href={tonviewerUrl(`transaction/${txDetail.hash}`)} target="_blank" rel="noreferrer" className="ton-btn ghost sm">
                <ExternalLink size={14} /> Open on Tonviewer
              </a>
            </div>
          ) : null}

          {jettonDetail ? (
            <div className="ton-detail-box">
              <div className="ton-jetton-head">
                {(jettonDetail.info.preview || jettonDetail.info.metadata?.image) && (
                  <img src={jettonDetail.info.preview || jettonDetail.info.metadata?.image} alt="" />
                )}
                <div>
                  <h4>
                    {jettonDetail.info.metadata?.name} ({jettonDetail.info.metadata?.symbol})
                  </h4>
                  <p className="mono break">{jettonDetail.info.metadata?.address}</p>
                </div>
              </div>
              <div className="ton-meta-grid">
                <div>
                  <span>Price</span>
                  <strong>{formatUsd(jettonDetail.info.price?.prices?.USD, 6)}</strong>
                </div>
                <div>
                  <span>24h</span>
                  <strong>{jettonDetail.info.price?.diff_24h?.USD || '—'}</strong>
                </div>
                <div>
                  <span>Holders</span>
                  <strong>{jettonDetail.info.holders_count?.toLocaleString() || '—'}</strong>
                </div>
                <div>
                  <span>Verification</span>
                  <strong>{jettonDetail.info.verification || '—'}</strong>
                </div>
              </div>
              <h5>Top holders</h5>
              <div className="ton-list">
                {jettonDetail.holders.map((h) => (
                  <button
                    key={h.address}
                    type="button"
                    className="ton-list-row"
                    onClick={() => void openAddress(h.owner?.address || h.address)}
                  >
                    <span className="mono">{shortAddr(h.owner?.address || h.address)}</span>
                    <strong>{h.balance}</strong>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {nftDetail ? (
            <div className="ton-detail-box">
              <div className="ton-jetton-head">
                <img
                  src={nftDetail.previews?.[1]?.url || nftDetail.metadata?.image || ''}
                  alt=""
                  style={{ width: 96, height: 96, borderRadius: 12 }}
                />
                <div>
                  <h4>{nftDetail.metadata?.name || 'NFT'}</h4>
                  <p>{nftDetail.collection?.name}</p>
                  <p className="mono break">{nftDetail.address}</p>
                  {nftDetail.owner?.address ? (
                    <button type="button" className="linkish" onClick={() => void openAddress(nftDetail.owner!.address!)}>
                      Owner: {shortAddr(nftDetail.owner.address)}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {explored ? (
            <div className="ton-detail-box">
              <div className="ton-card-h">
                <h4>Account</h4>
                <a
                  href={tonviewerUrl(explored.account.address)}
                  target="_blank"
                  rel="noreferrer"
                  className="ton-btn ghost sm"
                >
                  <ExternalLink size={14} /> Tonviewer
                </a>
              </div>
              <p className="mono break">{explored.account.address}</p>
              <div className="ton-meta-grid">
                <div>
                  <span>Balance</span>
                  <strong>{formatTon(explored.account.balance)} TON</strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong className="cap">{explored.account.status || '—'}</strong>
                </div>
                <div>
                  <span>Interfaces</span>
                  <strong>{explored.account.interfaces?.join(', ') || '—'}</strong>
                </div>
                <div>
                  <span>Last activity</span>
                  <strong>{timeAgo(explored.account.last_activity)}</strong>
                </div>
              </div>

              <h5>Jettons ({explored.jettons.length})</h5>
              <div className="ton-token-list">
                {explored.jettons.slice(0, 20).map((j) => (
                  <button
                    key={j.jetton.address}
                    type="button"
                    className="ton-token-row"
                    onClick={() => void openJetton(j.jetton.address)}
                  >
                    {j.jetton.image ? <img src={j.jetton.image} alt="" /> : <div className="ton-token-ph">J</div>}
                    <div>
                      <strong>{j.jetton.symbol}</strong>
                      <span>{j.jetton.name}</span>
                    </div>
                    <strong>
                      {jettonAmount(j.balance, j.jetton.decimals ?? 9).toLocaleString(undefined, {
                        maximumFractionDigits: 4,
                      })}
                    </strong>
                  </button>
                ))}
              </div>

              <h5>NFTs ({explored.nfts.length})</h5>
              <div className="ton-nft-grid">
                {explored.nfts.slice(0, 16).map((n) => (
                  <button key={n.address} type="button" className="ton-nft" onClick={() => void openNft(n.address)}>
                    <img src={n.previews?.[0]?.url || n.metadata?.image || ''} alt="" />
                    <span>{n.metadata?.name || shortAddr(n.address)}</span>
                  </button>
                ))}
              </div>

              <h5>Events</h5>
              <div className="ton-events">
                {explored.events.map((ev) => (
                  <div key={ev.event_id} className="ton-event">
                    <div>
                      <strong>{ev.actions[0]?.simple_preview?.name || ev.actions[0]?.type}</strong>
                      <span>{ev.actions[0]?.simple_preview?.description}</span>
                    </div>
                    <em>{timeAgo(ev.timestamp)}</em>
                  </div>
                ))}
              </div>

              <h5>Raw transactions</h5>
              <div className="ton-list">
                {explored.txs.map((tx) => (
                  <button key={tx.hash} type="button" className="ton-list-row" onClick={() => void openTx(tx.hash)}>
                    <span className="mono">{shortAddr(tx.hash, 10, 8)}</span>
                    <span>{formatTon(tx.in_msg?.value || 0)} TON</span>
                    <em>{timeAgo(tx.utime)}</em>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {!searchBusy && !searchResult && !explored ? (
            <p className="ton-muted">Enter a query above to explore the TON blockchain.</p>
          ) : null}
        </section>
      ) : null}

      {tab === 'tokens' ? (
        <section className="ton-card">
          <div className="ton-card-h">
            <h3>Jettons market</h3>
            <button
              type="button"
              className="ton-btn ghost sm"
              onClick={() =>
                void getJettons(40)
                  .then(setTokens)
                  .catch((e) => setError(String(e.message || e)))
              }
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
          <div className="ton-token-list">
            {tokens.map((t, i) => (
              <button
                key={t.metadata?.address || i}
                type="button"
                className="ton-token-row"
                onClick={() => t.metadata?.address && void openJetton(t.metadata.address)}
              >
                {(t.preview || t.metadata?.image) && <img src={t.preview || t.metadata?.image} alt="" />}
                {!t.preview && !t.metadata?.image && <div className="ton-token-ph">{i + 1}</div>}
                <div>
                  <strong>
                    {t.metadata?.symbol} · {t.metadata?.name}
                  </strong>
                  <span>Holders {t.holders_count?.toLocaleString() || '—'} · {t.verification || ''}</span>
                </div>
                <div className="ton-token-amt">
                  <strong>{formatUsd(t.price?.prices?.USD, 6)}</strong>
                  <span>{t.price?.diff_24h?.USD || '—'}</span>
                </div>
              </button>
            ))}
            {tokens.length === 0 ? <p className="ton-muted">Loading tokens…</p> : null}
          </div>
        </section>
      ) : null}

      {tab === 'nfts' ? (
        <section className="ton-card">
          <div className="ton-card-h">
            <h3>NFT collections</h3>
            <a className="ton-btn ghost sm" href="https://tonviewer.com/nfts" target="_blank" rel="noreferrer">
              <ExternalLink size={14} /> Tonviewer NFTs
            </a>
          </div>
          <div className="ton-nft-grid large">
            {collections.map((c) => (
              <a
                key={c.address}
                className="ton-nft"
                href={tonviewerUrl(c.address)}
                target="_blank"
                rel="noreferrer"
              >
                <img src={c.previews?.[0]?.url || c.metadata?.image || ''} alt="" />
                <span>{c.metadata?.name || shortAddr(c.address)}</span>
              </a>
            ))}
          </div>
          {collections.length === 0 ? <p className="ton-muted">Loading collections…</p> : null}
        </section>
      ) : null}

      {tab === 'stats' ? (
        <section className="ton-card">
          <h3>Network stats</h3>
          <div className="ton-meta-grid">
            <div>
              <span>TON price</span>
              <strong>{formatUsd(rates.usd, 3)}</strong>
            </div>
            <div>
              <span>24h / 7d</span>
              <strong>
                {rates.d24 || '—'} · {rates.d7 || '—'}
              </strong>
            </div>
            <div>
              <span>Masterchain seqno</span>
              <strong>{head?.seqno?.toLocaleString() || '—'}</strong>
            </div>
            <div>
              <span>Tx in head block</span>
              <strong>{head?.tx_quantity ?? '—'}</strong>
            </div>
            <div>
              <span>Indexing latency</span>
              <strong>{status?.indexing_latency ?? '—'}s</strong>
            </div>
            <div>
              <span>API</span>
              <strong>{status?.rest_online ? 'Online' : '—'}</strong>
            </div>
            <div>
              <span>Validators</span>
              <strong>{validators?.validators?.length?.toLocaleString() || '—'}</strong>
            </div>
            <div>
              <span>Total stake (nano)</span>
              <strong>{validators?.total_stake ? formatTon(validators.total_stake, 0) : '—'} TON</strong>
            </div>
          </div>
          <h4 className="ton-subh">Top validators</h4>
          <div className="ton-list">
            {(validators?.validators || []).slice(0, 12).map((v, i) => (
              <button
                key={v.address || i}
                type="button"
                className="ton-list-row"
                onClick={() => v.address && void openAddress(v.address)}
              >
                <span className="mono">{shortAddr(v.address || '—')}</span>
                <strong>{v.stake ? formatTon(v.stake, 0) : '—'} TON</strong>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {tab === 'auctions' ? (
        <section className="ton-card">
          <div className="ton-card-h">
            <h3>DNS / domain auctions</h3>
            <a href="https://tonviewer.com/auctions" target="_blank" rel="noreferrer" className="ton-btn ghost sm">
              <ExternalLink size={14} /> Tonviewer auctions
            </a>
          </div>
          <div className="ton-list">
            {auctions.map((a) => (
              <div key={a.domain} className="ton-list-row static">
                <div>
                  <strong>{a.domain}</strong>
                  <span>{a.date ? `Ends ${timeAgo(a.date)}` : ''}</span>
                </div>
                <strong>
                  {typeof a.price === 'number' || typeof a.price === 'string'
                    ? `${formatTon(a.price, 2)} TON`
                    : '—'}
                </strong>
              </div>
            ))}
            {auctions.length === 0 ? <p className="ton-muted">Loading auctions…</p> : null}
          </div>
        </section>
      ) : null}

      {tab === 'blocks' ? (
        <section className="ton-card">
          <div className="ton-card-h">
            <h3>Masterchain blocks</h3>
            <button
              type="button"
              className="ton-btn ghost sm"
              onClick={() =>
                void getRecentBlocks(12)
                  .then(setBlocks)
                  .catch((e) => setError(String(e.message || e)))
              }
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
          <div className="ton-list">
            {blocks.map((b) => (
              <a
                key={b.seqno}
                className="ton-list-row"
                href={tonviewerUrl(`block/(-1,8000000000000000,${b.seqno})`)}
                target="_blank"
                rel="noreferrer"
              >
                <div>
                  <strong>#{b.seqno.toLocaleString()}</strong>
                  <span>{b.gen_utime ? new Date(b.gen_utime * 1000).toLocaleString() : ''}</span>
                </div>
                <span>{b.tx_quantity ?? 0} txs</span>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      {tab === 'tools' ? (
        <section className="ton-card">
          <h3>Tools</h3>
          <p className="ton-muted">Address formats (bounceable / non-bounceable / raw) via TonAPI parse.</p>
          <form className="ton-tool-form" onSubmit={(e) => void handleParseAddr(e)}>
            <input
              value={toolAddr}
              onChange={(e) => setToolAddr(e.target.value)}
              placeholder="EQ… / UQ… / 0:hex"
              spellCheck={false}
              className="mono"
            />
            <button type="submit" className="ton-btn primary" disabled={busy}>
              Parse
            </button>
          </form>
          {parsedAddr ? (
            <div className="ton-detail-box">
              <div className="ton-meta-grid">
                <div>
                  <span>Raw</span>
                  <strong className="mono break">{parsedAddr.raw_form || '—'}</strong>
                </div>
                <div>
                  <span>Bounceable</span>
                  <strong className="mono break">{parsedAddr.bounceable?.b64url || '—'}</strong>
                </div>
                <div>
                  <span>Non-bounceable</span>
                  <strong className="mono break">{parsedAddr.non_bounceable?.b64url || '—'}</strong>
                </div>
                <div>
                  <span>Given type</span>
                  <strong>{parsedAddr.given_type || '—'}</strong>
                </div>
              </div>
            </div>
          ) : null}

          <div className="ton-tool-links">
            <a href="https://tonviewer.com/tools/builder" target="_blank" rel="noreferrer">
              Transaction Builder
            </a>
            <a href="https://tonviewer.com/tools/wallet" target="_blank" rel="noreferrer">
              Wallet Address Tool
            </a>
            <a href="https://tonviewer.com/tools/boc" target="_blank" rel="noreferrer">
              BoC Printer
            </a>
            <a href="https://tonviewer.com/config" target="_blank" rel="noreferrer">
              Blockchain Config
            </a>
            <a href="https://tonviewer.com/rewards" target="_blank" rel="noreferrer">
              Staking Rewards
            </a>
            <a href="https://tonviewer.com/stats" target="_blank" rel="noreferrer">
              Live Stats
            </a>
            <a href="https://tonviewer.com/last" target="_blank" rel="noreferrer">
              Last Block
            </a>
            <a href="https://tonviewer.com/transactions" target="_blank" rel="noreferrer">
              Last Transactions
            </a>
          </div>
        </section>
      ) : null}
    </div>
  )
}
