import { COLORS, POS_COLORS, SOURCE_STYLES } from '../theme.js';

// `dim` is used for cap-exempt (taxi / IR) rows.
export default function PlayerRow({ player, dim }) {
  const dot = POS_COLORS[player.position] || COLORS.muted;
  const src = SOURCE_STYLES[player.source] || SOURCE_STYLES.none;
  const slotLabel = player.slot === 'taxi' ? 'TAXI' : player.slot === 'ir' ? 'IR' : null;
  return (
    <div
      style={{
        display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'center',
        gap: 10, padding: '7px 12px', fontSize: 14,
        borderTop: `1px solid ${COLORS.hairline}`,
        opacity: dim ? 0.5 : 1,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player.name}</span>
        <span style={{ fontSize: 11, color: COLORS.faint, flexShrink: 0 }}>
          {player.position}{player.team ? ` · ${player.team}` : ''}
        </span>
        {slotLabel && (
          <span style={{ fontSize: 9, letterSpacing: '0.04em', color: COLORS.muted, border: `1px solid ${COLORS.panelBorder}`, borderRadius: 3, padding: '0 4px', flexShrink: 0 }}>
            {slotLabel}
          </span>
        )}
      </span>
      <span
        title={player.source}
        style={{
          fontSize: 10, letterSpacing: '0.04em', color: src.color,
          border: `1px solid ${src.color}55`, borderRadius: 4, padding: '1px 5px',
        }}
      >
        {src.label}
      </span>
      <span className="num" style={{ color: dim ? COLORS.faint : COLORS.gold, minWidth: 44, textAlign: 'right' }}>
        ${player.value}
      </span>
    </div>
  );
}
