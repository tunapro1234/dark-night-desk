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

## License

MIT
