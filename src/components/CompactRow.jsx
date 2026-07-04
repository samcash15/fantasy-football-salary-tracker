import { useState } from 'react';
import { COLORS, capStatus } from '../theme.js';
import CapGauge from './CapGauge.jsx';
import RosterList from './RosterList.jsx';
import PinStar from './PinStar.jsx';

// One-line team row for the compact "standings" view; click to expand the roster.
export default function CompactRow({ team, rank, cap, pinned, onTogglePin }) {
  const [open, setOpen] = useState(false);
  const status = capStatus(team.remaining, team.over_cap);
  const counted = team.players.filter((p) => !p.slot).length;

  return (
    <div style={{ border: `1px solid ${team.over_cap ? COLORS.over : COLORS.panelBorder}`, borderRadius: 8, marginBottom: 8, background: team.over_cap ? 'rgba(224,120,86,0.06)' : COLORS.panel, overflow: 'hidden' }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer' }}
      >
        <PinStar pinned={pinned} onToggle={onTogglePin} />
        <span className="num" style={{ width: 20, color: COLORS.faint, fontSize: 13, textAlign: 'right' }}>{rank}</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {team.owner_name}
          <span style={{ fontSize: 11, color: COLORS.faint, fontWeight: 400 }}> · {counted}</span>
        </span>
        <div className="compact-gauge" style={{ width: 90, flexShrink: 0 }}><CapGauge spent={team.spent} cap={cap} over={team.over_cap} /></div>
        <span className="num" style={{ width: 92, textAlign: 'right', fontSize: 15, fontWeight: 600, color: status.color, flexShrink: 0 }}>{status.label}</span>
        <span style={{ color: COLORS.faint, fontSize: 11, width: 12, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▸</span>
      </div>
      {open && <RosterList team={team} />}
    </div>
  );
}
