# Dark Night Desk: operations

Back to the [README](../README.md).

## Settings

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
| `OUTBOUND` | `on` | `off` refuses to start when `QLOO_API_KEY`, `ANTHROPIC_API_KEY` or `ANTHROPIC_API_KEY_FILE` is set, or `AGENT_MODE` is `live` |
| `DAILY_USD_CAP` / `MONTHLY_USD_CAP` / `TOTAL_USD_CAP` | `2` / `12` / `30` | Claude spend caps (UTC day, UTC calendar month, all time) |
| `IP_DAILY_LIMIT` | `20` | requests per IP per day, counted apart for plans, crowd reads and ablate checks |
| `CLAUDE_PRICE_IN_PER_MTOK` / `CLAUDE_PRICE_OUT_PER_MTOK` | `0.1` / `0.5` | USD per million tokens, for the spend counter (Haiku 5.5) |
| `CLAUDE_LONG_PRICE_IN_PER_MTOK` / `CLAUDE_LONG_PRICE_OUT_PER_MTOK` | `0.5` / `2.5` | the same for a prompt over `CLAUDE_LONG_PROMPT_TOKENS` (`100000`) |

The server refuses to start on an invalid setting and prints what is wrong.

`GET /api/health` reports the modes, `outbound` (`on` or `off`), the spend ledger, `version` (from `package.json`) and `uptime`
(whole seconds since the process started).

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
- Each room becomes `fa-<room-slug>.json`. Existing file names, `capacity_band`, `city`, `locality` and `closed_weekdays` are kept; a new
  room gets `capacity_band: "unknown"`. `shows` is today to today plus 60 days, `past_shows` is the 90 days before today,
  `read_at` is the time of the run, `listed_until` is today plus 60 days, and `listing_complete` is true only for the four
  rooms in `COMPLETE_ROOMS`. A room the calendar no longer lists keeps its file with empty lists.
- All or nothing: any failed page stops the run before a write. Every file is checked against the venue schema, written to a
  temporary name and renamed into place. Raw pages are kept only in `DATA_DIR/raw-calendar/`, never in the repo. Test venues
  (`_synthetic`) and other files in `VENUES_DIR` are left alone.
- Exit codes: 0 done, 1 usage or configuration error, 2 stopped (robots.txt, 403/429, HTTP or parse failure).
- The server reads the venue files on every request, so `/api/venues` and the calendar show new data without a restart.

`deploy/dark-night-desk-refresh.service` (oneshot, `Nice=15`, same `WorkingDirectory` and `EnvironmentFile` as the server) and
`deploy/dark-night-desk-refresh.timer` (Sundays 21:30 server time, up to 20 minutes random delay, `Persistent=true`) run it
weekly. The repo does not install them; see [Deploy](#deploy-systemd).

Parser tests use only hand-written synthetic pages (`test/fixtures/synthetic/html/`) and a fake site; no real page is in the repo.

## Spend caps and the IP limit (`server/budget/`)

- Every Claude response is booked from its `usage` block into `DATA_DIR/budget.sqlite`: uncached input and output at
  `CLAUDE_PRICE_IN_PER_MTOK` / `CLAUDE_PRICE_OUT_PER_MTOK`, cache writes at 1.25x input (2x for 1-hour writes), cache reads at 0.1x.
  A prompt over `CLAUDE_LONG_PROMPT_TOKENS` (uncached input plus cache writes and reads) is billed at the long-context prices.
- Both Claude calls (the agent loop and back-test ranker L) set top-level `cache_control`, so the repeated prefix is read from cache.
- When the day's spend (UTC day) reaches `DAILY_USD_CAP`, the month's (UTC calendar month) reaches `MONTHLY_USD_CAP`, the total
  reaches `TOTAL_USD_CAP`, or the day is past `ANTHROPIC_KEY_LAST_DAY`, no live call is made: the agent
  falls back to a recorded run, or to the scripted plan when none exists. `/api/health` shows the ledger.
- Each plan request counts against its IP; past `IP_DAILY_LIMIT` per UTC day the same fallback applies. `GET /api/venues/:id/crowd`
  and `POST /api/ablate` also call Qloo: each has its own count per IP under the same limit, and past it answers 429
  (`ip_daily_limit`). `X-Forwarded-For` is read
  only when the connection comes from loopback (nginx on the same host). The ledger keeps a salted hash of the address, for the current day only.

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
  is reached the page keeps working with a recorded run or the scripted plan, and says so. Past `IP_DAILY_LIMIT` a crowd read
  or an ablate check is refused (429) and the page prints why.
- **A keyless public page:** set `OUTBOUND=off` (and `AGENT_MODE=recorded`) in the unit or the environment file. With no key the
  server sends no request to Qloo or Anthropic; `OUTBOUND=off` makes that a startup check, so a key added later stops the
  server with a config error instead of turning live calls on. `/api/health` then shows `"outbound": "off"`. It covers the
  two keyed APIs only: the calendar refresh unit reads the same environment file and still reads the venue's public calendar.
- The weekly calendar refresh:

```sh
sudo cp deploy/dark-night-desk-refresh.service deploy/dark-night-desk-refresh.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dark-night-desk-refresh.timer
systemctl list-timers dark-night-desk-refresh.timer
journalctl -u dark-night-desk-refresh
```
