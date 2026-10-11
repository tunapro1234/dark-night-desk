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

## License

MIT
