# Dark Night Desk

fill the nights your venue sits empty

A dark night is a night the venue stays closed because nothing is booked. Dark Night Desk reads a venue's public calendar,
finds those nights, and helps the booker fill them.

Status: in development

Venue calendars are read from each venue's public website. Dark Night Desk is not affiliated with any venue or artist.

## Run locally

Requires Node 22 or newer.

```sh
npm install
npm start          # http://127.0.0.1:3020
npm test
```

Without `QLOO_API_KEY` the server starts with Qloo shown as "not connected". Without `ANTHROPIC_API_KEY` the agent runs
as a labelled scripted plan. To try it with keys, export them in your own shell for that run
(`QLOO_API_KEY=... ANTHROPIC_API_KEY=... npm start`); never write them into a file inside the repo.
All settings are environment variables read in `server/config.js`:

| Variable | Default | Meaning |
|---|---|---|
| `HOST` / `PORT` | `127.0.0.1` / `3020` | loopback only |
| `DATA_DIR` | `./var` | local cache and spend ledger |
| `VENUES_DIR` | `data/venues` | one JSON file per venue |
| `QLOO_API_KEY` | none | Qloo hackathon API key |
| `QLOO_BASE_URL` | `https://hackathon.api.qloo.com` | no other host is accepted |
| `QLOO_MODE` | `live` | `fixture` is allowed only with `NODE_ENV=test` |
| `ANTHROPIC_API_KEY` | none | enables the live agent |
| `ANTHROPIC_API_KEY_FILE` | none | read the key from this file instead (used when `ANTHROPIC_API_KEY` is unset; an unreadable file means no key) |
| `ANTHROPIC_KEY_LAST_DAY` | none | `YYYY-MM-DD` (UTC); after this day no live Claude call is made |
| `CLAUDE_MODEL` | `claude-haiku-5-5` | |
| `AGENT_MODE` | `auto` | `auto`, `live`, `recorded` or `scripted` |
| `DAILY_USD_CAP` / `MONTHLY_USD_CAP` / `TOTAL_USD_CAP` | `2` / `12` / `30` | Claude spend caps (UTC day, UTC calendar month, all time) |
| `IP_DAILY_LIMIT` | `20` | plan requests per IP per day |
| `CLAUDE_PRICE_IN_PER_MTOK` / `CLAUDE_PRICE_OUT_PER_MTOK` | `0.1` / `0.5` | USD per million tokens, for the spend counter (Haiku 5.5) |
| `CLAUDE_LONG_PRICE_IN_PER_MTOK` / `CLAUDE_LONG_PRICE_OUT_PER_MTOK` | `0.5` / `2.5` | the same for a prompt over `CLAUDE_LONG_PROMPT_TOKENS` (`100000`) |

The server refuses to start on an invalid setting and prints what is wrong.

`GET /api/health` reports the modes, the spend ledger, `version` (from `package.json`) and `uptime` (whole seconds since the
process started).

## Deploy (systemd)

`deploy/dark-night-desk.service` runs the server as a systemd service. Its paths are examples (checkout in `/opt/dark-night-desk`,
env file in `/etc/dark-night-desk/dnd.env`); edit them before installing. The repo does not install or start it; on the server:

```sh
sudo cp deploy/dark-night-desk.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dark-night-desk
curl -s http://127.0.0.1:3020/api/health
journalctl -u dark-night-desk -f
```

- `npm install --omit=dev` in the working directory first. Edit `WorkingDirectory`, `EnvironmentFile`, `ReadWritePaths` and
  the node path in `ExecStart` if the checkout lives somewhere else.
- The unit sets `HOST=127.0.0.1`, `PORT=3020` and `NODE_ENV=production`. The server only listens on loopback; a reverse proxy
  on the same host (for example nginx) serves it to the outside and passes `X-Forwarded-For`, which the IP limit reads.
- **Keys live only in the server's environment file** named by `EnvironmentFile=` (mode 600, outside the repo), one
  `NAME=value` per line: `QLOO_API_KEY`, `ANTHROPIC_API_KEY` (or `ANTHROPIC_API_KEY_FILE`, a path to a mode 600 file), and any setting from the table above. No key is in the repo,
  in the unit file, in the browser or in the logs.
- Limits: `Nice=10`, `MemoryMax=512M`, `Restart=on-failure`, `NoNewPrivileges`, `PrivateTmp`, `ProtectSystem=full`.
  `ReadWritePaths` names only `DATA_DIR` (`./var` by default: Qloo cache, spend ledger, recorded runs). If the environment file
  sets another `DATA_DIR`, change `ReadWritePaths` to match.
- The daily, monthly and total Claude caps (`DAILY_USD_CAP`, `MONTHLY_USD_CAP`, `TOTAL_USD_CAP`) and `IP_DAILY_LIMIT` hold on the public server too: when one
  is reached the page keeps working with a recorded run or the scripted plan, and says so.

## Venues and dark nights

Each venue is one JSON file in `VENUES_DIR` (schema checked by `server/calendar/venues.js`; a file that fails is skipped and logged):

```json
{
  "id": "example-room", "name": "Example Room", "city": "Exampleville", "capacity_band": "250-500",
  "calendar_source_url": "https://example.org/calendar", "read_at": "2026-10-11",
  "closed_weekdays": [1],
  "shows":      [{ "date": "2026-10-13", "headliner": "Synthetic Act 1", "source_url": "https://example.org/shows/2026-10-13" }],
  "past_shows": [{ "date": "2026-07-02", "headliner": "Synthetic Act 101", "source_url": "https://example.org/shows/2026-07-02" }]
}
```

`data/venues/` (the default `VENUES_DIR`) holds the demo market: the 15 rooms listed on First Avenue's calendar (the Minneapolis market, all filed under city "Minneapolis"), read on 11 Oct 2026
from First Avenue's public calendar pages (GET only, a few requests at least 2.5 seconds apart). Each file keeps the next 60 days
as `shows` and the last 90 days as `past_shows`; postponed shows were skipped (`scripts/refresh-venues.js` rebuilds them, see Calendar refresh). Titles are kept as the calendar printed them (letters outside ASCII are
stored as JSON `\uXXXX` escapes, so the files are plain ASCII and parse to the same text). The
page opens on Fine Line when it is present, otherwise on the first venue.

`closed_weekdays` uses 0 = Sunday. `shows` is the upcoming program read from the public calendar, `past_shows` is the room's own past
program (the only source for "this room's crowd"). `test/fixtures/synthetic/venues/example-room.json` is a hand-written test venue
(`"_synthetic": true`, made-up city and acts).

`GET /api/venues/:id/calendar?from=YYYY-MM-DD&days=60` returns every night in the window as `booked` (a show is listed),
`closed` (a weekday the room is always shut; not counted as empty) or `dark` (open weekday, nothing booked), plus `dark_count`
and the calendar source. `from` defaults to today and all date math is done in UTC, so the server time zone never shifts a night.
`days` is 1 to 120. Today's night carries `today: true`; with nothing booked its status is `today`, and empty nights before today
are `past`. Both are too late to book, so dark nights (and `dark_count`) start tomorrow, and `/api/plan` and `/api/ablate`
answer 409 for today or a past date.

## Calendar refresh

`scripts/refresh-venues.js` re-reads First Avenue's public calendar and rewrites the `fa-*.json` files in `VENUES_DIR`:

```sh
node scripts/refresh-venues.js --dry-run   # read and count, write nothing
node scripts/refresh-venues.js             # read and rewrite the venue files
```

- It reads `robots.txt` first and stops if the calendar is disallowed for its user agent. Then it reads the month pages
  (`/shows/?start_date=YYYYMM01`) that cover today minus 90 days to today plus 60 days: six or seven pages.
- Only GET, User-Agent `Mozilla/5.0 (research; dark-night-desk)`, at least 2.5 seconds between requests (longer if
  `robots.txt` sets a `Crawl-delay`). The first 403 or 429 stops the run.
- `server/calendar/firstavenue.js` (`parseMonthPage`) turns a page into rows of date, room, title and event link. The date comes
  from the day marker before each row. Rows marked canceled or postponed (by title, link or status badge) are skipped.
- Each room becomes `fa-<room-slug>.json`. Existing file names, `capacity_band`, `city` and `closed_weekdays` are kept; a new
  room gets `capacity_band: "unknown"`. `shows` is today to today plus 60 days, `past_shows` is the 90 days before today,
  `read_at` is the time of the run. A room the calendar no longer lists keeps its file with empty lists.
- All or nothing: any failed page stops the run before a write. Every file is checked against the venue schema, written to a
  temporary name and renamed into place. Raw pages are kept only in `DATA_DIR/raw-calendar/`, never in the repo. Test venues
  (`_synthetic`) and other files in `VENUES_DIR` are left alone.
- Exit codes: 0 done, 1 usage or configuration error, 2 stopped (robots.txt, 403/429, HTTP or parse failure).
- The server reads the venue files on every request, so `/api/venues` and the calendar show new data without a restart.

`deploy/dark-night-desk-refresh.service` (oneshot, `Nice=15`, same `WorkingDirectory` and `EnvironmentFile` as the server) and
`deploy/dark-night-desk-refresh.timer` (Mondays 06:30 server time, up to 20 minutes random delay, `Persistent=true`) run it
weekly. The repo does not install them; on the server:

```sh
sudo cp deploy/dark-night-desk-refresh.service deploy/dark-night-desk-refresh.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dark-night-desk-refresh.timer
systemctl list-timers dark-night-desk-refresh.timer
journalctl -u dark-night-desk-refresh
```

Parser tests use only hand-written synthetic pages (`test/fixtures/synthetic/html/`) and a fake site; no real page is in the repo.

## Ranking core (`server/rank/`, no LLM)

- **Pool** (`pool.js`): headliners who played other rooms in the same city from 90 days before to 60 days after the night
  ("acts who played <city> this season"; the back-test uses its own 21-day window, see below). Acts from the room's own past program are
  left out. Names resolve with `/search` only when the top artist result has the same normalized name (whole title, then the part before
  "with", "feat." and similar). Anything else is counted: `needs_input` keeps the top 3 candidates, `unresolved` is dropped.
- **Rankers** (`rank.js`): `rankPool` (the room's past headliners as the taste signal), `rankByPopularity` (a rough stand-in for draw;
  we have no ticket data) and `rankByTags` (genre tags only). Each first asks `/v2/insights` once with `filter.results.entities` = the pool;
  if that is empty or fails it asks once with `take=200` and keeps the pool members found. `method` says which path ran.
- **Why this act** (`contributions`): per-signal shares from `feature.explainability` when the response has them, otherwise leave-one-out
  (one cached call per past show with that show removed; the share is the score drop).
- **Ablation** (`ablate.js`): switch off past shows, rank again, report the new top 5 and how many of 5 changed.
- **Also loves** (`lift.js`): film, place and brand categories, asked with the room's signal and with a neutral signal (the same number of past
  headliners from each sample room in the city). Shown as category plus lift range: the category's share of the top 10 and top 20 results,
  room minus city. Raw affinity is never shown.

In tests the Qloo client runs in fixture mode: hand-written synthetic files, re-scored from a hash of the signal ids so that rankings,
ablation and lift react to the signal. Those numbers mean nothing outside the tests.

## Qloo adapter

`server/qloo/` talks to `https://hackathon.api.qloo.com` with GET requests and the `X-Api-Key` header. Before a request
goes out, `validate.js` checks every `/v2/insights` parameter against the entity type, because Qloo silently ignores a
parameter that does not apply (for example `filter.location.radius` on artists). Responses are cached in
`DATA_DIR/qloo-cache.sqlite` and never stored in this repo. Test fixtures in `test/fixtures/synthetic/` are hand-made
shapes with made-up ids, marked `"_synthetic": true`.

Key-day check (30 probes, writes only counts to `DATA_DIR/keyday-summary.json`):

```sh
QLOO_API_KEY=... node scripts/keyday.js data/dev/room-a.json data/dev/room-b.json --placebo data/dev/other-city.json
```

## Agent (`server/agent/`)

`POST /api/plan {venue_id, date}` streams Server-Sent Events: `step` (`{label}` in plain English), then one `result` or `error`.
`POST /api/ablate {venue_id, date, remove:[entity_id]}` re-ranks with those past shows switched off and returns `{shortlist, changed, of: 5}`.

- **Tools** (`tools.js`): `read_calendar`, `resolve_entities`, `build_pool`, `rank_pool`, `explain`, `ablate`, `also_loves`,
  `draft_offer`. Every mode calls the same tools; each output is kept in the session log.
- **Modes**, in this order under `AGENT_MODE=auto`:
  - `live`: Claude (`CLAUDE_MODEL`) runs the tool loop (`loop.js`, at most 8 turns) and answers through a `submit_plan` tool.
    Needs a key, room in the spend caps and in the IP limit. Each successful live run is saved to `DATA_DIR/recorded/`.
  - `recorded`: replays the saved live run for the same room and night, labelled with its date.
  - `scripted`: the same tools in a fixed order, text from templates, no LLM. Labelled "scripted plan (no LLM)".
- **Validator** (`validate.js`): every shortlisted `entity_id` must come from a tool output (and from the ranked pool), and every
  number in the text must appear in a tool output. The offer note keeps "Guarantee: ___" blank and has no money, ticket or
  manager wording. A rejected answer gets one more try with the errors; a second rejection ends in the scripted plan, with the
  reason in `fallbacks`.
- **Offer note**: addressed to the artist's booking agent, `sent: false` always. The page only offers "Copy". It speaks for the
  room ("Our crowd came for A and B. X sits right between them."), while the card's lines speak to the booker ("Your crowd
  came for ..."); the validator rejects "your crowd" in a note. `offer_note` is the note for the first pick; `offer_notes` holds
  one note per shortlisted act (the agent's own note for its act, the `draft_offer` template for the others).
- Without a Qloo key `/api/plan` sends a single `error` event (`qloo_not_connected`): nothing is ranked.
- Tests drive the live loop with a stand-in for the Messages API; they never call Claude.

## Spend caps and the IP limit (`server/budget/`)

- Every Claude response is booked from its `usage` block into `DATA_DIR/budget.sqlite`: uncached input and output at
  `CLAUDE_PRICE_IN_PER_MTOK` / `CLAUDE_PRICE_OUT_PER_MTOK`, cache writes at 1.25x input (2x for 1-hour writes), cache reads at 0.1x.
  A prompt over `CLAUDE_LONG_PROMPT_TOKENS` (uncached input plus cache writes and reads) is billed at the long-context prices.
- Both Claude calls (the agent loop and back-test ranker L) set top-level `cache_control`, so the repeated prefix is read from cache.
- When the day's spend (UTC day) reaches `DAILY_USD_CAP`, the month's (UTC calendar month) reaches `MONTHLY_USD_CAP`, the total
  reaches `TOTAL_USD_CAP`, or the day is past `ANTHROPIC_KEY_LAST_DAY`, no live call is made: the agent
  falls back to a recorded run, or to the scripted plan when none exists. `/api/health` shows the ledger.
- Each plan request counts against its IP; past `IP_DAILY_LIMIT` per UTC day the same fallback applies. `X-Forwarded-For` is read
  only when the connection comes from loopback (nginx on the same host). The ledger keeps a salted hash of the address, for the current day only.

## Back-test (`server/backtest/`, `scripts/backtest.js`)

`BACKTEST.md` is the pre-registered protocol, frozen on 11 Oct 2026 (planning repo commit `cb8ede1`), with Amendments 1 and 2
added the same day before any Qloo call. The copy here is unchanged. The code follows it; it does not change it. Data: `data/backtest/venues.csv`, `shows.csv` and `sources.md`.

- **Unit:** one S2 show (1 Jul to 30 Sep 2026) at a test room. **Positive:** its headliner under the headliner rule (`headliner.js`:
  whole title, then the part before the first listed separator, exact normalized match, no fuzzy matching). **Pool:** resolved
  headliners of every archive show in the show's 21-day window (`backtestWindow` in `server/rank/pool.js`: its Monday-to-Sunday week,
  the week before and the week after), minus the room's S1 headliners. The archive ends on 30 Sep 2026, so late windows are cut
  there; the output counts the shows whose window was cut, and how many of them fell under the minimum pool. Dropped shows are counted by
  reason: canceled, unresolved, repeat headliner, pool under 10.
- **Rankers:** Q (the room's S1 headliners as the taste signal), P (Qloo popularity only: a rough stand-in for draw; we have no ticket
  data), T (the 5 most frequent genre tags), L (Claude only, no Qloo; run only with a key and room in the spend caps, otherwise
  "not run"), R (random, analytic). Also each placebo room's signal on the same pools, and Q with the room's own place entity added
  (a leakage size, never the headline number).
- **Fixed choices:** one pool restriction for the whole run (`--restrict filter` or `take500`, decided by the key-day test), no
  popularity limit, equal weights. The product's 0.9 popularity ceiling for small rooms is a product choice and is not used here.
- **Metrics** (`metrics.js`): reciprocal rank, hit@5, percentile rank; rooms weigh equally. With fewer than 8 rooms the 95% interval
  resamples shows within each room (2,000 resamples, fixed seed), and the output says these intervals are too narrow. With 8 or more
  rooms it resamples rooms. Paired intervals for Q-P, Q-T, Q-L and Q minus each placebo.
- **Claim rule** in code: status `full` only with 8+ rooms, 300+ shows, and the Q-P and every Q-placebo interval clear of zero.
  Otherwise `pilot`, labelled "pilot (N = 3 rooms, n = ... shows)".
- **L sampling** (Amendment 2): L asks for temperature 0. If the model answers that with HTTP 400, the request is sent once more
  without it and the rest of the run uses the model's default sampling. The log then says "sampling: default (temperature not
  accepted)" and the L result is labelled "single draw".
- **Running it:** `node scripts/backtest.js --dry-run` counts shows and pool candidates per 21-day window with no Qloo call
  (`results/backtest-dryrun.json`: 176 test shows before drops, 14 windows with 41 to 79 distinct titles each before the headliner
  rule, 2 windows and 26 shows cut at 30 Sep). `node scripts/backtest.js --split test --restrict filter` is the single test run: it writes
  `results/backtest-test.json` (totals and per-room numbers only, no Qloo response, no artist list) and `results/backtest-test.log`
  (counts and codes). `DATA_DIR/backtest-test.lock` refuses a second run. There is no dev split.
- `GET /api/backtest` returns `results/backtest-test.json`, or `{status: "not-run"}`.

## Web page (`web/`)

Plain HTML, CSS and browser JavaScript, served by the same server. No framework, no build step, no outside scripts or fonts.

- **First screen:** Fine Line, or the first venue. One big line ("N dark nights in the next 60 days": the 60 nights from tomorrow),
  the strip of today plus those 60 nights (`?days=61`; dark nights are the dark squares, arrow keys move between them; today is
  tagged "today" where the month label would sit and cannot be picked),
  and a chip linking the venue's public calendar with its read date.
- **A dark night:** the agent's steps stream in, then the poster card: the date (`THU NOV 12`), five acts, one sentence each,
  and the "This room's crowd also loves" row in plain words (category, "shows up more here than at the city's average room",
  source). The lift numbers are only in the why? panel.
- **Draft offer** opens the note with "Not sent. Copy it to your own email." on top and a Copy button. Nothing is sent. The
  dialog has an act picker (first pick by default), and each act on the card has its own "draft offer" link.
- **why?** opens the evidence panel: contribution bars (explainability or leave-one-out), past-show chips that re-rank through
  `/api/ablate` ("2 of 5 changed"), the also-loves measurement, the pool, and every Qloo request with the key left out, its time
  and cache hit or miss. Shares and other technical terms appear only here.
- **Mode badges** are always on screen: "Agent: live (Claude)", "Agent: recorded run from <date>", "Agent: scripted plan (no LLM)",
  and "Qloo: live" or "Qloo: not connected". Without a Qloo key the page shows the calendar and an explanation, never a list.
  In test mode (`QLOO_MODE=fixture`) the badge reads "Qloo: synthetic test data". On a phone the three badges share one row in
  smaller type, each label wrapping inside its badge.
- **Back-test badge** reads `GET /api/backtest`: "Back-test: not run yet" until `results/backtest-test.json` exists,
  then "Back-tested on N rooms" with the label and intervals behind it.

## License

MIT
