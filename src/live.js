// Client-side "live" layer.
//
// board.json (from the cron job) is the baseline: it carries each player's running-max value,
// name, team, and source. The browser then polls Sleeper's rosters endpoint directly and
// recomputes each team's roster + totals against that value map — so drops/moves show up within
// a couple of minutes without waiting for the next cron run or a redeploy.
//
// Note: Sleeper caches the rosters endpoint ~5 min (s-maxage=300), so that's the realistic floor.

const SLEEPER = 'https://api.sleeper.app/v1';

// sleeper_id -> { name, position, team, value, source } from the last computed board.
export function buildValueMap(board) {
  const map = new Map();
  for (const t of board.teams) {
    for (const p of t.players) {
      const existing = map.get(p.sleeper_id);
      if (!existing || p.value > existing.value) map.set(p.sleeper_id, p); // keep running-max
    }
  }
  return map;
}

// roster_id -> owner display name (owners rarely change; reuse from the board).
export function buildOwnerMap(board) {
  const map = new Map();
  for (const t of board.teams) map.set(t.roster_id, t.owner_name);
  return map;
}

export async function fetchLiveRosters(leagueId) {
  const r = await fetch(`${SLEEPER}/league/${leagueId}/rosters`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`rosters ${r.status}`);
  return r.json();
}

// Rebuild the board's team rows from LIVE rosters + the known value map.
// Taxi + IR/reserve are exempt from the cap (read live from the roster), so only slot===null counts.
export function recomputeTeams(rosters, valueMap, ownerMap, cap) {
  return rosters
    .map((r) => {
      const taxi = new Set(r.taxi || []);
      const reserve = new Set(r.reserve || []);
      const players = (r.players || [])
        .map((pk) => {
          const known = valueMap.get(pk);
          // spread so we don't mutate the shared value-map object when we set the live slot
          const p = known
            ? { ...known }
            : { sleeper_id: pk, name: 'New pickup', position: '?', team: null, value: 0, source: 'pending' };
          p.slot = taxi.has(pk) ? 'taxi' : reserve.has(pk) ? 'ir' : null;
          return p;
        })
        .sort((a, b) => b.value - a.value);
      const spent = players.filter((p) => p.slot === null).reduce((s, p) => s + p.value, 0);
      return {
        owner_name: ownerMap.get(r.roster_id) ?? `roster ${r.roster_id}`,
        roster_id: r.roster_id,
        spent,
        remaining: cap - spent,
        over_cap: spent > cap,
        players,
      };
    })
    .sort((a, b) => b.spent - a.spent);
}
