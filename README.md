# Dark Night Desk

fill the nights your venue sits empty

A dark night is a night the venue stays closed because nothing is booked. Dark Night Desk reads a venue's public calendar,
finds those nights, and helps the booker fill them.

Status: in development

## Run

Requires Node 22 or newer.

```sh
npm install
npm start          # http://127.0.0.1:3020
npm test
```

Without `QLOO_API_KEY` the server starts with Qloo shown as "not connected". Without `ANTHROPIC_API_KEY` the agent runs
as a labelled scripted plan. All settings are environment variables read in `server/config.js`:

| Variable | Default | Meaning |
|---|---|---|
| `HOST` / `PORT` | `127.0.0.1` / `3020` | loopback only |
| `DATA_DIR` | `./var` | local cache and spend ledger |
| `VENUES_DIR` | `data/venues` | one JSON file per venue |
| `QLOO_API_KEY` | none | Qloo hackathon API key |
| `QLOO_BASE_URL` | `https://hackathon.api.qloo.com` | no other host is accepted |
| `QLOO_MODE` | `live` | `fixture` is allowed only with `NODE_ENV=test` |
| `ANTHROPIC_API_KEY` | none | enables the live agent |
| `CLAUDE_MODEL` | `claude-sonnet-5-5` | |
| `AGENT_MODE` | `auto` | `auto`, `live`, `recorded` or `scripted` |
| `DAILY_USD_CAP` / `TOTAL_USD_CAP` | `2` / `30` | Claude spend caps |
| `IP_DAILY_LIMIT` | `20` | plan requests per IP per day |
| `CLAUDE_PRICE_IN_PER_MTOK` / `CLAUDE_PRICE_OUT_PER_MTOK` | `2` / `10` | USD per million tokens, for the spend counter |

The server refuses to start on an invalid setting and prints what is wrong.

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

`closed_weekdays` uses 0 = Sunday. `shows` is the upcoming program read from the public calendar, `past_shows` is the room's own past
program (the only source for "this room's crowd"). `test/fixtures/synthetic/venues/example-room.json` is a hand-written test venue
(`"_synthetic": true`, made-up city and acts).

`GET /api/venues/:id/calendar?from=YYYY-MM-DD&days=60` returns every night in the window as `booked` (a show is listed),
`closed` (a weekday the room is always shut; not counted as empty) or `dark` (open weekday, nothing booked), plus `dark_count`
and the calendar source. `from` defaults to today and all date math is done in UTC, so the server time zone never shifts a night.
`days` is 1 to 120.

## Ranking core (`server/rank/`, no LLM)

- **Pool** (`pool.js`): headliners who played other rooms in the same city from 90 days before to 60 days after the night
  ("acts who played <city> this season"; the back-test uses the Monday-to-Sunday week instead). Acts from the room's own past program are
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

## Spend caps and the IP limit (`server/budget/`)

- Every Claude response is booked from its `usage` block into `DATA_DIR/budget.sqlite`: uncached input and output at
  `CLAUDE_PRICE_IN_PER_MTOK` / `CLAUDE_PRICE_OUT_PER_MTOK`, cache writes at 1.25x input (2x for 1-hour writes), cache reads at 0.1x.
- When the day's spend (UTC day) reaches `DAILY_USD_CAP` or the total reaches `TOTAL_USD_CAP`, no live call is made: the agent
  falls back to a recorded run, or to the scripted plan when none exists. `/api/health` shows the ledger.
- Each plan request counts against its IP; past `IP_DAILY_LIMIT` per UTC day the same fallback applies. `X-Forwarded-For` is read
  only when the connection comes from loopback (nginx on the same host). The ledger keeps a salted hash of the address, for the current day only.

## License

MIT
