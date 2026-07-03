import { COLORS } from '../theme.js';
import CapGauge from './CapGauge.jsx';
import PlayerRow from './PlayerRow.jsx';

export default function TeamCard({ team, cap }) {
  const over = team.over_cap;
  const counted = team.players.filter((p) => !p.slot);
  const exempt = team.players.filter((p) => p.slot);
  return (
    <div
      style={{
        background: COLORS.panel,
        border: `1px solid ${over ? COLORS.over : COLORS.panelBorder}`,
        borderRadius: 10, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{ padding: '14px 12px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 17, fontWeight: 600 }}>{team.owner_name}</span>
          <span
            className="num"
            style={{ fontSize: 15, fontWeight: 600, color: over ? COLORS.over : COLORS.gold }}
          >
            {over ? `-$${Math.abs(team.remaining)} OVER` : `$${team.remaining} LEFT`}
          </span>
        </div>
        <div style={{ margin: '10px 0 6px' }}>
          <CapGauge spent={team.spent} cap={cap} over={over} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: COLORS.faint }}>
          <span className="num">${team.spent} / ${cap}</span>
          <span>{counted.length} players{exempt.length ? ` · +${exempt.length} taxi/IR` : ''}</span>
        </div>
      </div>
      <div>
        {counted.map((p) => (
          <PlayerRow key={p.sleeper_id} player={p} />
        ))}
        {exempt.length > 0 && (
          <>
            <div style={{ padding: '5px 12px', fontSize: 10, letterSpacing: '0.06em', color: COLORS.faint, borderTop: `1px solid ${COLORS.panelBorder}`, background: 'rgba(0,0,0,0.15)' }}>
              TAXI / IR · NOT COUNTED
            </div>
            {exempt.map((p) => (
              <PlayerRow key={p.sleeper_id} player={p} dim />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
