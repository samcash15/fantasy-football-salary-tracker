import { useEffect, useMemo, useRef, useState } from 'react';
import { COLORS } from './theme.js';
import TeamCard from './components/TeamCard.jsx';
import CommishPanel from './components/CommishPanel.jsx';
import { buildValueMap, buildOwnerMap, fetchLiveRosters, recomputeTeams } from './live.js';

const LIVE_POLL_MS = 60_000;    // re-check Sleeper rosters every 60s (live drops/moves)
const BOARD_POLL_MS = 300_000;  // re-fetch the board every 5 min (picks up cron value updates)

export default function App() {
  const [leagues, setLeagues] = useState([]);     // index from public/leagues.json
  const [selectedId, setSelectedId] = useState(null);
  const [meta, setMeta] = useState(null);         // cap/season/name/generated_at for header + footer
  const [teams, setTeams] = useState([]);         // live-recomputed rows
  const [error, setError] = useState(null);
  const [liveAt, setLiveAt] = useState(null);
  const [liveError, setLiveError] = useState(false);
  const [overrides, setOverrides] = useState({ overrides: [] });
  const [, setTick] = useState(0);
  const boardRef = useRef(null);
  const mapsRef = useRef(null);

  // 1) Load the league index once; pick the initial league (URL ?league=, else default, else first).
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}leagues.json`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`leagues.json ${r.status}`))))
      .then((idx) => {
        const list = idx.leagues || [];
        setLeagues(list);
        const param = new URLSearchParams(window.location.search).get('league');
        const initial = list.find((l) => l.id === param) || list.find((l) => l.default) || list[0];
        if (initial) setSelectedId(initial.id);
        else setError('No leagues configured');
      })
      .catch((e) => setError(e.message));
  }, []);

  // 2) When the selected league changes, load that board and (re)start the live polling.
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setError(null); setMeta(null); setTeams([]); setLiveAt(null); setLiveError(false);
    boardRef.current = null; mapsRef.current = null;

    const applyBoard = (b) => {
      boardRef.current = b;
      mapsRef.current = { value: buildValueMap(b), owner: buildOwnerMap(b) };
      setMeta({ league_id: b.league_id, league_name: b.league_name, season: b.season, cap: b.cap, generated_at: b.generated_at });
    };
    const loadBoard = async (firstLoad) => {
      const r = await fetch(`${import.meta.env.BASE_URL}board.${selectedId}.json`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`board ${r.status}`);
      const b = await r.json();
      if (cancelled) return;
      applyBoard(b);
      if (firstLoad) setTeams(b.teams);
    };
    const pollRosters = async () => {
      const b = boardRef.current;
      if (!b || cancelled) return;
      try {
        const rosters = await fetchLiveRosters(b.league_id);
        if (cancelled) return;
        setTeams(recomputeTeams(rosters, mapsRef.current.value, mapsRef.current.owner, b.cap));
        setLiveAt(Date.now()); setLiveError(false);
      } catch {
        if (!cancelled) setLiveError(true);
      }
    };

    (async () => {
      try { await loadBoard(true); await pollRosters(); }
      catch (e) { if (!cancelled) setError(e.message); }
    })();

    const rosterTimer = setInterval(pollRosters, LIVE_POLL_MS);
    const boardTimer = setInterval(async () => { try { await loadBoard(false); await pollRosters(); } catch { /* keep last-good */ } }, BOARD_POLL_MS);
    return () => { cancelled = true; clearInterval(rosterTimer); clearInterval(boardTimer); };
  }, [selectedId]);

  // current overrides (for the commissioner panel); best-effort
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}overrides.json`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((o) => { if (o) setOverrides(o); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, []);

  // unique rostered players (for the commissioner picker)
  const rosteredPlayers = useMemo(() => {
    const seen = new Map();
    for (const t of teams) for (const p of t.players) if (!seen.has(p.sleeper_id)) seen.set(p.sleeper_id, p);
    return [...seen.values()].sort((a, b) => b.value - a.value);
  }, [teams]);

  const selectLeague = (id) => {
    setSelectedId(id);
    const u = new URL(window.location.href);
    u.searchParams.set('league', id);
    window.history.replaceState({}, '', u);
  };

  const sortedTeams = useMemo(() => [...teams].sort((a, b) => b.spent - a.spent), [teams]);
  const overCount = sortedTeams.filter((t) => t.over_cap).length;
  const ago = liveAt ? relative(Date.now() - liveAt) : null;

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, color: COLORS.text, fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        .num { font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }
        .display { font-family: 'Bebas Neue', 'IBM Plex Sans', sans-serif; letter-spacing: 0.02em; }
        .field-lines { background-image: repeating-linear-gradient(90deg,
          rgba(242,239,233,0.035) 0px, rgba(242,239,233,0.035) 1px, transparent 1px, transparent 64px); }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
        .livedot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; animation: pulse 1.8s ease-in-out infinite; }
        .league-select { font-family: 'IBM Plex Sans', sans-serif; font-size: 13px; color: #F2EFE9;
          background: rgba(0,0,0,0.3); border: 1px solid rgba(242,239,233,0.2); border-radius: 6px;
          padding: 4px 8px; margin-top: 6px; cursor: pointer; }
        .league-select:focus { outline: 2px solid #D4A94E; }
      `}</style>

      <header className="field-lines" style={{ borderBottom: `1px solid ${COLORS.panelBorder}`, padding: '22px 20px 18px' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h1 className="display" style={{ fontSize: 40, margin: 0, lineHeight: 1 }}>THE CAP BOARD</h1>
            {leagues.length > 1 ? (
              <select className="league-select" value={selectedId ?? ''} onChange={(e) => selectLeague(e.target.value)} aria-label="Select league">
                {leagues.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
            ) : (
              <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 4 }}>
                {meta ? meta.league_name : 'Loading…'}{meta?.season ? ` · ${meta.season}` : ''}
              </div>
            )}
          </div>
          {meta && (
            <div className="num" style={{ textAlign: 'right', fontSize: 12, color: COLORS.faint }}>
              <div>${meta.cap} CAP · {sortedTeams.length} TEAMS · <span style={{ color: overCount ? COLORS.over : COLORS.faint }}>{overCount ? `${overCount} OVER` : 'ALL UNDER'}</span></div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center', marginTop: 3 }}>
                <span className="livedot" style={{ background: liveError ? COLORS.over : COLORS.green }} />
                {liveError ? 'RECONNECTING…' : ago ? `LIVE · UPDATED ${ago}` : 'CONNECTING…'}
              </div>
            </div>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 1180, margin: '0 auto', padding: 20 }}>
        {error && (
          <div style={{ padding: 16, border: `1px solid ${COLORS.over}`, borderRadius: 8, color: COLORS.over }}>
            Couldn’t load the board: {error}
          </div>
        )}
        {!error && !meta && <div style={{ padding: 24, color: COLORS.faint }}>Loading board…</div>}
        {meta && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>
            {sortedTeams.map((t) => <TeamCard key={t.roster_id} team={t} cap={meta.cap} />)}
          </div>
        )}
      </main>

      {meta && <CommishPanel players={rosteredPlayers} overrides={overrides} />}

      {meta && (
        <footer style={{ maxWidth: 1180, margin: '0 auto', padding: '4px 20px 28px', fontSize: 11, color: COLORS.faint, textAlign: 'center' }}>
          Rosters update live from Sleeper · player values as of {new Date(meta.generated_at).toLocaleString()}
        </footer>
      )}
    </div>
  );
}

function relative(ms) {
  const s = Math.round(ms / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
}
