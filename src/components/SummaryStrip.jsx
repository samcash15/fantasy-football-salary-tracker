import { COLORS } from '../theme.js';

// At-a-glance league summary: over count, tightest legal team, most cap room.
export default function SummaryStrip({ teams }) {
  if (!teams.length) return null;
  const over = teams.filter((t) => t.over_cap);
  const legal = teams.filter((t) => !t.over_cap);
  const tightest = legal.length ? legal.reduce((m, t) => (t.remaining < m.remaining ? t : m)) : null;
  const mostRoom = legal.length ? legal.reduce((m, t) => (t.remaining > m.remaining ? t : m)) : null;

  const Chip = ({ label, value, color }) => (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'baseline', padding: '4px 10px', borderRadius: 6, background: COLORS.panel, border: `1px solid ${COLORS.panelBorder}` }}>
      <span style={{ fontSize: 10, letterSpacing: '0.06em', color: COLORS.faint }}>{label}</span>
      <span className="num" style={{ fontSize: 13, color: color || COLORS.text }}>{value}</span>
    </span>
  );

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
      <Chip label="OVER CAP" value={over.length} color={over.length ? COLORS.over : COLORS.green} />
      {mostRoom && <Chip label="MOST ROOM" value={`${mostRoom.owner_name} · $${mostRoom.remaining}`} color={COLORS.green} />}
      {tightest && <Chip label="TIGHTEST" value={`${tightest.owner_name} · $${tightest.remaining}`} color={COLORS.gold} />}
    </div>
  );
}
