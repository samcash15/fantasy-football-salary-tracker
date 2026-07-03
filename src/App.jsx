import { useEffect, useMemo, useState } from 'react';
import { COLORS } from './theme.js';
import TeamCard from './components/TeamCard.jsx';

export default function App() {
  const [board, setBoard] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}board.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`board.json ${r.status}`);
        return r.json();
      })
      .then(setBoard)
      .catch((e) => setError(e.message));
  }, []);

  const teams = useMemo(
    () => (board?.teams ? [...board.teams].sort((a, b) => b.spent - a.spent) : []),
    [board]
  );
  const overCount = teams.filter((t) => t.over_cap).length;

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, color: COLORS.text, fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        .num { font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }
        .display { font-family: 'Bebas Neue', 'IBM Plex Sans', sans-serif; letter-spacing: 0.02em; }
        .field-lines {
          background-image: repeating-linear-gradient(90deg,
            rgba(242,239,233,0.035) 0px, rgba(242,239,233,0.035) 1px,
            transparent 1px, transparent 64px);
        }
      `}</style>

      <header className="field-lines" style={{ borderBottom: `1px solid ${COLORS.panelBorder}`, padding: '22px 20px 18px' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h1 className="display" style={{ fontSize: 40, margin: 0, lineHeight: 1 }}>THE CAP BOARD</h1>
            <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 4 }}>
              {board ? board.league_name : 'Loading…'}
              {board?.season ? ` · ${board.season}` : ''}
            </div>
          </div>
          {board && (
            <div className="num" style={{ textAlign: 'right', fontSize: 12, color: COLORS.faint }}>
              <div>${board.cap} CAP · {teams.length} TEAMS</div>
              <div style={{ color: overCount ? COLORS.over : COLORS.faint }}>
                {overCount ? `${overCount} OVER CAP` : 'ALL UNDER CAP'}
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
        {!error && !board && (
          <div style={{ padding: 24, color: COLORS.faint }}>Loading board…</div>
        )}
        {board && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 16, alignItems: 'start',
            }}
          >
            {teams.map((t) => (
              <TeamCard key={t.roster_id} team={t} cap={board.cap} />
            ))}
          </div>
        )}
      </main>

      {board && (
        <footer style={{ maxWidth: 1180, margin: '0 auto', padding: '4px 20px 28px', fontSize: 11, color: COLORS.faint, textAlign: 'center' }}>
          Read-only · values are running-max acquisition cost from Sleeper ·
          {' '}generated {new Date(board.generated_at).toLocaleString()}
        </footer>
      )}
    </div>
  );
}
