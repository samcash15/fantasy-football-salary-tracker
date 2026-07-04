# The Cap Board — Salary-Cap Fantasy Football Companion

A **read-only league cap board** for a Sleeper fantasy football league that plays a salary-cap
house rule on top of a normal Sleeper league: whatever roster you hold in Sleeper, the total dollar
value of your players must fit under a **$500 cap**. Sleeper has no concept of this cap, so this app
is the layer that computes and displays it.

**Live site:** https://samcash15.github.io/fantasy-football-salary-tracker/

Everything is derived from Sleeper and read-only — rosters, adds/drops, and player values all come
from Sleeper. Nobody builds a roster in this app; roster changes happen in Sleeper. The only
human-authored input is a small `overrides.json` for commissioner value corrections.

---

## How a player's value works (the core rule)

> **A player's value = the highest acquisition cost in his history — it ratchets UP, never down.**

- **Base cost** is his **auction price** (`metadata.amount` on the draft pick), or the **FAAB bid**
  that acquired him if he was picked up off waivers.
- **In-season, value only goes up.** A bigger FAAB bid raises it; a cheap re-pickup after a drop
  does **not** lower it. Formally: `value = max(all acquisition costs across the draft + transaction
  timeline)`.
- Whoever **currently** rosters a player is charged that value. Dropping him frees the value from
  your cap automatically (the total just recomputes).
- **Trades** carry the value (a trade adds no new cost, so the max can't drop).
- **Taxi squad and IR/reserve players are exempt** — they're shown but do not count toward the cap.

Values are **reconstructed**, not stored as a static price list: the compute job walks Sleeper's
draft picks + weekly transactions to find each player's running-max cost.

### Using the board

- **Compact view (default):** one row per team — rank, owner, cap gauge, and color-coded remaining
  (**green** = has room, **gold** = maxed but legal, **red** = over). Over-cap teams sort to the
  top. Click any row to expand its roster.
- **Detailed view:** the same info as full cards in a grid.
- **Sort** by cap used, cap space, or team name; a **summary strip** shows over-cap count, the team
  with the most room, and the tightest team.
- **⭐ Pin your team** to keep it at the top (remembered on your device — no login).
- In a roster, expensive players lead; the `$1` minimum-bid bench is collapsed behind a "show" link,
  and taxi/IR players appear dimmed and uncounted.

> **Offseason reset (not yet built):** at year-end, a player still on a roster gets **+15%**; a
> player on no roster is **cleared** and re-priced at the next auction.

---

## Architecture

```
Sleeper API  ──►  GitHub Actions  ──►  static board.json  ──►  GitHub Pages (React board)
 (read-only)      compute + deploy     committed to repo        fetches board.json + polls
                                                                 Sleeper rosters live
```

- **No database, no backend, no API keys, no auth.** The entire "datastore" is static JSON in the
  repo: `board.<league_id>.json` (computed output) + `overrides.json` (the only human-authored
  state).
- **Values** come from the scheduled compute job. **Live roster state** (drops/trades/adds) is read
  by the browser polling Sleeper directly, so those show up within ~1–5 minutes without waiting for
  a redeploy.
- Hosting, compute, and deploy are all on GitHub — no second service.

### Freshness model

| Change | How it shows up | Latency |
| --- | --- | --- |
| Drop / trade / free-agent add | Browser polls Sleeper `/rosters` every 60s and recomputes | ~1–5 min* |
| New waiver **value** (FAAB) | Compute job runs after waivers process | see schedule below |
| Commissioner override | Committed to `overrides.json`, applied on next compute run | next run |

\* Sleeper caches its `/rosters` endpoint ~5 min (`s-maxage=300`), which is the real floor — true
seconds-live isn't possible through their API. Open tabs also re-fetch `board.json` every ~5 min, so
newly-priced pickups stop showing as `NEW`/pending on their own.

---

## Project structure

```
├─ index.html, vite.config.js         # Vite app entry / config (base = /<repo>/ in production)
├─ src/
│  ├─ App.jsx                          # loads board.json, renders board, live polling, league switcher
│  ├─ live.js                          # browser-side live layer (poll rosters, recompute totals)
│  ├─ theme.js                         # colors / position palette / source badges
│  └─ components/
│     ├─ TeamCard.jsx                  # per-team card: cap gauge, players, taxi/IR sub-section
│     ├─ CapGauge.jsx, PlayerRow.jsx
│     └─ CommishPanel.jsx              # commissioner overrides helper
├─ scripts/
│  ├─ compute-board.mjs                # the compute job (Sleeper → running-max → board.json)
│  └─ reconstruct.test.mjs            # unit tests for the value engine (FAAB / running-max)
├─ leagues.json                        # ← the ONLY per-league config (list of league ids)
├─ overrides.json                      # ← commissioner value corrections
├─ public/                             # generated: board.<id>.json, board.json, leagues.json, overrides.json
└─ .github/workflows/compute-board.yml # cron + build + deploy to GitHub Pages
```

---

## Local development

Requires **Node 22+** (the compute job uses only built-ins — global `fetch`, `fs`).

```bash
npm install          # frontend deps (React + Vite)

npm run dev          # dev server at http://localhost:5173
npm run build        # production build → dist/
npm run compute      # pull Sleeper and regenerate public/board*.json
npm test             # run the value-engine unit tests
```

`npm run compute` reads `leagues.json` + `overrides.json`, fetches Sleeper, reconstructs values, and
writes the board files into `public/`. It caches the ~15 MB player dump under `.cache/` for a day.

---

## Adding or changing a league (plug-and-play)

The only per-league input is a **`league_id`**. Everything else — the auction `draft_id`, the cap
(`draft.settings.budget`), team count, and season — is derived from Sleeper and validated.

Edit **`leagues.json`**:

```json
{
  "leagues": [
    { "id": "1378471426956197888", "label": "FUTURE (QA)", "default": true },
    { "id": "<another_league_id>", "label": "My Other League" }
  ]
}
```

On the next compute run the app builds a board for each league and the UI shows a **league dropdown**
(selection persists in a `?league=<id>` URL param). The board defaults to the entry marked
`"default": true`.

**A league must meet these criteria** (validated up front; it fails fast otherwise):

1. A reachable Sleeper `league_id`.
2. Its draft is an **auction** and complete (picks carry `metadata.amount`). Snake drafts are
   rejected — the value model doesn't apply.
3. **FAAB waivers** (`waiver_type === 2`) for the waiver-pickup value path. Non-FAAB leagues are
   allowed but warned (waiver adds carry no bid, so those players stay at their draft/known value).

---

## Commissioner overrides

An entry in `overrides.json` **forces** a player's value, winning over the computed running-max —
used to fix a bad amount or price a player Sleeper has no cost for.

```json
{
  "overrides": [
    { "sleeper_id": "4034", "amount": 45, "note": "value correction after trade" }
  ]
}
```

The site includes a **"Commissioner tools"** panel (bottom of the board) that makes this painless:
search a rostered player, set an override amount + note, and it generates the exact `overrides.json`
with a **Copy** button and a one-click **Edit on GitHub** link. Because the site is static, the
actual save is a normal GitHub commit — paste, commit, and the next compute run applies it. No login
or backend.

---

## The compute job & schedule

Values only change when **waivers process** — this league runs waivers ~**9am Central, Wednesday
through Monday** (no Tuesday). So the cron targets that window rather than running constantly:

```
15,45 14 * * 0,1,3-6    # 9:15/9:45am CDT (summer)
15,45 15 * * 0,1,3-6    # 9:15/9:45am CST (winter)
```

Two attempts per applicable day at both Central UTC offsets, to survive daylight-saving shifts and
GitHub's best-effort scheduler. The workflow **only redeploys when `board.json` actually changed**
(keeping under GitHub Pages' deploy limits), and unit tests must pass before compute/deploy.

You can also trigger a refresh manually: **Actions → Compute and deploy cap board → Run workflow**
(or `gh workflow run "Compute and deploy cap board"`).

> Note: GitHub disables scheduled workflows after ~60 days of repo inactivity. If the schedule ever
> pauses in the deep offseason, re-enable it in the Actions tab or push any commit.

---

## Deployment

Hosted on **GitHub Pages**, published by the same Action that computes the board. On a push to
`main` (or a scheduled/manual run) the workflow: runs tests → computes the board → commits any
change → builds the Vite site → deploys to Pages. One-time setup was Settings → Pages → Source:
**GitHub Actions**.

---

## Tech notes

- **Read-only by design.** The browser never writes anything; Sleeper is the source of truth for
  rosters and base values, and the compute job is the sole writer of `board.json`.
- **No secrets** are stored anywhere in the repo or the client.
- Built with React + Vite; the compute job is plain Node (no dependencies).
- The player value engine (`reconstructValues`) is covered by unit tests (`npm test`).
