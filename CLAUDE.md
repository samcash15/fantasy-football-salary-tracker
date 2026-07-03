# CLAUDE.md — Salary Cap Fantasy Football Companion App

> Project handoff brief. This file captures decisions already made in planning so we
> don't re-litigate them. Read this first, then help me build.

## What we're building

A **read-only league cap board** that mirrors a real Sleeper league. The league plays a
salary-cap house rule *on top of* an otherwise-normal Sleeper league: whatever roster you hold
in Sleeper, the sum of your players' dollar values has to fit under a **$500 cap**. Sleeper has
no concept of this cap, so the app is the layer that computes and displays it.

**How a player's value is defined (the core rule):**
> **A player's value = the highest acquisition cost in his history — it ratchets UP, never down.**
> - Base cost is his **auction price** (`metadata.amount` on the draft pick) or, if picked up off
>   waivers, the **FAAB bid** that acquired him.
> - **In-season, value only goes up:** a bigger FAAB bid raises it; a cheap re-pickup after a drop
>   does NOT lower it. Concretely: value = `max(all acquisition costs for this player across the
>   whole draft + transaction timeline)`.
> - Whoever **currently** rosters him is charged that value. Dropping frees it from your cap
>   automatically (just recompute the roster sum — no explicit "refund" to build).
> This means value is **not** a static price list; it's reconstructed per-player by scanning
> Sleeper's history for the running-max cost.

> **Offseason reset (future — not building yet, but don't lose it):** at year-end rollover, a
> player still **on a roster** gets his price bumped **+15%**; a player **not on any roster** has his
> price **cleared** (re-established at next year's auction). The season rule above is what we build now.

The app shows **one shared board**: every team, each rostered player with his value, each team's
total spent, remaining cap vs $500, and an over-cap flag. That's it.

- **Everything is derived from Sleeper and read-only** — rosters, adds/drops, values. Nobody
  builds or edits a roster in the app; all roster changes happen in Sleeper.
- **The one exception is a commissioner/admin surface** that can override/correct player values
  (e.g. fix a bad amount, price a player Sleeper has no cost for).

There is no login. This is an honor-system tool for a friend group. Do not add auth unless I
explicitly ask. (The commissioner surface can be a lightly-hidden panel like the prototype's,
not a real auth gate — see open questions.)

**What this is NOT** (explicitly cut from the earlier plan): no name entry, no per-person roster
*building* in the app, no honor-system pick list, no Supabase `rosters` table as system of
record. Sleeper *is* the roster.

## Architecture (decided 2026-07-02 — static JSON + GitHub Actions; Supabase dropped)

```
Sleeper API (read-only)  ->  GitHub Actions (compute + deploy)  ->  static board.json  ->  GitHub Pages (React board)
  league, rosters,           pulls Sleeper, reconstructs           committed to repo,      fetches board.json,
  draft picks (auction),     running-max cost per player, applies  built into the Vite     renders it. No DB
  transactions (FAAB)        overrides.json, then builds+deploys    site + deployed         client, no API keys
```

Because value = running-max acquisition cost, the app's real work is a **reconstruction step**:
walk Sleeper's draft + weekly transactions to find each player's highest-ever cost, attribute it
to whoever currently rosters him, and sum per team against the $500 cap. That computed board is
written to a static `board.json` the frontend just fetches and renders.

**Live layer (added 2026-07-03).** To reflect drops/moves quickly without hammering redeploys, the
frontend also polls Sleeper's `/rosters` endpoint **directly from the browser** (~every 60s) and
recomputes each team's totals against the values already in `board.json`. So: **values come from
the cron job; live roster state comes from the browser.** A drop shows up in ~1–5 min (Sleeper
caches `/rosters` ~5 min — `s-maxage=300` — which is the real floor; true seconds-live isn't
possible via their API). A brand-new pickup we haven't valued yet shows as `pending` until the next
cron run prices it (the browser also re-fetches `board.json` every ~5 min, so open tabs pick up new
values without a reload). Because of this, the cron is only about *value* freshness.

**Value-refresh schedule (2026-07-03).** Values only change when **waivers process** — this league
runs waivers ~**9am Central, Wed–Mon (no Tuesday)**; a claim placed after 9am doesn't process until
the next 9am. So the cron targets that window instead of running constantly: two attempts (:15/:45)
at both Central UTC offsets to survive DST + scheduler lag (`15,45 14 * * 0,1,3-6` and
`15,45 15 * * 0,1,3-6`), **redeploying only when `board.json` actually changed** (stays under Pages'
deploy limits); the 15MB `/players/nfl` dump is day-cached via `actions/cache`. Everything else
(drops, trades, FA adds) is roster-state only and shows live in-browser without a cron run.

**Why this stack:**
- **GitHub Pages** hosts the static React frontend, deployed by the same Action. Free, and keeps
  everything on one platform — no second service/account (Netlify was dropped 2026-07-03).
- **GitHub Actions (cron)** is the compute *and* deploy: on a schedule it pulls Sleeper, runs the
  reconstruction, reads `overrides.json`, writes `board.json`, then builds the site and publishes
  it to Pages. Free, no hosted service.
- **Static JSON in the repo** is the entire "datastore": `board.json` (computed output) +
  `overrides.json` (the only human-authored state — commissioner edits it via GitHub's web UI).
- **Sleeper API** is the source of truth for rosters *and* base values (auction + FAAB); read-only.

**Why not Supabase (its original justification evaporated):** the brief added Supabase to hold
"custom per-player values and read/write rosters." The read-only pivot deleted both — rosters come
from Sleeper, values are derived. The only durable, app-owned state left is a tiny overrides list,
which fits in a committed JSON file. Dropping Postgres also **eliminates the 7-day-pause gotcha
entirely** (that was Supabase-specific). We rejected AWS / Oracle VM paths earlier for the same
reason: more ownership than a friend-group tool warrants.

**The Java angle:** I primarily code in Java (6 yrs corporate). Java can still own the **compute
job** — a GitHub Action can run a Java program that reconstructs costs and writes `board.json`
(instead of upserting Postgres). That's real logic. Keep Java scoped to that job unless I say
otherwise; a small script in another language is also fine if we want the lightest path.

### Config-driven & multi-league (plug-and-play)

The only per-league input is a **`league_id`**. Everything else is **derived from Sleeper and
validated**, so pointing the app at a new league is a one-line config change (verified with a
throwaway script on 2026-07-02):

- **Derived, never hardcoded:** the auction `draft_id` (from `/league/{id}/drafts`), the **cap**
  (from `draft.settings.budget` — $500 here, but read it, don't assume), team count
  (`draft.settings.teams`), and season (`league.season`).
- **Format criteria a league must meet** (validate up front; fail fast with a clear message):
  1. Reachable Sleeper `league_id`.
  2. Its draft is **`type === 'auction'`** and complete (picks carry `metadata.amount`). A snake
     draft is rejected — the value model doesn't apply. (Verified: pointing the tool at a snake
     league errors cleanly.)
  3. **FAAB waivers** (`league.settings.waiver_type === 2`) for the waiver-pickup value path. If a
     league isn't FAAB (the QA league isn't), waiver adds carry no bid, so pickups just stay at
     their draft/known value — **warn, don't reject.**
- **Output per league:** one `board.<league_id>.json`. Config can hold a list of leagues; the
  compute job loops them. Frontend selects a league (default = the configured one).

Config lives in a tiny file (e.g. `leagues.json`: `[{ "id": "...", "label": "..." }]`) — no code
change to add any league that fits the criteria.

## (Removed) Supabase free-tier pause

No longer applies — we dropped Supabase (see Architecture). No database means nothing to pause and
no keep-alive ping to run. Historical note: Supabase pauses free projects after 7 days of DB
inactivity, which would have bitten in the offseason — avoiding that is one more reason the
static-JSON path fits better here.

## Data shapes (static JSON — replaces the old Supabase schema)

Two JSON files in the repo. No database, no RLS, no keys.

**`overrides.json`** — the ONLY human-authored state. Commissioner edits it via GitHub's web UI.
Maps a Sleeper `player_id` to a forced value that wins over the computed cost.
```json
{
  "overrides": [
    { "sleeper_id": "4034", "amount": 45, "note": "value correction after trade" }
  ]
}
```

**`board.json`** — computed output, written by the GitHub Actions job; the frontend fetches this.
```json
{
  "league_id": "1378471426956197888",
  "league_name": "FUTURE (QA)",
  "generated_at": "2026-09-10T08:00:00Z",
  "cap": 500,
  "season": "2026",
  "teams": [
    {
      "owner_name": "Sam",
      "roster_id": 3,
      "spent": 486,
      "remaining": 14,
      "over_cap": false,
      "players": [
        { "sleeper_id": "6794", "name": "Amon-Ra St. Brown", "position": "WR",
          "team": "DET", "value": 63, "source": "auction" }
      ]
    }
  ]
}
```

`source` ∈ `auction | faab | free_agent | trade | override`. Player display fields
(name/position/team) are resolved from Sleeper's `/players/nfl` dump **at compute time** and baked
into `board.json`, so the frontend needs nothing but this one file. Positions use our set
`QB/RB/WR/TE/DST/K` (remember DEF→DST). The `cap` is **derived from `draft.settings.budget`**
(not hardcoded) and baked into the JSON. `league_id`/`league_name` identify which league this
board is for (see Config-driven & multi-league). Design intent: **the browser only reads a static
file; the compute job is the sole writer.**

## Sleeper API integration

- Base URL: `https://api.sleeper.app/v1/` — read-only, no API key, JSON responses.
- Rate limit: stay under ~1000 calls/min (we'll never approach it). Cache aggressively.
- **Fetch-all-players** endpoint returns the full NFL player DB (name, position, team,
  `player_id`, injury status, etc.). Large payload — call **once per day max** and cache.
  This is what eliminates manual player entry.
- User -> leagues -> rosters flow: `GET /user/{username}` for the user_id, then
  `GET /user/{user_id}/leagues/nfl/{season}`, then league -> rosters/users/matchups.
- The league drafts via a Sleeper **auction** (confirmed); draft amounts are the base values —
  see the findings and reconstruction below.

### API review findings (2026-07-02) — confirmed against docs.sleeper.com

Concrete details verified before build, so we don't rediscover them mid-sync:

- **`GET /players/nfl` returns an OBJECT keyed by `player_id`, not an array.** Iterate values.
  It's the full ~11k-player dump (includes retired / practice-squad / no-team players); we only
  need entries for players actually on a roster, so look them up by id rather than loading all.
- **Field mapping for the sync:** our `name` = `first_name + " " + last_name` (their `full_name`
  isn't always populated; `search_full_name` is lowercased/de-punctuated — do NOT display it).
  `position` -> `position`, `team` -> `team`, their `player_id` -> our `sleeper_id`.
- **DST GOTCHA:** team defenses arrive with `position: "DEF"` and `player_id` = the team code
  (e.g. `"BUF"`), NOT `"DST"`. Our `players.position` CHECK only allows `'DST'`, so the sync
  **must map `DEF` -> `DST`** or every defense insert fails the constraint. Kickers are `"K"` already.
- **Auction draft = THE source of base values.** `GET /league/{league_id}/drafts` -> `draft_id`,
  then `GET /draft/{draft_id}/picks` gives each pick a `metadata.amount` = dollars paid. This is
  the acquisition cost for any player still on the team that drafted him.
- **FAAB bids = the value source for waiver pickups.** A player added off waivers is worth the
  FAAB bid that got him. That's NOT in the draft data — it's in
  `GET /league/{league_id}/transactions/{round}` on `type: "waiver"` transactions (the bid amount,
  e.g. `settings.waiver_bid`), keyed to the `adds` map. So the full value picture = **draft picks
  + every week's transactions stitched together.** Pull transactions for each week (`round`) of
  the season.
- **Rosters carry no salary.** `/league/{league_id}/rosters` gives `players` as an array of
  `player_id`s only (who owns whom *now*); map `owner_id` -> display name via
  `/league/{league_id}/users`. This is the "who's on each team" snapshot we price.
- Rate limit ~1000/min and the once-daily `/players/nfl` cache rule are non-issues at our scale.

### Acquisition-cost reconstruction (the core algorithm)

Value = **running-max acquisition cost, charged to the current owner.** To compute:

1. **Track a running max cost per player.** Seed from the auction draft: each pick contributes
   `metadata.amount` as a candidate cost.
2. **Replay every week's transactions**, raising (never lowering) each player's max: waiver adds
   contribute their FAAB bid; free-agent ($0) adds and trades contribute no new cost (a trade just
   carries the existing value). The max only ratchets up — a cheap re-pickup can't lower it.
3. **Intersect with current rosters** (`/league/{id}/rosters`): a player's value = his running-max
   cost, charged to whichever team holds him now.
4. **Apply overrides last** — an entry in `overrides.json` wins over the computed value.
5. Sum per team, compare to $500, flag over-cap. Write `board.json`.

### Resolved with the league owner (2026-07-02)

- ✅ **The league lives in Sleeper** — rosters mirror reality; roster changes happen in Sleeper.
  The app is read-only.
- ✅ **It's an auction league** — auction amounts are the base values.
- ✅ **Value model (in-season):** running-max acquisition cost — value ratchets **up, never down**;
  a cheap re-pickup after a drop keeps the higher figure. Charged to the current owner; dropping
  frees it automatically.
- ✅ **Trades:** value **carries** with the player (never resets down) — falls out of the
  running-max rule, since a trade adds no new cost and can't lower the max.
- ✅ **Free-agent ($0) adds:** contribute no cost; the player's value stays his running max (which
  may be $0 if he was never paid for).
- ✅ **One shared league board**, no individual/private views.
- ✅ **Overrides:** commissioner edits `overrides.json` in the repo via GitHub's web UI — no DB, no
  auth, no admin form to build.

**Deferred (not building yet):**
- **Offseason rollover:** rostered players get **+15%**; unrostered players are **cleared** and
  re-priced at the next auction. Revisit before the offseason — the season rule is what we build now.

## Suggested build order

1. **Identify the league.** Get the `league_id` via the owner's Sleeper username:
   `/user/{username}` -> `user_id` -> `/user/{user_id}/leagues/nfl/{season}`. Store `league_id` in
   config; **derive** draft_id, cap (`draft.settings.budget`), teams, season from Sleeper and
   validate the format criteria (see Config-driven & multi-league). Dev/QA league is
   `1378471426956197888` ("FUTURE (QA)", auction, $500).
2. **Prove the reconstruction on real data first** — a throwaway script that pulls draft picks +
   transactions + current rosters and prints each team's players with running-max cost and total
   vs $500. This de-risks the whole app before any UI.
3. **Compute job** (the core; GitHub Actions cron, Java or a small script): pull `/players/nfl`
   for display fields + draft + transactions + rosters -> running-max reconstruction -> apply
   `overrides.json` -> write `board.json`.
4. React frontend (Vite): `fetch` `board.json`, render the **league board** — teams, each player +
   value, team totals, cap gauge, over-cap flags. Reuse the prototype's visual language (below).
5. Deploy via **GitHub Pages** — the same Action builds the Vite site and publishes to Pages
   (repo Settings → Pages → Source: GitHub Actions, one-time). Site: `/<repo>/` subpath, so
   Vite `base` is set for the production build.
6. Seed `overrides.json` (empty to start) and document the commissioner's GitHub-web-edit flow.

## Reference: existing prototype

A React prototype exists (`salary-cap-draft-board.jsx`) with a strong visual language — the
field-green/gold theme, the **cap-space gauge**, player rows with position dots, and a
commissioner edit panel. **Reuse the look and the components, but repurpose the app:** it was
built as a single-user *roster builder* (type your name, add/remove players against your own cap)
backed by artifact key/value storage. That interaction model is now cut. What carries over:

- **Cap gauge + over-cap styling** -> repurpose into a per-team gauge on the shared board.
- **Player-row layout / position colors** -> the roster rows under each team.
- **Commissioner panel** -> repurpose from "edit the master price list" to "edit `value_overrides`."
- The `usePersisted`/`window.storage` data layer and the add/remove-to-my-roster logic -> **drop.**
  Data now comes read-only from a fetched `board.json`, produced by the compute job.

## Constraints / preferences

- Keep it simple and cheap. Everything should stay on free tiers.
- No login / no auth unless explicitly requested.
- Java only where it earns its place (the compute job). Frontend is plain React (no DB client).
- Hosting: **GitHub Pages (static site) + GitHub Actions (compute + deploy) + static JSON** — all
  on GitHub, no second service (Netlify dropped 2026-07-03). Supabase was
  dropped on 2026-07-02 once the app became read-only — don't reintroduce a database unless we
  specifically need commissioner writes without a Git commit.
