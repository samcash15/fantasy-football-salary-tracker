// Visual language carried over from the prototype (salary-cap-draft-board.jsx):
// field-green / gold, position dots, cap-gauge palette.

export const COLORS = {
  bg: '#16302A',
  panel: 'rgba(242,239,233,0.06)',
  panelBorder: 'rgba(242,239,233,0.15)',
  hairline: 'rgba(242,239,233,0.12)',
  text: '#F2EFE9',
  muted: '#B0A99F',
  faint: '#7C8A82',
  gold: '#D4A94E',
  green: '#7FA37A',
  over: '#E07856',
};

export const POS_COLORS = {
  QB: '#D4A94E',
  RB: '#7FA37A',
  WR: '#5B9BD5',
  TE: '#C97B5E',
  DST: '#9B8AC4',
  K: '#B0A99F',
};

// Small badge palette for how a player's value was acquired.
export const SOURCE_STYLES = {
  auction: { label: 'AUC', color: '#D4A94E' },
  faab: { label: 'FAAB', color: '#5B9BD5' },
  free_agent: { label: 'FA', color: '#B0A99F' },
  trade: { label: 'TRD', color: '#9B8AC4' },
  override: { label: 'ADJ', color: '#C97B5E' },
  pending: { label: 'NEW', color: '#E0B33A' },
  none: { label: '—', color: '#7C8A82' },
};

// Which acquisition sources are worth a badge — auction is ~everything, so hide it as noise.
export const NOTABLE_SOURCES = new Set(['faab', 'trade', 'override', 'pending']);

// Color + label for a team's cap status (red = over, green = has room, gold = maxed but legal).
export function capStatus(remaining, overCap) {
  if (overCap) return { color: COLORS.over, label: `-$${Math.abs(remaining)} OVER`, over: true };
  if (remaining >= 20) return { color: COLORS.green, label: `$${remaining} LEFT`, over: false };
  return { color: COLORS.gold, label: `$${remaining} LEFT`, over: false };
}
