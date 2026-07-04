import { useState } from 'react';
import { COLORS } from '../theme.js';
import PlayerRow from './PlayerRow.jsx';

// Shared roster renderer (used by both the detailed cards and expanded compact rows).
// Expensive players lead; $1 minimum-bid bench is collapsed; taxi/IR shown dimmed + uncounted.
export default function RosterList({ team }) {
  const [showMins, setShowMins] = useState(false);
  const counted = team.players.filter((p) => !p.slot);
  const exempt = team.players.filter((p) => p.slot);
  const bigs = counted.filter((p) => p.value > 1);
  const mins = counted.filter((p) => p.value <= 1);

  return (
    <div>
      {bigs.map((p) => <PlayerRow key={p.sleeper_id} player={p} />)}

      {mins.length > 0 && (
        showMins ? (
          mins.map((p) => <PlayerRow key={p.sleeper_id} player={p} />)
        ) : (
          <button
            onClick={() => setShowMins(true)}
            style={{ width: '100%', textAlign: 'left', padding: '7px 12px', fontSize: 12, color: COLORS.faint, background: 'none', border: 'none', borderTop: `1px solid ${COLORS.hairline}`, cursor: 'pointer' }}
          >
            + {mins.length} minimum-value {mins.length === 1 ? 'player' : 'players'} (${mins.reduce((s, p) => s + p.value, 0)}) — show
          </button>
        )
      )}

      {exempt.length > 0 && (
        <>
          <div style={{ padding: '5px 12px', fontSize: 10, letterSpacing: '0.06em', color: COLORS.faint, borderTop: `1px solid ${COLORS.panelBorder}`, background: 'rgba(0,0,0,0.15)' }}>
            TAXI / IR · NOT COUNTED
          </div>
          {exempt.map((p) => <PlayerRow key={p.sleeper_id} player={p} dim />)}
        </>
      )}
    </div>
  );
}
