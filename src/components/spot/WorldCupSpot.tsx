import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  ExternalLink,
  Loader2,
  PlayCircle,
  Radio,
  RefreshCw,
  Trophy,
  Tv2,
  Video,
} from 'lucide-react'
import {
  loadWorldCupSpot,
  OFFICIAL_REGIONS,
  OFFICIAL_WATCH,
  type SpotBundle,
  type WcMatch,
} from '../../lib/worldCupApi'
import './WorldCupSpot.css'

function formatKickoff(iso?: string) {
  if (!iso) return 'TBD'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function ScoreCard({ match, featured }: { match: WcMatch; featured?: boolean }) {
  return (
    <article className={`wc-card ${featured ? 'featured' : ''} status-${match.status}`}>
      <div className="wc-card-top">
        <span className={`wc-badge ${match.status}`}>{match.statusText}</span>
        <span className="wc-source">{match.source}</span>
      </div>
      <div className="wc-teams">
        <div className="wc-team">
          <strong>{match.home}</strong>
          <span className="wc-score">{match.homeScore ?? '—'}</span>
        </div>
        <div className="wc-vs">vs</div>
        <div className="wc-team away">
          <strong>{match.away}</strong>
          <span className="wc-score">{match.awayScore ?? '—'}</span>
        </div>
      </div>
      <div className="wc-meta">
        <span>{formatKickoff(match.kickoff)}</span>
        {match.venue && <span>{match.venue}</span>}
      </div>
    </article>
  )
}

export function WorldCupSpot() {
  const [data, setData] = useState<SpotBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeVideo, setActiveVideo] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [region, setRegion] = useState<(typeof OFFICIAL_REGIONS)[number]>('All')

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const bundle = await loadWorldCupSpot()
      setData(bundle)
      const anyOk = bundle.sources.some((s) => s.ok)
      if (!anyOk) {
        setError('All live data sources failed. Showing official watch links only — try Refresh.')
      }
      setActiveVideo((prev) => prev || bundle.highlights[0]?.videoId || null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load World Cup Spot')
      // keep previous data if any — never hard-crash the workspace
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => {
      setTick((t) => t + 1)
      void refresh(true)
    }, 45000)
    return () => window.clearInterval(id)
  }, [refresh])

  const live = data?.live || []
  const upcoming = data?.upcoming || []
  const recent = data?.recent || []
  const standings = data?.standings || []
  const highlights = data?.highlights || []
  const officialList =
    region === 'All' ? OFFICIAL_WATCH : OFFICIAL_WATCH.filter((o) => o.region === region)

  return (
    <div className="wc-spot">
      <div className="wc-hero">
        <div>
          <div className="wc-kicker">
            <Trophy size={14} /> WP 02 · Spot · FIFA World Cup 2026
          </div>
          <h2>World Cup Live Spot</h2>
          <p>
            Multi-source live scores, fixtures, table &amp; official highlights. Auto-refreshes.
            Full match TV rights stay with official broadcasters — no pirate streams.
          </p>
        </div>
        <div className="wc-hero-actions">
          <button className="btn primary" type="button" onClick={() => void refresh()} disabled={loading}>
            {loading ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
            Refresh
          </button>
          {data?.fetchedAt && (
            <span className="wc-updated">
              Updated {new Date(data.fetchedAt).toLocaleTimeString()} · #{tick}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="alert error wc-alert">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {loading && !data && (
        <div className="tg-center">
          <Loader2 className="spin" size={28} />
          <p>Loading World Cup data from free APIs…</p>
        </div>
      )}

      {data && (
        <>
          <section className="wc-section">
            <div className="wc-section-head">
              <h3>
                <Radio size={16} /> Live now
              </h3>
            </div>
            {live.length === 0 ? (
              <div className="wc-empty">No live World Cup match right now. Check upcoming below.</div>
            ) : (
              <div className="wc-grid">
                {live.map((m) => (
                  <ScoreCard key={m.id} match={m} featured />
                ))}
              </div>
            )}
          </section>

          <div className="wc-split">
            <section className="wc-section">
              <div className="wc-section-head">
                <h3>
                  <Tv2 size={16} /> Upcoming
                </h3>
              </div>
              {upcoming.length === 0 ? (
                <div className="wc-empty">No upcoming fixtures from sources.</div>
              ) : (
                <div className="wc-stack">
                  {upcoming.slice(0, 8).map((m) => (
                    <ScoreCard key={m.id} match={m} />
                  ))}
                </div>
              )}
            </section>

            <section className="wc-section">
              <div className="wc-section-head">
                <h3>
                  <Trophy size={16} /> Recent results
                </h3>
              </div>
              {recent.length === 0 ? (
                <div className="wc-empty">No recent results yet.</div>
              ) : (
                <div className="wc-stack">
                  {recent.slice(0, 8).map((m) => (
                    <ScoreCard key={m.id} match={m} />
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="wc-section">
            <div className="wc-section-head">
              <h3>
                <Video size={16} /> Highlights &amp; free video
              </h3>
            </div>
            <div className="wc-video-layout">
              <div className="wc-player">
                {activeVideo ? (
                  <iframe
                    title="World Cup highlight"
                    src={`https://www.youtube.com/embed/${activeVideo}?rel=0`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                ) : (
                  <div className="wc-player-empty">
                    <PlayCircle size={36} />
                    <p>Select a highlight, or open official free watch links below.</p>
                  </div>
                )}
              </div>
              <div className="wc-video-list">
                {highlights.length === 0 && (
                  <div className="wc-empty">No highlight links from API yet. Use official FIFA links.</div>
                )}
                {highlights.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    className={`wc-video-item ${activeVideo === h.videoId ? 'is-active' : ''}`}
                    onClick={() => setActiveVideo(h.videoId)}
                  >
                    <PlayCircle size={16} />
                    <span>{h.title}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="wc-section">
            <div className="wc-section-head">
              <h3>
                <ExternalLink size={16} /> Official free sources ({OFFICIAL_WATCH.length})
              </h3>
            </div>
            <p className="wc-official-note">
              Researched from FIFA / public broadcasters. Viral X “free stream” lists mix{' '}
              <strong>pirate sites</strong> (Footybite, Koralive, Vipbox, etc.) — those are blocked here.
              Only official / public free platforms. Rights differ by country.
            </p>
            <div className="wc-region-bar">
              {OFFICIAL_REGIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`wc-region-chip ${region === r ? 'is-on' : ''}`}
                  onClick={() => setRegion(r)}
                >
                  {r}
                </button>
              ))}
            </div>
            <div className="wc-official-grid">
              {officialList.map((o) => (
                <a key={o.url} className="wc-official" href={o.url} target="_blank" rel="noreferrer">
                  <div className="wc-official-top">
                    <strong>{o.name}</strong>
                    <span className="wc-region-tag">{o.region}</span>
                  </div>
                  <em className={`wc-free-tag ${o.free}`}>{o.free.split('_').join(' ')}</em>
                  <span>{o.note}</span>
                </a>
              ))}
              {officialList.length === 0 && (
                <div className="wc-empty">No sources for this region filter.</div>
              )}
            </div>
          </section>

          <section className="wc-section">
            <div className="wc-section-head">
              <h3>
                <Trophy size={16} /> Table / standings
              </h3>
            </div>
            {standings.length === 0 ? (
              <div className="wc-empty">Standings unavailable from source right now.</div>
            ) : (
              <div className="wc-table-wrap">
                <table className="wc-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Team</th>
                      <th>P</th>
                      <th>W</th>
                      <th>D</th>
                      <th>L</th>
                      <th>GD</th>
                      <th>Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((r) => (
                      <tr key={`${r.rank}-${r.team}`}>
                        <td>{r.rank}</td>
                        <td className="team">
                          {r.badge && <img src={r.badge} alt="" width={18} height={18} />}
                          {r.team}
                        </td>
                        <td>{r.played}</td>
                        <td>{r.win}</td>
                        <td>{r.draw}</td>
                        <td>{r.loss}</td>
                        <td>{r.gd}</td>
                        <td>
                          <strong>{r.points}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="wc-section">
            <div className="wc-section-head">
              <h3>Data sources health</h3>
            </div>
            <div className="wc-sources">
              {data.sources.map((s) => (
                <div key={s.name} className={`wc-source-pill ${s.ok ? 'ok' : 'bad'}`}>
                  <span>{s.ok ? '●' : '○'}</span>
                  <strong>{s.name}</strong>
                  <em>{s.detail}</em>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
