import { COLORS, capStatus } from '../theme.js';
import CapGauge from './CapGauge.jsx';
import RosterList from './RosterList.jsx';
import PinStar from './PinStar.jsx';

export default function TeamCard({ team, cap, pinned, onTogglePin }) {
  const over = team.over_cap;
  const status = capStatus(team.remaining, over);
  const counted = team.players.filter((p) => !p.slot).length;
  const exemptCount = team.players.length - counted;

  return (
    <div
      style={{
        background: over ? 'rgba(224,120,86,0.06)' : COLORS.panel,
        border: `1px solid ${over ? COLORS.over : COLORS.panelBorder}`,
        borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{ padding: '14px 12px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            <PinStar pinned={pinned} onToggle={onTogglePin} />
            <span style={{ fontSize: 17, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team.owner_name}</span>
          </span>
          <span className="num" style={{ fontSize: 15, fontWeight: 600, color: status.color, flexShrink: 0 }}>{status.label}</span>
        </div>
        <div style={{ margin: '10px 0 6px' }}>
          <CapGauge spent={team.spent} cap={cap} over={over} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: COLORS.faint }}>
          <span className="num">${team.spent} / ${cap}</span>
          <span>{counted} players{exemptCount ? ` · +${exemptCount} taxi/IR` : ''}</span>
        </div>
      </div>
      <RosterList team={team} />
    </div>
  );
}
