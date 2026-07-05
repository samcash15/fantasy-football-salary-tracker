// Client-side board computation for user-entered leagues. Pulls a league straight from Sleeper in
// the browser and runs the shared value engine — so any auction league can be viewed without the
// cron precomputing it. No commissioner overrides (those live in the repo, for configured leagues).

import { reconstructValues, buildTeams } from './engine.js';

const SLEEPER = 'https://api.sleeper.app/v1';

const get = async (u) => {
  const r = await fetch(u, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${r.status} ${u}`);
  return r.json();
};

// The ~15MB NFL player dump (name/pos/team). Fetched once per session and cached in memory.
let playersPromise = null;
function loadPlayers() {
  if (!playersPromise) {
    playersPromise = fetch(`${SLEEPER}/players/nfl`).then((r) => {
      if (!r.ok) throw new Error('Could not load the Sleeper player list.');
      return r.json();
    }).catch((e) => { playersPromise = null; throw e; });
  }
  return playersPromise;
}

// Validate a league fits the format (auction, drafted) and return its league + draft. Cheap —
// used to check an ID before committing to a full board build.
export async function validateLeague(leagueId) {
  let league;
  try { league = await get(`${SLEEPER}/league/${leagueId}`); }
  catch { throw new Error('League not found — double-check the ID.'); }
  if (!league) throw new Error('League not found — double-check the ID.');
  const drafts = await get(`${SLEEPER}/league/${leagueId}/drafts`).catch(() => []);
  const draft = (drafts || []).find((d) => d.type === 'auction') || (drafts || [])[0];
  if (!draft) throw new Error(`"${league.name}" hasn't drafted yet.`);
  if (draft.type !== 'auction') throw new Error(`"${league.name}" is a ${draft.type} draft — this tool only works for auction leagues.`);
  return { league, draft };
}

// Build a full board object (same shape as board.<id>.json) for an arbitrary league, in-browser.
export async function buildBoardClient(leagueId) {
  const { league, draft } = await validateLeague(leagueId);
  const cap = draft.settings?.budget ?? 500;

  const [users, rosters, picks, players, weekly] = await Promise.all([
    get(`${SLEEPER}/league/${leagueId}/users`),
    get(`${SLEEPER}/league/${leagueId}/rosters`),
    get(`${SLEEPER}/draft/${draft.draft_id}/picks`),
    loadPlayers(),
    Promise.all(Array.from({ length: 19 }, (_, w) => get(`${SLEEPER}/league/${leagueId}/transactions/${w}`).catch(() => []))),
  ]);

  const { val, src } = reconstructValues(picks, weekly);
  const ownerName = Object.fromEntries((users || []).map((u) => [u.user_id, u.display_name]));
  const name = (pk) => { const p = players[pk]; return p ? (p.full_name || `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || `(unknown ${pk})`) : `(unknown ${pk})`; };
  const position = (pk) => { const p = players[pk]?.position; return p === 'DEF' ? 'DST' : (p ?? '?'); };
  const team = (pk) => players[pk]?.team ?? null;

  const teams = buildTeams(rosters, { val, src, cap, ownerName, name, position, team });
  return { league_id: leagueId, league_name: league.name, generated_at: new Date().toISOString(), cap, season: league.season, teams };
}
