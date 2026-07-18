/** Multi-source FIFA World Cup data (legal scores/fixtures/highlights). No pirate streams. */

const TSDB = 'https://www.thesportsdb.com/api/v1/json/3'
const WC_LEAGUE_ID = '4429'
const ESPN_SCOREBOARD =
  'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard'

export type MatchStatus = 'live' | 'scheduled' | 'finished' | 'unknown'

export type WcMatch = {
  id: string
  title: string
  home: string
  away: string
  homeScore: string | null
  awayScore: string | null
  status: MatchStatus
  statusText: string
  kickoff?: string
  venue?: string
  thumb?: string
  videoUrl?: string
  source: 'espn' | 'thesportsdb'
}

export type WcStanding = {
  rank: number
  team: string
  played: number
  win: number
  draw: number
  loss: number
  gf: number
  ga: number
  gd: number
  points: number
  badge?: string
}

export type WcHighlight = {
  id: string
  title: string
  videoId: string
  thumb?: string
  date?: string
}

export type SpotBundle = {
  live: WcMatch[]
  upcoming: WcMatch[]
  recent: WcMatch[]
  standings: WcStanding[]
  highlights: WcHighlight[]
  sources: { name: string; ok: boolean; detail?: string }[]
  fetchedAt: number
}

function youtubeId(url?: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1) || null
    if (u.searchParams.get('v')) return u.searchParams.get('v')
    const m = url.match(/(?:embed\/|v\/|watch\?v=)([\w-]{6,})/)
    return m?.[1] || null
  } catch {
    const m = String(url).match(/(?:youtu\.be\/|v=)([\w-]{6,})/)
    return m?.[1] || null
  }
}

function mapStatus(raw?: string | null, progress?: string | null): { status: MatchStatus; text: string } {
  const s = (raw || '').toUpperCase()
  const p = (progress || '').toLowerCase()
  if (s === 'LIVE' || s === 'IN' || s === '1H' || s === '2H' || s === 'HT' || p.includes("'") || p === 'live') {
    return { status: 'live', text: progress || raw || 'LIVE' }
  }
  if (s === 'FT' || s === 'AET' || s === 'PEN' || s === 'FULL TIME' || s === 'STATUS_FINAL') {
    return { status: 'finished', text: raw || 'FT' }
  }
  if (s === 'NS' || s === 'TBD' || s === 'SCHEDULED' || s === 'STATUS_SCHEDULED' || s === 'PRE') {
    return { status: 'scheduled', text: raw || 'Scheduled' }
  }
  if (!s) return { status: 'unknown', text: '—' }
  return { status: 'unknown', text: raw || '—' }
}

async function fetchJson<T>(url: string, timeoutMs = 12000): Promise<T> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(t)
  }
}

type TsdbEvent = {
  idEvent?: string
  strEvent?: string
  strHomeTeam?: string
  strAwayTeam?: string
  intHomeScore?: string | null
  intAwayScore?: string | null
  strStatus?: string
  strProgress?: string
  strTimestamp?: string
  dateEvent?: string
  strTime?: string
  strVenue?: string
  strThumb?: string
  strVideo?: string
}

function fromTsdb(e: TsdbEvent): WcMatch {
  const st = mapStatus(e.strStatus, e.strProgress)
  const kick =
    e.strTimestamp ||
    (e.dateEvent && e.strTime ? `${e.dateEvent}T${e.strTime}` : e.dateEvent) ||
    undefined
  return {
    id: `tsdb-${e.idEvent || e.strEvent}`,
    title: e.strEvent || `${e.strHomeTeam} vs ${e.strAwayTeam}`,
    home: e.strHomeTeam || 'Home',
    away: e.strAwayTeam || 'Away',
    homeScore: e.intHomeScore ?? null,
    awayScore: e.intAwayScore ?? null,
    status: st.status,
    statusText: st.text,
    kickoff: kick,
    venue: e.strVenue || undefined,
    thumb: e.strThumb || undefined,
    videoUrl: e.strVideo || undefined,
    source: 'thesportsdb',
  }
}

async function loadTsdbNext(): Promise<WcMatch[]> {
  const data = await fetchJson<{ events: TsdbEvent[] | null }>(
    `${TSDB}/eventsnextleague.php?id=${WC_LEAGUE_ID}`,
  )
  return (data.events || []).map(fromTsdb)
}

async function loadTsdbPast(): Promise<WcMatch[]> {
  const data = await fetchJson<{ events: TsdbEvent[] | null }>(
    `${TSDB}/eventspastleague.php?id=${WC_LEAGUE_ID}`,
  )
  return (data.events || []).map(fromTsdb)
}

async function loadTsdbTable(): Promise<WcStanding[]> {
  const data = await fetchJson<{
    table: {
      intRank?: string
      strTeam?: string
      intPlayed?: string
      intWin?: string
      intDraw?: string
      intLoss?: string
      intGoalsFor?: string
      intGoalsAgainst?: string
      intGoalDifference?: string
      intPoints?: string
      strBadge?: string
    }[] | null
  }>(`${TSDB}/lookuptable.php?l=${WC_LEAGUE_ID}`)

  return (data.table || []).map((r) => ({
    rank: Number(r.intRank) || 0,
    team: r.strTeam || 'Team',
    played: Number(r.intPlayed) || 0,
    win: Number(r.intWin) || 0,
    draw: Number(r.intDraw) || 0,
    loss: Number(r.intLoss) || 0,
    gf: Number(r.intGoalsFor) || 0,
    ga: Number(r.intGoalsAgainst) || 0,
    gd: Number(r.intGoalDifference) || 0,
    points: Number(r.intPoints) || 0,
    badge: r.strBadge || undefined,
  }))
}

type EspnEvent = {
  id?: string
  name?: string
  date?: string
  status?: { type?: { name?: string; state?: string; description?: string; shortDetail?: string; detail?: string } }
  competitions?: {
    venue?: { fullName?: string }
    competitors?: {
      homeAway?: string
      score?: string
      team?: { displayName?: string; shortDisplayName?: string; logo?: string }
    }[]
  }[]
}

async function loadEspn(): Promise<WcMatch[]> {
  const data = await fetchJson<{ events: EspnEvent[] }>(ESPN_SCOREBOARD)
  return (data.events || []).map((e) => {
    const comp = e.competitions?.[0]
    const home = comp?.competitors?.find((c) => c.homeAway === 'home')
    const away = comp?.competitors?.find((c) => c.homeAway === 'away')
    const state = (e.status?.type?.state || '').toLowerCase()
    const name = e.status?.type?.name || ''
    let status: MatchStatus = 'unknown'
    if (state === 'in' || name === 'STATUS_IN_PROGRESS' || name === 'STATUS_HALFTIME') status = 'live'
    else if (state === 'post' || name === 'STATUS_FINAL') status = 'finished'
    else if (state === 'pre' || name === 'STATUS_SCHEDULED') status = 'scheduled'

    return {
      id: `espn-${e.id || e.name}`,
      title: e.name || `${home?.team?.displayName} vs ${away?.team?.displayName}`,
      home: home?.team?.displayName || 'Home',
      away: away?.team?.displayName || 'Away',
      homeScore: home?.score ?? null,
      awayScore: away?.score ?? null,
      status,
      statusText: e.status?.type?.shortDetail || e.status?.type?.description || e.status?.type?.detail || '—',
      kickoff: e.date,
      venue: comp?.venue?.fullName,
      thumb: home?.team?.logo || away?.team?.logo,
      source: 'espn' as const,
    }
  })
}

function mergeMatches(primary: WcMatch[], secondary: WcMatch[]): WcMatch[] {
  const map = new Map<string, WcMatch>()
  const keyOf = (m: WcMatch) =>
    `${m.home.toLowerCase().slice(0, 12)}|${m.away.toLowerCase().slice(0, 12)}|${(m.kickoff || '').slice(0, 10)}`

  for (const m of [...primary, ...secondary]) {
    const k = keyOf(m)
    const prev = map.get(k)
    if (!prev) {
      map.set(k, m)
      continue
    }
    // Prefer live + scores from ESPN; keep video from TSDB
    map.set(k, {
      ...prev,
      ...m,
      homeScore: m.homeScore ?? prev.homeScore,
      awayScore: m.awayScore ?? prev.awayScore,
      status: m.status === 'live' || prev.status === 'live' ? 'live' : m.status !== 'unknown' ? m.status : prev.status,
      statusText: m.status === 'live' ? m.statusText : m.statusText || prev.statusText,
      videoUrl: prev.videoUrl || m.videoUrl,
      thumb: m.thumb || prev.thumb,
      venue: m.venue || prev.venue,
    })
  }
  return [...map.values()]
}

export async function loadWorldCupSpot(): Promise<SpotBundle> {
  const sources: SpotBundle['sources'] = []
  let espn: WcMatch[] = []
  let next: WcMatch[] = []
  let past: WcMatch[] = []
  let standings: WcStanding[] = []

  const tasks = await Promise.allSettled([
    loadEspn(),
    loadTsdbNext(),
    loadTsdbPast(),
    loadTsdbTable(),
  ])

  if (tasks[0].status === 'fulfilled') {
    espn = tasks[0].value
    sources.push({ name: 'ESPN Scoreboard', ok: true, detail: `${espn.length} match(es)` })
  } else {
    sources.push({
      name: 'ESPN Scoreboard',
      ok: false,
      detail: tasks[0].reason instanceof Error ? tasks[0].reason.message : 'Failed',
    })
  }

  if (tasks[1].status === 'fulfilled') {
    next = tasks[1].value
    sources.push({ name: 'TheSportsDB Upcoming', ok: true, detail: `${next.length} match(es)` })
  } else {
    sources.push({
      name: 'TheSportsDB Upcoming',
      ok: false,
      detail: tasks[1].reason instanceof Error ? tasks[1].reason.message : 'Failed',
    })
  }

  if (tasks[2].status === 'fulfilled') {
    past = tasks[2].value
    sources.push({ name: 'TheSportsDB Results', ok: true, detail: `${past.length} match(es)` })
  } else {
    sources.push({
      name: 'TheSportsDB Results',
      ok: false,
      detail: tasks[2].reason instanceof Error ? tasks[2].reason.message : 'Failed',
    })
  }

  if (tasks[3].status === 'fulfilled') {
    standings = tasks[3].value
    sources.push({ name: 'TheSportsDB Table', ok: true, detail: `${standings.length} teams` })
  } else {
    sources.push({
      name: 'TheSportsDB Table',
      ok: false,
      detail: tasks[3].reason instanceof Error ? tasks[3].reason.message : 'Failed',
    })
  }

  const mergedUpcoming = mergeMatches(
    espn.filter((m) => m.status === 'scheduled' || m.status === 'live' || m.status === 'unknown'),
    next,
  )
  const live = [
    ...espn.filter((m) => m.status === 'live'),
    ...mergedUpcoming.filter((m) => m.status === 'live'),
  ]
  // unique live
  const liveMap = new Map(live.map((m) => [m.id, m]))
  const liveUnique = [...liveMap.values()]

  const upcoming = mergedUpcoming
    .filter((m) => m.status === 'scheduled' || m.status === 'unknown')
    .sort((a, b) => String(a.kickoff || '').localeCompare(String(b.kickoff || '')))

  const recent = past
    .filter((m) => m.status === 'finished' || m.homeScore != null)
    .slice(0, 12)

  const highlights: WcHighlight[] = []
  for (const m of [...past, ...next]) {
    const vid = youtubeId(m.videoUrl)
    if (!vid) continue
    if (highlights.some((h) => h.videoId === vid)) continue
    highlights.push({
      id: m.id,
      title: m.title,
      videoId: vid,
      thumb: m.thumb,
      date: m.kickoff,
    })
  }

  // Always include official FIFA YouTube free content (no illegal streams)
  if (!highlights.length) {
    // FIFA channel sample / World Cup related official content placeholder not hard-coded broken IDs
  }

  return {
    live: liveUnique,
    upcoming,
    recent,
    standings,
    highlights,
    sources,
    fetchedAt: Date.now(),
  }
}

export const OFFICIAL_WATCH = [
  {
    name: 'FIFA+ (official free)',
    url: 'https://www.fifa.com/fifaplus',
    note: 'Legal free highlights & select coverage',
  },
  {
    name: 'FIFA YouTube',
    url: 'https://www.youtube.com/@FIFA',
    note: 'Official highlights & live events when available',
  },
  {
    name: 'YouTube Sports',
    url: 'https://www.youtube.com/results?search_query=FIFA+World+Cup+official+highlights',
    note: 'Search official highlight uploads',
  },
] as const
