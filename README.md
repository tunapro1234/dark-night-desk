# Dark Night Desk

fill the nights your venue sits empty

**A dark night is a night a music venue has no show listed.** Dark Night Desk reads a venue's public calendar, finds the
open nights with no show announced in the next 60 days, and for each one hands the booker five acts ranked by how well they
fit the room's own past crowd, using Qloo's taste graph. Each pick carries its evidence, and a draft offer note to the act's
booking agent is ready to copy. Nothing is ever sent. It is not an availability check (see [Limitations](#limitations)).

**Who it is for.** The talent buyer at an independent club room: the person who decides, weeks ahead, which act to offer for
an open early-week night. Payer, untested: the venue, or the booking software venues already use, licensing a fit score built
on Qloo. A night that gets a show is how we would judge it.

**The problem, measured.** At three of First Avenue's club rooms in the Twin Cities (7th St Entry, Fine Line, Turf Club),
181 of 549 nights from 1 April to 30 September 2026 had no show listed on the public calendar; 123 of those were Monday to
Wednesday. Counted by `node scripts/nothing-listed.js` from `data/backtest/shows.csv` (canceled rows left out). Private hires
do not appear on a public calendar, so this counts nights with nothing listed, not nights the room was shut.

**Where it sits.** Venue software like Opendate already suggests acts that have drawn well at venues comparable to yours.
Dark Night Desk asks a different question from public calendars and Qloo alone: would *this* room's crowd come out for them?
It answers with Qloo's cross-domain taste graph and shows the evidence behind every pick. A booker should want both answers;
we only test the second, and we have not compared the two.

| What | Status on 19 Oct 2026 |
|---|---|
| Dark nights from public calendars | works on real data: 10 rooms can be planned, in 5 metro areas (the 4 First Avenue club rooms in Minneapolis-St Paul, read 19 Oct 2026; Martyrs' and Maurer Hall in Chicago, ALICE and Loppen in Copenhagen, Yoshi's in Oakland, Off Broadway in St. Louis, read 18-19 Oct 2026) |
| Ranking, evidence, also-loves row, offer note | built and tested on synthetic data only; waits for the Qloo hackathon key |
| Study 1 (pilot, 3 rooms) | frozen 11 Oct 2026, not run |
| Study 2 (26 test rooms, 20 clusters, 8 metro areas) | registered 14 Oct 2026, data compiled, second check of 10% of rows done 19 Oct 2026 (925 of 931 match), not run |

Without a Qloo key the page replays recorded live runs, labelled with their date; a night with no recording shows the calendar
and ranks nothing. No ranking quality in this README is measured yet.

We count a win only if, at 8 or more independent venue groups and 300 or more real shows, this room's crowd ranks the act the
room really booked higher than popularity does, and higher than a room from another city does. See [Results](#results).

Venue calendars are read from each venue's public website. Dark Night Desk is not affiliated with any venue or artist.

## How it uses Qloo

Without Qloo nothing new is ranked: the page can only replay a live run recorded earlier, labelled with its date. One plan
makes this chain of calls to `hackathon.api.qloo.com`:

1. `/search` for each past headliner of the room. Only exact name matches are kept; ambiguous names are listed, never guessed.
2. `/v2/insights` with `filter.type=urn:entity:artist`, the room's past headliners as `signal.interests.entities` and the pool
   as `filter.results.entities`, with `feature.explainability` for the why? panel (leave-one-out when a response has none).
   For a room whose published capacity is at most 1,000 it adds `filter.popularity.max=0.9` (a product choice; the back-test
   sets no popularity limit). A room with no published capacity, or a larger one, gets no ceiling.
   The card prints "Sized to fit a room your size" only when this ceiling was sent.
3. `/v2/insights` again when past shows are switched off (the ablation behind "N of 5 changed").
4. "Also loves": `/v2/insights` for `urn:entity:movie`, `urn:entity:place` and `urn:entity:brand`, once with the room's signal
   and once with a neutral city signal; the difference is the lift. The place query has no location filter yet, so its
   categories are not limited to the room's city.

| Judging criterion | Where to look |
|---|---|
| Technological Implementation | [How it uses Qloo](#how-it-uses-qloo), [Agent](#agent-serveragent), [Qloo adapter](#qloo-adapter) |
| Design | [Web page](#web-page-web) |
| Potential Impact | [Who it is for and the problem, measured](#dark-night-desk), [Results](#results) |
| Quality of the Idea | [Where it sits](#dark-night-desk), [Notes for the Qloo team](#notes-for-the-qloo-team) |

## Results

Not run yet. Each study runs once after the Qloo key, and its result is published here as it came out, with its command,
commit and log. The pass mark and the pre-written sentence for a miss are in [Back-test results](#back-test-results).

## Run locally

Requires Node 22.13 or newer (the server uses the built-in `node:sqlite`).

```sh
git clone <this repo> && cd dark-night-desk
npm ci             # exact versions from package-lock.json
npm test           # synthetic fixtures only: no key, no network
npm start          # http://127.0.0.1:3020
```

Without `QLOO_API_KEY` the server starts with Qloo shown as "not connected". Without `ANTHROPIC_API_KEY` the agent replays
a recorded live run for that room and night when one exists, otherwise it runs as a labelled scripted plan. To try it with keys, export them in your own shell for that run
(`QLOO_API_KEY=... ANTHROPIC_API_KEY=... npm start`); never write them into a file inside the repo.
All settings are environment variables read in `server/config.js`; the table, the spend caps, the calendar refresh and the
systemd deploy are in [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Web page (`web/`)

Plain HTML, CSS and browser JavaScript, served by the same server. No framework, no build step, no outside scripts or fonts.

- **First screen:** the Turf Club scene line (eight Tuesdays in a row with nothing listed, counted from `data/backtest/shows.csv`
  and recounted by `test/demo-v1.test.js`), then a room. When a recorded live run exists for a listed room, the page opens on
  that room with the recorded card already rendered, no click (Turf Club's run first, if it has one); on a phone it scrolls to
  the card's top, on a wide screen only as far as brings the first act's name into view, never past the card's top. Otherwise it opens on
  Turf Club, or the first venue. One big line ("N dark nights in the next 60 days": the nights from tomorrow up to
  `listed_until`, so the 60 falls a little each day after a calendar read; later nights show as "not read yet"),
  the strip of today plus those 60 nights (`?days=61`; dark nights are the dark squares, arrow keys move between them; today is
  tagged "today" where the month label would sit and cannot be picked),
  and a chip linking the venue's public calendar with its read date. Nights with a recorded run carry a gold dot (the legend
  reads "recorded run: opens a saved card, no Qloo needed" with Qloo off). "Copy this week" copies plain text (date, acts in
  order, the first reason line, the mode badges) for the next 7 nights that already have a card in this visit or a recorded
  run, with no request on the click; it is disabled when there is none.
- **A dark night:** the agent's steps stream in, then the poster card: the date (`THU NOV 12`), one small line naming the rooms
  whose calendars the pool came from ("Acts from the calendars of <rooms>", at most four named, the rest counted), five acts, one sentence each,
  under each act where and when it played the city in the pool window ("Played <room>, <dates>"), and the "This room's crowd also loves" rows
  in plain words (category, "shows up more here than at the city's average room", source), brand categories first, labelled
  "Brand categories to pitch for this room's crowd". The lift numbers are only in the why? panel.
- **A booked night** has nothing to plan: picking it shows the room's crowd rows without starting a plan (from Qloo, or with Qloo
  off from the room's recorded run; no Claude call).
- **Draft offer** opens the note with "Not sent. Copy it to your own email." on top and a Copy button. Nothing is sent. The
  dialog has an act picker (first pick by default), and each act on the card has its own "draft offer" link.
- **why?** opens the evidence panel: contribution bars (explainability or leave-one-out), past-show chips that re-rank through
  `/api/ablate` ("2 of 5 changed"), the also-loves measurement, the pool, and every Qloo request with the key left out, its time
  and cache hit or miss. Shares and other technical terms appear only here.
- **Mode badges** are always on screen. Before a night is picked the agent badge reads "Agent: idle", or "Agent: idle (Qloo not
  connected)" when no plan can run for the room; a result carries "Agent: live (Claude)", "Agent: recorded run from <date>" or
  "Agent: fixed steps, no AI writing". The Qloo badge reads "Qloo: live", "Qloo: recorded <date>" on a recorded run, or "Qloo: not
  connected". Without a Qloo key a night with
  a recorded run shows that run, labelled with its date; any other night shows the calendar and says why there is no list.
  In test mode (`QLOO_MODE=fixture`) the badge reads "Qloo: synthetic test data". On a phone the three badges share one row in
  smaller type, each label wrapping inside its badge. A card that is not a live plan also says so itself, in a line under the
  room name ("Recorded run from <date>", "Fixed steps, no AI writing"), so it reads right when it is scrolled into view alone.
- **Back-test badge** reads `GET /api/backtest`: "Back-test: not run yet" until `results/backtest-test.json` exists,
  then "Back-tested on N rooms" with the label and intervals behind it.

## Agent (`server/agent/`)

`POST /api/plan {venue_id, date}` streams Server-Sent Events: `step` (`{label}` in plain English), then one `result` or `error`.
The page also sends `ask: true`, so the live agent may ask one question, and `answers` with the booker's reply.
`POST /api/ablate {venue_id, date, remove:[entity_id]}` re-ranks with those past shows switched off and returns `{shortlist, changed, of: 5}`.

- **Tools** (`tools.js`): `read_calendar`, `resolve_entities`, `build_pool`, `rank_pool`, `explain`, `ablate`, `also_loves`,
  `draft_offer`. The live and scripted modes call the same tools, and each output is kept in the session log; a recorded run
  replays the steps and result saved from a live run and calls no tool. The live agent picks its own tool order, and ends with
  one of three control tools in `loop.js`: `submit_plan`, `report_thin_signal` or `ask_booker`.
- **Decisions the live agent makes** (no fixed script does them):
  - *Ask the booker.* When a past headliner's name matches more than one artist and it matters to the plan, `ask_booker` stops the
    run; the page asks "Which one played here?" with up to 3 candidates from `/search`, and the plan runs again with the answer.
    The steps then read "Asked you: which <name>?" (in a replay: "Asked when this run was recorded: ...").
  - *Refuse a thin signal.* When fewer of the room's past headliners resolve than there are acts on the card (5),
    `report_thin_signal` ends the plan with no ranking; the page says "<day>: too little to rank on" and why.
  - *Check a one-show pick.* When `explain` shows one past show carrying about 60% or more of a pick's share, the agent calls
    `ablate` and the card says "Checked without <show>: <act> still ranks n of 5." or that the pick drops out of the top 5.
- **Modes**, in this order under `AGENT_MODE=auto`:
  - `live`: Claude (`CLAUDE_MODEL`) runs the tool loop (`loop.js`, at most 8 turns) and answers through a `submit_plan` tool.
    Needs a key, room in the spend caps and in the IP limit. Each successful live run is saved to `DATA_DIR/recorded/`.
  - `recorded`: replays the saved live run for the same room and night, labelled with its date.
  - `scripted`: the same tools in a fixed order, text from templates, no LLM. Labelled "fixed steps, no AI writing". Each card
    line picks one of a few plain wordings by the act's name, with the same facts, so five lines do not all read the same.
- **Validator** (`validate.js`): every shortlisted `entity_id` must come from a tool output (and from the ranked pool), and every
  number in the text must appear in a tool output. The offer note keeps "Guarantee: ___" blank and has no money, ticket or
  manager wording. A rejected answer gets one more try with the errors; a second rejection ends in the scripted plan, with the
  reason in `fallbacks`.
- **Offer note**: addressed to the artist's booking agent, `sent: false` always. The page only offers "Copy". It speaks for the
  room ("Our crowd came for A and B. X sits right between them."), while the card's lines speak to the booker ("Your crowd
  came for ..."); the validator rejects "your crowd" in a note. `offer_note` is the note for the first pick; `offer_notes` holds
  one note per shortlisted act (the agent's own note for its act, the `draft_offer` template for the others).
- Without a Qloo key `/api/plan` replays the saved live run for that room and night when one exists (labelled recorded), and
  otherwise sends a single `error` event (`qloo_not_connected`): nothing new is ranked.
- Tests drive the live loop with a stand-in for the Messages API; they never call Claude.

## Ranking core (`server/rank/`, no LLM)

- **Pool** (`pool.js`): headliners who played other rooms in the same city ("acts who played <city> this season"). The live product
  passes `today`: the window is the 90 days before today, and any act with a show announced in the city from today on (at another room
  or this one) is left out and counted as `excluded_booked_ahead`, since it is already booked into town. Without `today` the window is
  90 days before to 60 days after the night; the back-test uses its own 21-day window, see below. Acts from the room's own past program are
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
goes out, `validate.js` checks every `/v2/insights` parameter against the entity type, because, as Qloo's hackathon
developer guide says, a parameter that does not apply to the type (for example `filter.location.radius` on artists) gets
HTTP 200 with an empty list and no error. Responses are cached in
`DATA_DIR/qloo-cache.sqlite` and never stored in this repo. Test fixtures in `test/fixtures/synthetic/` are hand-made
shapes with made-up ids, marked `"_synthetic": true`.

Key-day check (30 probes, writes only counts to `DATA_DIR/keyday-summary.json`):

```sh
QLOO_API_KEY=... node scripts/keyday.js <room-a.json> [<room-b.json> ...] [--placebo <other-city-room.json>]
```

The arguments are venue files in the format under "Venues and dark nights" (an optional `keyday` field is described at the top of
`scripts/keyday.js`); no key-day venue file is in the repo, and `scripts/keyhour.js` builds its key-day rooms from Study 1's pool rooms.

Exit codes: 0 GO, 1 usage or configuration error, 2 no `QLOO_API_KEY`, 3 NO-GO.

`node scripts/keyhour.js` runs, in the order the protocols set,
a key check, the key-day check, Study 1, Study 2 and, with a Claude key, live plans (by default two per plannable room, at most 20),
saved as recorded runs. The page shows a recorded run only while its night is still dark and ahead, so the plans take each room's dark nights on or
after 18 Nov 2026 (`--plan-from`): a card recorded for one of those nights stays on the page through the judging weeks. It resumes from
`DATA_DIR/keyhour/checkpoint.json` after a stop. `node scripts/keyhour.js --dry-run` lists the steps and call estimates with no
network.

## Venues and dark nights

Each venue is one JSON file in `VENUES_DIR` (schema checked by `server/calendar/venues.js`; a file that fails is skipped and logged):

```json
{
  "id": "example-room", "name": "Example Room", "city": "Exampleville", "capacity_band": "250-500",
  "calendar_source_url": "https://example.org/calendar", "read_at": "2026-10-11",
  "closed_weekdays": [1], "listing_complete": true, "listed_until": "2026-12-10",
  "shows":      [{ "date": "2026-10-13", "headliner": "Synthetic Act 1", "source_url": "https://example.org/shows/2026-10-13" }],
  "past_shows": [{ "date": "2026-07-02", "headliner": "Synthetic Act 101", "source_url": "https://example.org/shows/2026-07-02" }]
}
```

`data/venues/` (the default `VENUES_DIR`) holds 41 room files. 15 are the rooms listed on First Avenue's calendar (the Minneapolis market, all filed under city "Minneapolis", which is the pool key; Turf Club also carries `locality: "Saint Paul"`, which the page and the offer note show), read on 19 Oct 2026 (first read 11 Oct)
from First Avenue's public calendar pages (GET only, a few requests at least 2.5 seconds apart). Each file keeps the next 60 days
as `shows` and the last 90 days as `past_shows`; postponed shows were skipped (`scripts/refresh-venues.js` rebuilds them, see [Calendar refresh](docs/OPERATIONS.md#calendar-refresh)). Titles are kept as the calendar printed them (letters outside ASCII are
stored as JSON `\uXXXX` escapes, so the files are plain ASCII and parse to the same text).

The other 26 (`s2-*.json`) were built by `scripts/import-venues.js` from local files only: the room's past program from
`data/backtest2/shows.csv` and an upcoming listing read from the room's own public calendar on 18-19 Oct 2026. Six of them can be
planned: Martyrs' and Maurer Hall (Chicago), ALICE and Loppen (Copenhagen), Yoshi's (Oakland, filed under the "San Francisco"
metro) and Off Broadway (St. Louis). The other 20 are Kings in Raleigh, whose listing is marked incomplete (`listing_complete: false`),
and 19 neighbour rooms of the same metros; they feed the city pool only. Showing Study 2 rooms in the product does not touch Study 2: of these
six, Martyrs' and ALICE are Study 2 test rooms; Loppen, Yoshi's and Off Broadway sit in clusters past the 20-cluster cap, so the
study does not test them; Maurer Hall is a pool room. `scripts/keyhour.js` runs Study 2 (step 4) before any live plan (step 5).

The page opens on Turf Club's first recorded run when it has one, otherwise on the first recorded run of another listed room,
otherwise on Turf Club (the room in its first-screen line) when it is present, otherwise on the first venue.

`closed_weekdays` uses 0 = Sunday. `shows` is the upcoming program read from the public calendar, `past_shows` is the room's own past
program (the only source for "this room's crowd"). `test/fixtures/synthetic/venues/example-room.json` is a hand-written test venue
(`"_synthetic": true`, made-up city and acts).

Two optional fields keep the calendar honest. `listing_complete: false` marks a room whose source lists only some of its shows:
First Avenue's calendar carries every show at its own four club rooms (First Avenue, 7th St Entry, Turf Club, Fine Line), but at
the theaters and partner rooms it lists only the shows First Avenue presents, so an empty night there is not an empty room.
Those 11 rooms, and the 20 imported rooms marked the same way, still feed the city pool, but `GET /api/venues` leaves them out and their calendar and plan routes answer 404.
`listed_until` is the last date the source was read for; nights after it are `unlisted`, not dark.

`GET /api/venues/:id/calendar?from=YYYY-MM-DD&days=60` returns every night in the window as `booked` (a show is listed),
`closed` (a weekday the room is always shut; not counted as empty), `unlisted` (after `listed_until`; nothing is known yet,
not counted as empty) or `dark` (open weekday, no show announced), plus `dark_count`
and the calendar source. `from` defaults to today and all date math is done in UTC, so the server time zone never shifts a night.
`days` is 1 to 120. Today's night carries `today: true`; with nothing booked its status is `today`, and empty nights before today
are `past`. Both are too late to book, so dark nights (and `dark_count`) start tomorrow, and `/api/plan` and `/api/ablate`
answer 409 for today, a past date, an `unlisted` night or any other night that is not `dark`.

## Limitations

- **A public calendar is not the room's diary.** Private hires, holds and shows announced late never reach it, so a dark night here is a night
  with no show announced, and the problem number counts nights with nothing listed, not nights the room was shut.
- **Ten rooms, five metro areas, read from their own calendars.** The four First Avenue club rooms were read on 19 Oct 2026 (first on 11 Oct) and the six imported rooms
  on 18-19 Oct 2026; nights after each room's `listed_until` show as "not read yet". Other rooms on First Avenue's calendar list only
  the shows First Avenue presents; they feed the pool but cannot be planned.
- **Thin pools in two cities.** The pool comes only from rooms whose past program is in `data/venues/`. Yoshi's pool is the acts of
  Bottom of the Hill and Make-Out Room; Off Broadway's is the acts of Blue Strawberry. The five acts can come from a different kind
  of room than the one being planned. The card says so: the line under the date names the rooms whose calendars the acts came
  from.
- **The pool is not availability.** "Acts who played <city> in the last 90 days, with no date announced in town" says nothing about routing,
  fees, radius clauses or whether an act is free that night. The booker still asks the agent.
- **The crowd is read only from the room's past headliners,** with equal weights. There is no audience, ticket or demographic data, by design.
- **Name matching is strict.** A headliner counts only when Qloo `/search` returns the same normalized name; ambiguous names are listed and
  left out, so small acts with common names drop out more often.
- **The back-test measures the ranking, not the agent.** It checks where Qloo's taste ranking puts the act a room actually booked. The Claude
  agent's wording and choices around that ranking are not scored. Study 1 is a pilot (3 rooms); Study 2 claims nothing unless its
  pre-registered thresholds are met.
- **Leakage cannot be fully removed.** Qloo's graph may already contain data from the test period, and a language model may have seen it in
  training. Artist-to-artist affinity may partly come from acts sharing the same rooms. The placebo rooms catch part of this; the
  venue-entity variant reports its size.
- **Popularity is a rough stand-in for draw;** we have no ticket data. Beating it says nothing about ticket sales.

## Back-test results

Nothing in this section is filled before the single test run of each study. Each study runs once; its command, commit and
log are committed, and its result is published as it came out.

**The pass mark.** The sentence

> "On real nights at N independent venues, ranking by the room's own crowd put the actual headliner higher than popularity alone did"

is used only if the pass mark above holds: 8 or more venue groups, 300 or more test shows after all drops, and this room's
crowd ahead of both popularity and another city's room, each by a 95% interval that stays above zero. The rule as written
before any data, with its intervals, is in [Claim rule, in full](#claim-rule-in-full).

**If it does not hold (written on 19 Oct 2026, before any run).** When the lower bound of the 95% interval for Q − P is at or
below 0, the Study 2 paragraph is this sentence, filled only from `results/backtest2-test.json`: "Ranking by this room's past
crowd did not beat popularity alone on N clusters: MRR difference <d>, 95% interval <lo> to <hi>. The
Desk still finds the dark nights and shows why each act came up; it does not predict draw." The first paragraph of this README
then says "ranked by closeness to the room's own past program in Qloo's taste graph" instead of "ranked by how well they fit the
room's own past crowd".

**Study 1, pilot (N = 3 rooms).** Not run yet. It can never use the claim sentence: it has 3 rooms in one city.

**Study 2 (registered replication).** Not run yet.
If the key arrives too late for a complete run before 27 Oct 2026, Study 2 is reported as "registered, not run", with the
compiled data counts in "Back-test, Study 2" below.

## Claim rule, in full

Written before any data, for both studies. The sentence

> "On real nights at N independent venues, ranking by the room's own crowd put the actual headliner higher than popularity alone did"

is used only if all of these hold: N ≥ 8 venues (in Study 2, N counts clusters: rooms that share an owner or house booker
count once) and ≥ 300 test shows remain after all drops; the lower bound of the 95% interval for MRR(Q) − MRR(P) is above 0;
and the lower bound of the 95% interval for MRR(Q) − MRR(placebo) is above 0 (for every placebo room in Study 1). An interval
wholly below 0 is a loss, never a pass (Study 1 Amendment 3, Study 2 Amendment 10). Study 2 uses the room-bootstrap interval
(clusters drawn with replacement, 2,000 resamples, seed 1). Otherwise the result is published with its intervals and its label,
and the sentence is not used. If Q − P holds but Q − placebo does not, we say the gain looks like general taste-graph
structure, not this room's crowd.

## Back-test, Study 1 (`BACKTEST.md`, `server/backtest/`, `scripts/backtest.js`)

`BACKTEST.md` is the pre-registered protocol, frozen on 11 Oct 2026 (planning repo commit `cb8ede1`), with Amendments 1 and 2
added the same day and Amendment 3 on 14 Oct, all before any Qloo call. The copy here matches the planning repo's. The code follows it; it does not change it. Data: `data/backtest/venues.csv`, `shows.csv` and `sources.md`.

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
- **Claim rule** in code: status `full` only with 8+ rooms, 300+ shows, and the lower bound of the Q-P and of every Q-placebo interval
  above zero. Otherwise `pilot`, labelled "pilot (N = 3 rooms, n = ... shows)".
- **L sampling** (Amendment 2): L asks for temperature 0. If the model answers that with HTTP 400, the request is sent once more
  without it and the rest of the run uses the model's default sampling. The log then says "sampling: default (temperature not
  accepted)" and the L result is labelled "single draw".
- **Running it:** `node scripts/backtest.js --dry-run` counts shows and pool candidates per 21-day window with no Qloo call
  (`results/backtest-dryrun.json`: 176 test shows before drops, 14 windows with 41 to 79 distinct titles each before the headliner
  rule, 2 windows and 26 shows cut at 30 Sep). `node scripts/backtest.js --split test --restrict filter` is the single test run: it writes
  `results/backtest-test.json` (totals and per-room numbers only, no Qloo response, no artist list) and `results/backtest-test.log`
  (counts and codes). `DATA_DIR/backtest-test.lock` refuses a second run. There is no dev split.
- `GET /api/backtest` returns `results/backtest-test.json`, or `{status: "not-run"}`.

## Back-test, Study 2 (`BACKTEST-2.md`, `server/backtest/study2*.js`, `scripts/backtest2.js`)

Study 1 can never use the claim sentence, so `BACKTEST-2.md` asks the same question with the same design on rooms we had not
used. It was registered on 14 Oct 2026, before any Study 2 show data was compiled and before any Qloo call; Amendments 1-14
(14-15 Oct) were all written before `venues.csv` was committed and before any show list was compiled. Study 2 shares no room and no
pool source with Study 1 and is never pooled with it.

- **Eligible venues:** independent (not owned or operated by Live Nation or AEG; the company names checked against are in `data/backtest2/ln-aeg.csv`), with dated listings
  on their own site or feed, or web.archive.org copies of those pages; robots.txt allows the pages and the terms do not forbid
  automated reading or reuse; at least 20 listed shows in each period; another eligible venue in the same metro area. The
  Minneapolis-St Paul metro and Study 1's placebo rooms are excluded. Every scouted venue and its verdict: `data/backtest2/candidates.md`.
- **Clusters:** rooms that share an owner or house booker form one cluster. N in the claim rule and the 20-cluster cap count clusters;
  MRR averages rooms within a cluster, then clusters with equal weight, and the interval draws clusters.
- **Pool:** resolved headliners of every compiled show in the same metro area in the show's 21-day window, minus the room's own S1
  headliners. **Placebo:** one room from another metro and another cluster per test room, assigned with a seeded shuffle (seed 2)
  before any Qloo call. **Rankers:** Q, P, T, L and R as in Study 1, plus P2 ("draw fits the room": the distance from the median
  popularity of the room's S1 headliners; descriptive, not a condition of the claim).
- **Compiled data (`data/backtest2/`):** `venues.csv` lists 100 rooms in 52 buildings across 18 metro areas; `shows.csv` holds 9,304
  rows from those buildings (3,818 of them cite a web.archive.org copy as their source). 46 clusters hold a test room; the cap keeps
  the first 20 in `venues.csv` order, in 8 metro areas (Amsterdam, Atlanta, Berlin, Boston, Bristol, Chicago, Cleveland,
  Copenhagen), with 26 test rooms. The test rooms of the other 26 clusters feed their metro pools only.
- **Dry run** (`node scripts/backtest2.js --dry-run`, no Qloo call, `results/backtest2-dryrun.json`): 1,539 S2 rows at the 26 test
  rooms before name resolution and the other drops; 106 metro windows, 16 of them cut at 30 Sep; no window under the minimum pool
  of 10 before name resolution. The 300-show threshold is counted after all drops, so it is known only after the run.
- **Before the run:** a second pass checks a random 10% of `shows.csv` (931 rows, seed 3, `node scripts/backtest2.js --check-sample`)
  against the source. Done on 19 Oct 2026 from the saved copies: 925 rows match, 6 do not (a doors time taken as the start, a postponed show, two presenter lines, and two description paragraphs read as extra rows). The result is in `checked_by`; the rows stay as compiled, so the run uses the data the pass measured (`data/backtest2/sources.md`, "Second pass").
- **Running it:** `node scripts/backtest2.js --restrict filter` (or `take500`, the key-day decision) is the single test run. It writes
  `results/backtest2-test.json` and `.log`, records the commit and the SHA-256 of the data files, accepts only bootstrap seed 1
  and 2,000 resamples, and `DATA_DIR/backtest2-test.lock` refuses a second run. Exit codes: 0 done, 1 usage, configuration or data
  error, 2 refused (lock or no Qloo key), 3 run stopped.

## Notes for the Qloo team

- From the developer guide, not seen by us: a `/v2/insights` parameter that does not apply to the entity type gets HTTP 200 with
  an empty list and no error, so a wrong filter looks the same as "no data". We check parameters against the type before sending
  (`server/qloo/validate.js`); a warning field in the response would tell the two apart for every team.
- The supply side seems open: a venue's own past program describes its crowd with no personal data, and turns Qloo's artist graph into a
  booking question ("who fits this room?"). We found no Qloo page that covers it.

## Data sources and credits

- **First Avenue's public calendar** (`first-avenue.com/shows/`, and its past-shows pages for Study 1), read with GET requests that
  follow robots.txt, at least 2.5 seconds apart. Dark Night Desk is not affiliated with First Avenue or any venue or artist.
- **Study 2 venues' own sites and feeds** (the 52 buildings in `data/backtest2/venues.csv`), read with one fetcher that follows
  robots.txt for our agent, for `*` and for every Anthropic agent, at least 2.5 seconds apart per host. Every request is counted in
  `data/backtest2/sources.md`. Venues whose terms forbid copying or automated reading, whose site builder's terms forbid scraping,
  or that answered with a bot check or a 403 were not used. Three slips are recorded in `sources.md`. During early scouting on
  14 Oct 2026, before that fetcher was written, 21 requests to five hosts went to paths their robots.txt disallows, and one more
  read a web.archive.org copy of such a page (chiefly a parser bug with wildcard rules, and a generic user agent that skipped the
  rules written for Claude's agents); none of those venues is in the study. One venue's events feed was read during the
  eligibility check while its show archive sat behind a bot check; that venue is not used. A few pages of one site whose terms
  forbid automated reading were read; nothing was saved. None of that data is used, and the fetcher used since then checks every
  one of those rule groups (`sources.md`, "Eligibility check").
- **Internet Archive Wayback Machine** (`web.archive.org`): the 2026 listings of Study 1's placebo rooms, and 3,818 of Study 2's
  9,304 rows, come from its snapshots (request gaps and pauses are in `data/backtest2/sources.md`). Thank you to the Internet Archive.
- **Terms of use.** No terms-of-use page was found on first-avenue.com (its only policy link returned 404), and none was identified
  on the sites of the Hideout (Chicago) and Black Cat (Washington, DC), Study 1's placebo rooms. Their terms are therefore **not
  verified**, and we have not asked the venues. The terms read for each Study 2 venue are in `data/backtest2/sources.md`. Those terms
  were read for the back-test; we have not checked them for showing upcoming listings. If a venue
  or a rights holder asks us to remove its data, we will remove it from this repository right away. Only billing names, dates and
  links are kept.
- **Qloo Insights API** (hackathon access) for taste data. Responses stay in a server-side cache and are never stored in this repo.
- **Anthropic API** (Claude Haiku 5.5) for the live agent. Open-source parts: Fastify, `@fastify/static`, `@anthropic-ai/sdk`.

## Related work

- Opendate's Smart Suggestions (September 2026) ranks artists who drew well at comparable venues. Dark Night Desk ranks by taste similarity to
  the room's past program, and its back-test (not run yet) checks that ranking against what rooms actually booked. We have not
  compared the two.
- Localify (Turnbull and colleagues, RecSys 2023 demo) recommends local artists to listeners, starting from artist-to-artist similarity.
  Dark Night Desk also starts from artist-to-artist similarity, but its user is the room's booker and its signal is the room's own past program.
- Willemsen and Liang (MuRS 2025) tailored a live concert program to the music profiles of the people attending. Here the "group" is a room's
  booking history, with no personal data.

## How this was built

Built by our three-person student team. AI coding agents wrote much of the code and compiled the back-test show lists from the
cited pages, under our direction; we set the questions, the pre-registration and the acceptance tests, and reviewed the results. The project started inside the hackathon's submission
period: first commit 11 Oct 2026.

## License

MIT
