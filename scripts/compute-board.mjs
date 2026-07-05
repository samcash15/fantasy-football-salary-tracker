// Compute job: pull Sleeper -> running-max acquisition-cost reconstruction -> apply
// overrides.json -> write public/board.<league_id>.json (+ board.json for the default league).
//
// The ONLY per-league input is a league_id (in leagues.json). Everything else is derived from
// Sleeper and validated. Run: `npm run compute`. In CI, a GitHub Action runs this on a cron and
// commits any changed board files (which redeploys the static site).

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { reconstructValues, buildTeams } from '../src/engine.js';

const BASE = 'https://api.sleeper.app/v1';
const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, 'public');
const CACHE = path.join(ROOT, '.cache');
const PLAYERS_TTL_MS = 24 * 60 * 60 * 1000; // Sleeper asks: fetch /players/nfl at most once/day.

const readJson = (p, fallback) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback);
const get = async (u) => {
  const r = await fetch(u);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${u}`);
  return r.json();
};

// --- the full NFL player dump, cached locally (name/position/current team). ---
async function loadPlayers() {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, 'players_nfl.json');
  const fresh = fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < PLAYERS_TTL_MS;
  if (!fresh) {
    process.stdout.write('fetching /players/nfl (~15MB)… ');
    const res = await fetch(`${BASE}/players/nfl`);
    if (!res.ok) throw new Error(`players/nfl ${res.status}`);
    fs.writeFileSync(file, await res.text());
    console.log('done');
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// --- resolve + validate one league against the format criteria (auction, complete). ---
async function resolveLeague(leagueId) {
  const league = await get(`${BASE}/league/${leagueId}`);
  if (!league) throw new Error(`league ${leagueId} not found`);
  const drafts = await get(`${BASE}/league/${leagueId}/drafts`);
  const draft = drafts.find((d) => d.type === 'auction') || drafts[0];
  if (!draft) throw new Error(`league "${league.name}" has no draft`);
  if (draft.type !== 'auction') {
    throw new Error(`league "${league.name}" draft is "${draft.type}", not auction — value model does not apply`);
  }
  const cap = draft.settings?.budget ?? 500;        // derived, not assumed
  const isFaab = league.settings?.waiver_type === 2; // FAAB waivers
  if (!isFaab) console.warn(`  ! "${league.name}" is not FAAB — waiver pickups carry no bid; values stay at draft/known.`);
  return { league, draft, cap, isFaab, season: league.season, teams: draft.settings?.teams ?? league.total_rosters };
}

// --- build the board for one league (fetches Sleeper, reconstructs, applies overrides). ---
async function computeBoard(cfg, players, overridesById) {
  const { league, draft, cap, season } = await resolveLeague(cfg.id);
  const users = Object.fromEntries((await get(`${BASE}/league/${cfg.id}/users`)).map((u) => [u.user_id, u.display_name]));
  const rosters = await get(`${BASE}/league/${cfg.id}/rosters`);

  // fetch auction picks + every week's transactions, then reconstruct running-max values
  const picks = await get(`${BASE}/draft/${draft.draft_id}/picks`);
  const weekly = [];
  for (let w = 0; w <= 18; w++) {
    try { weekly.push(await get(`${BASE}/league/${cfg.id}/transactions/${w}`)); } catch { /* week may not exist */ }
  }
  const { val, src, waiverRaises } = reconstructValues(picks, weekly);

  const displayName = (pk) => {
    const pl = players[pk];
    if (!pl) return `(unknown ${pk})`;
    return pl.full_name || `${pl.first_name ?? ''} ${pl.last_name ?? ''}`.trim() || `(unknown ${pk})`;
  };
  const displayPos = (pk) => { const p = players[pk]?.position; return p === 'DEF' ? 'DST' : (p ?? '?'); }; // DEF -> DST

  const teams = buildTeams(rosters, {
    val, src, cap, overridesById, ownerName: users,
    name: displayName, position: displayPos, team: (pk) => players[pk]?.team ?? null,
  });

  return {
    board: { league_id: cfg.id, league_name: league.name, generated_at: new Date().toISOString(), cap, season, teams },
    stats: { priced: val.size, waiverRaises, teams: teams.length, committed: teams.reduce((s, t) => s + t.spent, 0), over: teams.filter((t) => t.over_cap).length },
  };
}

// --- main (runs only when executed directly, so importing for tests is side-effect free) ---
async function main() {
  const cfg = readJson(path.join(ROOT, 'leagues.json'), { leagues: [] });
  const overrides = readJson(path.join(ROOT, 'overrides.json'), { overrides: [] });
  const overridesById = Object.fromEntries((overrides.overrides || []).map((o) => [String(o.sleeper_id), o]));
  if (!cfg.leagues?.length) { console.error('leagues.json has no leagues'); process.exit(1); }

  fs.mkdirSync(PUBLIC, { recursive: true });
  const players = await loadPlayers();

  let failures = 0;
  const index = [];
  for (const league of cfg.leagues) {
    try {
      console.log(`\n▶ ${league.label ?? league.id} (${league.id})`);
      const { board, stats } = await computeBoard(league, players, overridesById);
      fs.writeFileSync(path.join(PUBLIC, `board.${league.id}.json`), JSON.stringify(board, null, 2));
      if (league.default) fs.writeFileSync(path.join(PUBLIC, 'board.json'), JSON.stringify(board, null, 2));
      index.push({ id: league.id, label: league.label ?? board.league_name, default: !!league.default });
      console.log(`  ✓ ${board.league_name}: ${stats.teams} teams, $${stats.committed} committed, ${stats.over} over cap, ${stats.priced} priced players, ${stats.waiverRaises} waiver raises`);
    } catch (e) {
      failures++;
      console.error(`  ✗ ${league.id}: ${e.message}`);
    }
  }
  // small index so the UI can discover boards
  fs.writeFileSync(path.join(PUBLIC, 'leagues.json'), JSON.stringify({ leagues: index }, null, 2));
  // publish current overrides so the commissioner panel can show/edit them
  fs.writeFileSync(path.join(PUBLIC, 'overrides.json'), JSON.stringify(overrides, null, 2));

  console.log(`\nDone. ${index.length} board(s) written, ${failures} failure(s).`);
  process.exit(failures ? 1 : 0);
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
