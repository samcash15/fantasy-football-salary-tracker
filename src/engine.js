// Pure value engine — shared by the Node compute job (scripts/compute-board.mjs) and the browser
// client-side lookup (src/sleeperBoard.js). No Node- or browser-specific APIs in here.

// Running-max reconstruction: seed from auction picks, raise (never lower) by FAAB waiver bids.
export function reconstructValues(picks, weeklyTransactions) {
  const val = new Map(), src = new Map();
  const bump = (pk, amt, source) => { if (!val.has(pk) || amt > val.get(pk)) { val.set(pk, amt); src.set(pk, source); } };

  for (const p of picks || []) bump(p.player_id, parseInt(p.metadata?.amount, 10) || 0, 'auction');

  let waiverRaises = 0;
  for (const txs of weeklyTransactions || []) {
    for (const t of txs || []) {
      if (t.status !== 'complete') continue;
      if (t.type === 'waiver' && t.settings?.waiver_bid != null && t.adds) {
        const bid = parseInt(t.settings.waiver_bid, 10) || 0;
        for (const pk of Object.keys(t.adds)) {
          const before = val.get(pk) ?? -1;
          bump(pk, bid, 'faab');
          if (bid > before) waiverRaises++;
        }
      }
    }
  }
  return { val, src, waiverRaises };
}

// Assemble board.teams from rosters + reconstructed values. Taxi/IR are cap-exempt (slot set;
// `spent` counts only slot===null). Overrides win over computed values. `name/position/team` are
// resolver fns (player_id -> value); `ownerName` maps owner_id -> display name.
export function buildTeams(rosters, { val, src, cap, overridesById = {}, ownerName = {}, name, position, team }) {
  return (rosters || []).map((r) => {
    const taxi = new Set(r.taxi || []);
    const reserve = new Set(r.reserve || []);
    const slotOf = (pk) => (taxi.has(pk) ? 'taxi' : reserve.has(pk) ? 'ir' : null);
    const list = (r.players || []).map((pk) => {
      const ov = overridesById[pk];
      const value = ov ? ov.amount : (val.get(pk) ?? 0);
      const source = ov ? 'override' : (src.get(pk) ?? 'none');
      return { sleeper_id: pk, name: name(pk), position: position(pk), team: team(pk), value, source, slot: slotOf(pk) };
    }).sort((a, b) => b.value - a.value);
    const spent = list.filter((p) => p.slot === null).reduce((s, p) => s + p.value, 0);
    return { owner_name: ownerName[r.owner_id] ?? `roster ${r.roster_id}`, roster_id: r.roster_id, spent, remaining: cap - spent, over_cap: spent > cap, players: list };
  }).sort((a, b) => b.spent - a.spent);
}
