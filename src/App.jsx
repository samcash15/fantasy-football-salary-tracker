import { useEffect, useMemo, useRef, useState } from 'react';
import { COLORS } from './theme.js';
import TeamCard from './components/TeamCard.jsx';
import CompactRow from './components/CompactRow.jsx';
import SummaryStrip from './components/SummaryStrip.jsx';
import CommishPanel from './components/CommishPanel.jsx';
import AddLeague from './components/AddLeague.jsx';
import { buildValueMap, buildOwnerMap, fetchLiveRosters, recomputeTeams } from './live.js';
import { buildBoardClient, validateLeague } from './sleeperBoard.js';

const LIVE_POLL_MS = 60_000;
const BOARD_POLL_MS = 300_000;

const pinKey = (lid) => `capboard.pin.${lid}`;
const readPin = (lid) => { try { const v = localStorage.getItem(pinKey(lid)); return v == null ? null : Number(v); } catch { return null; } };
const writePin = (lid, id) => { try { if (id == null) localStorage.removeItem(pinKey(lid)); else localStorage.setItem(pinKey(lid), String(id)); } catch { /* ignore */ } };

const CUSTOM_KEY = 'capboard.customLeagues';
const readCustom = () => { try { return JSON.parse(localStorage.getItem(CUSTOM_KEY)) || []; } catch { return []; } };
const writeCustom = (arr) => { try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(arr)); } catch { /* ignore */ } };

function sortTeams(teams, sortMode, pinnedId) {
  const cmp = sortMode === 'remaining' ? (a, b) => b.remaining - a.remaining
    : sortMode === 'owner' ? (a, b) => a.owner_name.localeCompare(b.owner_name)
      : (a, b) => b.spent - a.spent;
  return [...teams].sort((a, b) => {
    const ap = a.roster_id === pinnedId, bp = b.roster_id === pinnedId;
    if (ap !== bp) return ap ? -1 : 1;
    if (a.over_cap !== b.over_cap) return a.over_cap ? -1 : 1;
    return cmp(a, b);
  });
}

export default function App() {
  const [configured, setConfigured] = useState([]);
  const [custom, setCustom] = useState(() => readCustom());
  const [selectedId, setSelectedId] = useState(null);
  const [meta, setMeta] = useState(null);
  const [teams, setTeams] = useState([]);
  const [error, setError] = useState(null);
  const [computing, setComputing] = useState(false);
  const [liveAt, setLiveAt] = useState(null);
  const [liveError, setLiveError] = useState(false);
  const [overrides, setOverrides] = useState({ overrides: [] });
  const [view, setView] = useState('compact');
  const [sortMode, setSortMode] = useState('spent');
  const [pinnedId, setPinnedId] = useState(null);
  const [, setTick] = useState(0);
  const boardRef = useRef(null);
  const mapsRef = useRef(null);

  const allLeagues = useMemo(() => {
    const extra = custom.filter((c) => !configured.some((l) => l.id === c.id)).map((c) => ({ ...c, custom: true }));
    return [...configured, ...extra];
  }, [configured, custom]);
  const isConfigured = (id) => configured.some((l) => l.id === id);

  const addCustom = (entry) => setCustom((prev) => { const next = prev.some((c) => c.id === entry.id) ? prev : [...prev, entry]; writeCustom(next); return next; });
  const removeCustom = (id) => {
    setCustom((prev) => { const next = prev.filter((c) => c.id !== id); writeCustom(next); return next; });
    if (selectedId === id) { const def = configured.find((l) => l.default) || configured[0]; setSelectedId(def ? def.id : null); }
  };

  // league index → initial selection
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}leagues.json`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`leagues.json ${r.status}`))))
      .then((idx) => {
        const list = idx.leagues || [];
        setConfigured(list);
        const param = new URLSearchParams(window.location.search).get('league');
        const initial = param || list.find((l) => l.default)?.id || list[0]?.id || readCustom()[0]?.id || null;
        if (initial) setSelectedId(initial);
      })
      .catch((e) => setError(e.message));
  }, []);

  // load selected board (static for configured, client-computed for user-entered) + live polling
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    const conf = isConfigured(selectedId);
    setError(null); setMeta(null); setTeams([]); setLiveAt(null); setLiveError(false);
    setComputing(!conf);
    boardRef.current = null; mapsRef.current = null;

    const applyBoard = (b) => {
      boardRef.current = b;
      mapsRef.current = { value: buildValueMap(b), owner: buildOwnerMap(b) };
      setMeta({ league_id: b.league_id, league_name: b.league_name, season: b.season, cap: b.cap, generated_at: b.generated_at });
      setPinnedId(readPin(b.league_id));
      if (!isConfigured(b.league_id)) addCustom({ id: b.league_id, label: b.league_name }); // persist shared links
    };
    const loadBoard = async (firstLoad) => {
      const b = conf
        ? await fetch(`${import.meta.env.BASE_URL}board.${selectedId}.json`, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(`board ${r.status}`); return r.json(); })
        : await buildBoardClient(selectedId);
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
      } catch { if (!cancelled) setLiveError(true); }
    };

    (async () => {
      try { await loadBoard(true); await pollRosters(); }
      catch (e) { if (!cancelled) setError(conf ? e.message : `Couldn’t load that league: ${e.message}`); }
      finally { if (!cancelled) setComputing(false); }
    })();

    const rosterTimer = setInterval(pollRosters, LIVE_POLL_MS);
    const boardTimer = setInterval(async () => { try { await loadBoard(false); await pollRosters(); } catch { /* keep last-good */ } }, BOARD_POLL_MS);
    return () => { cancelled = true; clearInterval(rosterTimer); clearInterval(boardTimer); };
  }, [selectedId]);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}overrides.json`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null)).then((o) => { if (o) setOverrides(o); }).catch(() => {});
  }, []);
  useEffect(() => { const id = setInterval(() => setTick((t) => t + 1), 5000); return () => clearInterval(id); }, []);

  const selectLeague = (id) => {
    setSelectedId(id);
    const u = new URL(window.location.href); u.searchParams.set('league', id); window.history.replaceState({}, '', u);
  };
  const togglePin = (rid) => { const next = pinnedId === rid ? null : rid; setPinnedId(next); if (meta) writePin(meta.league_id, next); };
  const onLookupLeague = async (rawId) => {
    const { league } = await validateLeague(rawId); // cheap check; throws on non-auction/missing
    addCustom({ id: rawId, label: league.name });
    selectLeague(rawId);
  };

  const sortedTeams = useMemo(() => sortTeams(teams, sortMode, pinnedId), [teams, sortMode, pinnedId]);
  const overCount = sortedTeams.filter((t) => t.over_cap).length;
  const rosteredPlayers = useMemo(() => {
    const seen = new Map();
    for (const t of teams) for (const p of t.players) if (!seen.has(p.sleeper_id)) seen.set(p.sleeper_id, p);
    return [...seen.values()].sort((a, b) => b.value - a.value);
  }, [teams]);
  const ago = liveAt ? relative(Date.now() - liveAt) : null;
  const selectedIsCustom = selectedId != null && !isConfigured(selectedId);

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
        .league-select, .sort-select { font-family: 'IBM Plex Sans', sans-serif; font-size: 13px; color: #F2EFE9;
          background: rgba(0,0,0,0.3); border: 1px solid rgba(242,239,233,0.2); border-radius: 6px; padding: 5px 8px; cursor: pointer; }
        .league-select:focus, .sort-select:focus { outline: 2px solid #D4A94E; }
        .seg { display: inline-flex; border: 1px solid rgba(242,239,233,0.2); border-radius: 6px; overflow: hidden; }
        .seg button { background: none; border: none; color: #B0A99F; font-size: 13px; padding: 5px 12px; cursor: pointer; }
        .seg button.active { background: rgba(212,169,78,0.15); color: #D4A94E; }
        .cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; align-items: start; }
        @media (max-width: 480px) { .compact-gauge { display: none; } }
      `}</style>

      <header className="field-lines" style={{ borderBottom: `1px solid ${COLORS.panelBorder}`, padding: '22px 20px 18px' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h1 className="display" style={{ fontSize: 40, margin: 0, lineHeight: 1 }}>THE CAP BOARD</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              {allLeagues.length > 1 ? (
                <select className="league-select" value={selectedId ?? ''} onChange={(e) => selectLeague(e.target.value)} aria-label="Select league">
                  {allLeagues.map((l) => <option key={l.id} value={l.id}>{l.label}{l.custom ? ' · custom' : ''}</option>)}
                </select>
              ) : (
                <span style={{ fontSize: 13, color: COLORS.muted }}>{meta ? meta.league_name : 'Loading…'}{meta?.season ? ` · ${meta.season}` : ''}</span>
              )}
              {selectedIsCustom && <button onClick={() => removeCustom(selectedId)} style={{ background: 'none', border: 'none', color: COLORS.faint, fontSize: 12, cursor: 'pointer' }}>✕ remove</button>}
            </div>
            <AddLeague onLookup={onLookupLeague} />
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
        {error && <div style={{ padding: 16, border: `1px solid ${COLORS.over}`, borderRadius: 8, color: COLORS.over }}>{error}</div>}
        {!error && computing && <div style={{ padding: 24, color: COLORS.faint }}>Computing board from Sleeper… <span style={{ color: COLORS.faint, opacity: 0.7 }}>(first lookup also loads the player list)</span></div>}
        {!error && !computing && !meta && !selectedId && <div style={{ padding: 24, color: COLORS.faint }}>Add a Sleeper auction league ID above to view its cap board.</div>}
        {!error && !computing && !meta && selectedId && <div style={{ padding: 24, color: COLORS.faint }}>Loading board…</div>}

        {meta && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
              <div className="seg">
                <button className={view === 'compact' ? 'active' : ''} onClick={() => setView('compact')}>Compact</button>
                <button className={view === 'detailed' ? 'active' : ''} onClick={() => setView('detailed')}>Detailed</button>
              </div>
              <label style={{ fontSize: 12, color: COLORS.faint, display: 'flex', alignItems: 'center', gap: 6 }}>
                Sort
                <select className="sort-select" value={sortMode} onChange={(e) => setSortMode(e.target.value)}>
                  <option value="spent">Cap used</option>
                  <option value="remaining">Cap space</option>
                  <option value="owner">Team name</option>
                </select>
              </label>
            </div>

            <SummaryStrip teams={sortedTeams} />

            {view === 'compact' ? (
              <div>
                {sortedTeams.map((t, i) => (
                  <CompactRow key={t.roster_id} team={t} rank={i + 1} cap={meta.cap} pinned={t.roster_id === pinnedId} onTogglePin={() => togglePin(t.roster_id)} />
                ))}
              </div>
            ) : (
              <div className="cards-grid">
                {sortedTeams.map((t) => (
                  <TeamCard key={t.roster_id} team={t} cap={meta.cap} pinned={t.roster_id === pinnedId} onTogglePin={() => togglePin(t.roster_id)} />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {meta && !selectedIsCustom && <CommishPanel players={rosteredPlayers} overrides={overrides} />}

      {meta && (
        <footer style={{ maxWidth: 1180, margin: '0 auto', padding: '4px 20px 28px', fontSize: 11, color: COLORS.faint, textAlign: 'center' }}>
          {selectedIsCustom ? 'Computed live in your browser from Sleeper' : 'Rosters update live from Sleeper'} · values as of {new Date(meta.generated_at).toLocaleString()}
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
