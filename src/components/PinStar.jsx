import { COLORS } from '../theme.js';

// Click to pin "my team" to the top (stored locally, no login). Stops row-click propagation.
export default function PinStar({ pinned, onToggle }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      aria-label={pinned ? 'Unpin team' : 'Pin team to top'}
      title={pinned ? 'Unpin' : 'Pin to top'}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 15, lineHeight: 1, color: pinned ? COLORS.gold : COLORS.faint, flexShrink: 0 }}
    >
      {pinned ? '★' : '☆'}
    </button>
  );
}
