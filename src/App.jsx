import { useEffect, useMemo, useRef, useState } from 'react';
import { COLORS } from './theme.js';
import TeamCard from './components/TeamCard.jsx';
import { buildValueMap, buildOwnerMap, fetchLiveRosters, recomputeTeams } from './live.js';

const LIVE_POLL_MS = 60_000; // re-check Sleeper rosters every 60s (Sleeper caches ~5 min anyway)

export default function App() {
  const [board, setBoard] = useState(null);      // baseline from cron: cap/season/name + value map
  const [teams, setTeams] = useState([]);         // live-recomputed team rows
  const [error, setError] = useState(null);       // fatal (couldn't load baseline)
  const [liveAt, setLiveAt] = useState(null);     // timestamp of last successful live refresh
  const [liveError, setLiveError] = useState(false); // last live poll failed (non-fatal)
  const [, setTick] = useState(0);                // drives the "updated Xs ago" label
  const maps = useRef(null);

  // 1) Load the baseline board once (values, names, cap). Render its snapshot immediately.
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}board.json`, { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error(`board.json ${r.status}`); return r.json(); })
      .then((b) => {
        setBoard(b);
        setTeams(b.teams);
        maps.current = { value: buildValueMap(b), owner: buildOwnerMap(b) };
      })
      .catch((e) => setError(e.message));
  }, []);

  // 2) Once we have the baseline, poll Sleeper rosters live and recompute totals.
  useEffect(() => {
    if (!board) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const rosters = await fetchLiveRosters(board.league_id);
        if (cancelled) return;
        setTeams(recomputeTeams(rosters, maps.current.value, maps.current.owner, board.cap));
        setLiveAt(Date.now());
        setLiveError(false);
      } catch {
        if (!cancelled) setLiveError(true); // keep showing last-good board
      }
    };
    poll();
    const id = setInterval(poll, LIVE_POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [board]);

  // tick the relative-time label
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, []);

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
      `}</style>

      <header className="field-lines" style={{ borderBottom: `1px solid ${COLORS.panelBorder}`, padding: '22px 20px 18px' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h1 className="display" style={{ fontSize: 40, margin: 0, lineHeight: 1 }}>THE CAP BOARD</h1>
            <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 4 }}>
              {board ? board.league_name : 'Loading…'}{board?.season ? ` · ${board.season}` : ''}
            </div>
          </div>
          {board && (
            <div className="num" style={{ textAlign: 'right', fontSize: 12, color: COLORS.faint }}>
              <div>${board.cap} CAP · {sortedTeams.length} TEAMS · <span style={{ color: overCount ? COLORS.over : COLORS.faint }}>{overCount ? `${overCount} OVER` : 'ALL UNDER'}</span></div>
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
        {!error && !board && <div style={{ padding: 24, color: COLORS.faint }}>Loading board…</div>}
        {board && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>
            {sortedTeams.map((t) => <TeamCard key={t.roster_id} team={t} cap={board.cap} />)}
          </div>
        )}
      </main>

      {board && (
        <footer style={{ maxWidth: 1180, margin: '0 auto', padding: '4px 20px 28px', fontSize: 11, color: COLORS.faint, textAlign: 'center' }}>
          Rosters update live from Sleeper · player values as of {new Date(board.generated_at).toLocaleString()}
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
