# Back-test source notes (compiled by haiku-worker)

Scope: public pages only, for the pre-registered back-test in `BACKTEST.md`. Nothing here is a ranking result. No Qloo or LLM call was made.
Dates in the CSV are local show dates as printed. All fetch times are UTC.

## What was read
- **First Avenue archive** (`https://first-avenue.com/shows/?orderby=past_shows` and `/shows/page/<N>/?orderby=past_shows`). Pages were walked from page 5 upward (pages 1 to 4 start later than page 5, so they hold no rows in the window). Walk stopped when a page held no row on or after 2026-04-01. Rows dated 2026-04-01 to 2026-09-30 inclusive were kept, all rooms. De-duplicated by event URL.
- **Hideout** (Chicago): web.archive.org snapshots of `hideoutchicago.com/shows` (CDX query with from=20260301, to=20260731). The CDX rows are on `www.hideoutchicago.com/shows`, which redirects from the bare domain.
- **Black Cat** (DC): web.archive.org snapshots of `blackcatdc.com/schedule.html` (same CDX window). Captures with status 301 were skipped; the 200 captures of the same page were used.
- Raw HTML is cached only in the scratchpad folder, not in the project.

## Requests and etiquette
- User-Agent: `Mozilla/5.0 (research; dark-night-desk back-test)`. GET only. No API calls.
- Live requests per host (robots.txt and home pages included): first-avenue.com: 67, web.archive.org: 27, www.blackcatdc.com: 3, www.hideoutchicago.com: 2 (total 99; counted from requests.log, all live GETs, including ones of earlier test runs).
- Minimum gap between requests to the same host: 2.5 s. For Black Cat snapshots the gap was 30 s, because the robots.txt of blackcatdc.com declares `Crawl-delay: 30` for all agents (the snapshots are fetched from web.archive.org, but the crawl delay was applied as a precaution).
- No 403 or 429 response was received. The run would have stopped on either.

## robots.txt per host
- first-avenue.com: HTTP 200, parsed; crawl_delay(our UA)=None
- web.archive.org: HTTP 404 (no robots.txt; treated as allow-all)
- www.blackcatdc.com: HTTP 200, parsed; crawl_delay(our UA)=30
- www.hideoutchicago.com: HTTP 200, parsed; crawl_delay(our UA)=None
- Note: the First Avenue robots.txt disallows only AhrefsBot, MJ12bot, dotbot, Seekbot, SemrushBot and Yandex. Our agent is not in those groups. web.archive.org has no robots.txt (HTTP 404).

## Terms of use
- first-avenue.com: homepage HTTP 200 (fetched 2026-10-11T18:37:18Z); `Privacy Policy` -> https://first-avenue.com/?page_id=144279. robots.txt HTTP 200.
- www.hideoutchicago.com: homepage HTTP 200 (fetched 2026-10-11T18:37:21Z); `Privacy` -> /privacy. robots.txt HTTP 200.
- www.blackcatdc.com: homepage HTTP 200 (fetched 2026-10-11T18:37:52Z); `(icon or unlabelled link)` -> https://www.blackcatdc.com/shows/policy.html. robots.txt HTTP 200.
- The homepage footer and header links were checked for terms, privacy, legal, conditions and policy links. A link found there is listed above. No terms text was read beyond the homepage links, so no permission statement is claimed for any site.
- First Avenue: the only policy-type link on the homepage is "Privacy Policy", and it points to `https://first-avenue.com/?page_id=144279`. That URL returned HTTP 404 when this run fetched it (2026-10-11). No terms-of-use page was found. An earlier pass also reported 404 for `/terms-of-use/` and `/terms/`; those were not repeated here. First Avenue use terms are therefore **not verified**.
- Hideout: a "Privacy" link (`/privacy`) is in the homepage links. It was not opened, and no terms-of-use page was identified. Use terms are **not verified**.
- Black Cat: the linked page `https://www.blackcatdc.com/shows/policy.html` was opened (HTTP 200). It is a show-information page (COVID and show policy text), not a terms-of-use page. Use terms are **not verified**.
- No permission statement is claimed for any of the three sites.

## Placebo snapshot coverage
- hideout-chicago: CDX rows 6 (HTTP 200); captures: 20260312201840 ok shows=100  | 20260315174049 ok shows=100  | 20260415043945 ok shows=100  | 20260427040613 ok shows=100  | 20260509204158 ok shows=100  | 20260612211537 ok shows=100 
- black-cat-dc: CDX rows 21 (HTTP 200); captures: 20260308213705 ok shows=45 problems=['unparsed block: SHOW QUICK GUIDE Info about refunds, rescheduled shows, and cancelations.', 'blocks=46'] | 20260311085819 ok shows=43 problems=['unparsed block: SHOW QUICK GUIDE Info about refunds, rescheduled shows, and cancelations.', 'blocks=44'] | 20260312031633 skipped status 301 | 20260312122315 ok shows=43 problems=['unparsed block: SHOW QUICK GUIDE Info about refunds, rescheduled shows, and cancelations.', 'blocks=44'] | 20260319124947 skipped status 301 | 20260319124948 ok shows=41 problems=['unparsed block: SHOW QUICK GUIDE Info about refunds, rescheduled shows, and cancelations.', 'blocks=42'] | 20260417191310 ok shows=38 problems=['unparsed block: SHOW QUICK GUIDE Info about refunds, rescheduled shows, and cancelations.', 'blocks=39'] | 20260417191355 ok shows=38 problems=['unparsed block: SHOW QUICK GUIDE Info about refunds, rescheduled shows, and cancelations.', 'blocks=39'] | 20260419184327 ok shows=36 problems=['unparsed block: SHOW QUICK GUIDE Info about refunds, rescheduled shows, and cancelations.', 'blocks=37'] | 20260512044300 skipped status 301 | 20260514051347 ok shows=31 problems=['unparsed block: SHOW QUICK GUIDE Info about refunds, rescheduled shows, and cancelations.', 'blocks=32'] | 20260608181208 ok shows=40 problems=['unparsed block: SHOW QUICK GUIDE Info about refunds, rescheduled shows, and cancelations.', 'blocks=41'] | 20260610165505 ok shows=47 problems=['unparsed block: SHOW QUICK GUIDE Info about refunds, rescheduled shows, and cancelations.', 'blocks=48'] | 20260616130458 ok shows=46 problems=['unparsed block: SHOW QUICK GUIDE Info about refunds, rescheduled shows, and cancelations.', 'blocks=47'] | 20260625214848 ok shows=51 problems=['unparsed block: SHOW QUICK GUIDE Info about refunds, rescheduled shows, and cancelations.', 'blocks=52'] | 20260703195059 ok shows=46 problems=['unparsed block: SHOW QUICK GUIDE Info about refunds, rescheduled shows, and cancelations.', 'blocks=47'] | 20260721014555 ok shows=48 problems=['unparsed block: SHOW QUICK GUIDE Info about refunds, rescheduled shows, and cancelations.', 'blocks=49'] | 20260723211709 skipped status 301 | 20260723211741 ok shows=48 problems=['unparsed block: SHOW QUICK GUIDE Info about refunds, rescheduled shows, and cancelations.', 'blocks=49'] | 20260726055818 skipped status 301 | 20260726055929 ok shows=48 problems=['unparsed block: SHOW QUICK GUIDE Info about refunds, rescheduled shows, and cancelations.', 'blocks=49']

### hideout-chicago
- Snapshots used (timestamp, date, number of listed shows parsed): 20260312201840 (2026-03-12, 100); 20260315174049 (2026-03-15, 100); 20260415043945 (2026-04-15, 100); 20260427040613 (2026-04-27, 100); 20260509204158 (2026-05-09, 100); 20260612211537 (2026-06-12, 100)
- Gaps in S1 (1 Apr to 30 Jun 2026), a day is in a gap when the latest earlier snapshot is more than 21 days old or missing:
  - 2026-04-06 to 2026-04-15 (latest earlier snapshot: 2026-03-15, age 22 days on 2026-04-06)
  - 2026-05-31 to 2026-06-12 (latest earlier snapshot: 2026-05-09, age 22 days on 2026-05-31)

### black-cat-dc
- Snapshots used (timestamp, date, number of listed shows parsed): 20260308213705 (2026-03-08, 45); 20260311085819 (2026-03-11, 43); 20260312122315 (2026-03-12, 43); 20260319124948 (2026-03-19, 41); 20260417191310 (2026-04-17, 38); 20260417191355 (2026-04-17, 38); 20260419184327 (2026-04-19, 36); 20260514051347 (2026-05-14, 31); 20260608181208 (2026-06-08, 40); 20260610165505 (2026-06-10, 47); 20260616130458 (2026-06-16, 46); 20260625214848 (2026-06-25, 51); 20260703195059 (2026-07-03, 46); 20260721014555 (2026-07-21, 48); 20260723211741 (2026-07-23, 48); 20260726055929 (2026-07-26, 48)
- Gaps in S1 (1 Apr to 30 Jun 2026), a day is in a gap when the latest earlier snapshot is more than 21 days old or missing:
  - 2026-04-10 to 2026-04-17 (latest earlier snapshot: 2026-03-19, age 22 days on 2026-04-10)
  - 2026-05-11 to 2026-05-14 (latest earlier snapshot: 2026-04-19, age 22 days on 2026-05-11)
  - 2026-06-05 to 2026-06-08 (latest earlier snapshot: 2026-05-14, age 22 days on 2026-06-05)

Parsing notes for the placebo rooms:
- Hideout: each show is a CMS item (`show-name`, `show-start-date` with the year). The title is the `show-name` text, as printed.
- Black Cat: each show is a `div.show` block (`h2.date`, `h1.headline`, `h2.support`). The title is the `h1.headline` text only, with `<br>` turned into a space. Support lines (`h2.support`) are not in the title, so Black Cat titles are shorter than First Avenue or Hideout titles where the support acts are printed. Year inferred from the snapshot date: candidate years snapshot-1, snapshot and snapshot+1 are kept only if the printed weekday matches, then the nearest is chosen. One non-show block (a "Show quick guide" box) is skipped.
- Shows listed in several snapshots: the evidence snapshot is the last one dated before the show date that lists it. If no earlier snapshot lists it, the first later snapshot is used (the row is still kept). Rows using this fallback: 27 ({'hideout-chicago': 27, 'black-cat-dc': 0}).

## First Avenue parsing
- Each row is a `div.show_list_item`. Date from `div.month`, `div.day`, `div.year`. Room from `div.venue_name`. Title from the `h4 > a` text (`em` tags removed, entities decoded, non-breaking spaces turned into spaces). The subtitle in `h6` (for example a "Local Show" label) is not part of the title.
- The `div id="day-YYYY-M-D"` marker before each row was compared with the printed date: 565 of 565 kept rows agreed, 0 did not.
- Event page URL is the `h4 > a` href and is used as source_url.
- Page log:
- page 5: 10 blocks, 10 parsed, 0 in window, 2026-10-01..2026-10-03
- page 6: 10 blocks, 10 parsed, 5 in window, 2026-09-29..2026-10-01
- page 7: 10 blocks, 10 parsed, 10 in window, 2026-09-26..2026-09-29
- page 8: 10 blocks, 10 parsed, 10 in window, 2026-09-24..2026-09-26
- page 9: 10 blocks, 10 parsed, 10 in window, 2026-09-22..2026-09-24
- page 10: 10 blocks, 10 parsed, 10 in window, 2026-09-19..2026-09-22
- page 11: 10 blocks, 10 parsed, 10 in window, 2026-09-18..2026-09-19
- page 12: 10 blocks, 10 parsed, 10 in window, 2026-09-16..2026-09-17
- page 13: 10 blocks, 10 parsed, 10 in window, 2026-09-13..2026-09-15
- page 14: 10 blocks, 10 parsed, 10 in window, 2026-09-10..2026-09-12
- page 15: 10 blocks, 10 parsed, 10 in window, 2026-09-05..2026-09-10
- page 16: 10 blocks, 10 parsed, 10 in window, 2026-09-01..2026-09-04
- page 17: 10 blocks, 10 parsed, 10 in window, 2026-08-28..2026-09-01
- page 18: 10 blocks, 10 parsed, 10 in window, 2026-08-23..2026-08-28
- page 19: 10 blocks, 10 parsed, 10 in window, 2026-08-21..2026-08-23
- page 20: 10 blocks, 10 parsed, 10 in window, 2026-08-15..2026-08-20
- page 21: 10 blocks, 10 parsed, 10 in window, 2026-08-14..2026-08-15
- page 22: 10 blocks, 10 parsed, 10 in window, 2026-08-09..2026-08-13
- page 23: 10 blocks, 10 parsed, 10 in window, 2026-08-06..2026-08-08
- page 24: 10 blocks, 10 parsed, 10 in window, 2026-08-01..2026-08-06
- page 25: 10 blocks, 10 parsed, 10 in window, 2026-07-29..2026-08-01
- page 26: 10 blocks, 10 parsed, 10 in window, 2026-07-24..2026-07-29
- page 27: 10 blocks, 10 parsed, 10 in window, 2026-07-22..2026-07-24
- page 28: 10 blocks, 10 parsed, 10 in window, 2026-07-18..2026-07-21
- page 29: 10 blocks, 10 parsed, 10 in window, 2026-07-15..2026-07-18
- page 30: 10 blocks, 10 parsed, 10 in window, 2026-07-11..2026-07-15
- page 31: 10 blocks, 10 parsed, 10 in window, 2026-07-08..2026-07-10
- page 32: 10 blocks, 10 parsed, 10 in window, 2026-06-30..2026-07-08
- page 33: 10 blocks, 10 parsed, 10 in window, 2026-06-26..2026-06-28
- page 34: 10 blocks, 10 parsed, 10 in window, 2026-06-23..2026-06-26
- page 35: 10 blocks, 10 parsed, 10 in window, 2026-06-20..2026-06-22
- page 36: 10 blocks, 10 parsed, 10 in window, 2026-06-17..2026-06-20
- page 37: 10 blocks, 10 parsed, 10 in window, 2026-06-13..2026-06-17
- page 38: 10 blocks, 10 parsed, 10 in window, 2026-06-11..2026-06-13
- page 39: 10 blocks, 10 parsed, 10 in window, 2026-06-08..2026-06-11
- page 40: 10 blocks, 10 parsed, 10 in window, 2026-06-05..2026-06-08
- page 41: 10 blocks, 10 parsed, 10 in window, 2026-06-02..2026-06-05
- page 42: 10 blocks, 10 parsed, 10 in window, 2026-05-29..2026-06-02
- page 43: 10 blocks, 10 parsed, 10 in window, 2026-05-23..2026-05-28
- page 44: 10 blocks, 10 parsed, 10 in window, 2026-05-19..2026-05-23
- page 45: 10 blocks, 10 parsed, 10 in window, 2026-05-16..2026-05-18
- page 46: 10 blocks, 10 parsed, 10 in window, 2026-05-14..2026-05-16
- page 47: 10 blocks, 10 parsed, 10 in window, 2026-05-09..2026-05-13
- page 48: 10 blocks, 10 parsed, 10 in window, 2026-05-07..2026-05-09
- page 49: 10 blocks, 10 parsed, 10 in window, 2026-05-05..2026-05-07
- page 50: 10 blocks, 10 parsed, 10 in window, 2026-05-02..2026-05-05
- page 51: 10 blocks, 10 parsed, 10 in window, 2026-05-01..2026-05-02
- page 52: 10 blocks, 10 parsed, 10 in window, 2026-04-28..2026-05-01
- page 53: 10 blocks, 10 parsed, 10 in window, 2026-04-25..2026-04-28
- page 54: 10 blocks, 10 parsed, 10 in window, 2026-04-23..2026-04-25
- page 55: 10 blocks, 10 parsed, 10 in window, 2026-04-20..2026-04-23
- page 56: 10 blocks, 10 parsed, 10 in window, 2026-04-17..2026-04-19
- page 57: 10 blocks, 10 parsed, 10 in window, 2026-04-14..2026-04-17
- page 58: 10 blocks, 10 parsed, 10 in window, 2026-04-11..2026-04-14
- page 59: 10 blocks, 10 parsed, 10 in window, 2026-04-09..2026-04-11
- page 60: 10 blocks, 10 parsed, 10 in window, 2026-04-05..2026-04-08
- page 61: 10 blocks, 10 parsed, 10 in window, 2026-04-03..2026-04-05
- page 62: 10 blocks, 10 parsed, 10 in window, 2026-04-01..2026-04-03
- page 63: 10 blocks, 10 parsed, 0 in window, 2026-03-28..2026-03-31

## 5-event title check (First Avenue)
Five event pages were opened, chosen with a fixed random seed from the kept rows. Results:
- https://first-avenue.com/event/2026-04-the-astronomers/: list title `The Astronomers`; event page h1 `The Astronomers`; <title> `The Astronomers ★ 7th St Entry - First Avenue`; HTTP 200; h1 equal after normalization: True; list title contained in page title: True
- https://first-avenue.com/event/2026-06-by-storm/: list title `By Storm`; event page h1 `By Storm`; <title> `By Storm ★ 7th St Entry - First Avenue`; HTTP 200; h1 equal after normalization: True; list title contained in page title: True
- https://first-avenue.com/event/2026-04-oceanic-and-borderline/: list title `Oceanic and Borderline`; event page h1 `Oceanic and Borderline`; <title> `Oceanic and Borderline ★ 7th St Entry - First Avenue`; HTTP 200; h1 equal after normalization: True; list title contained in page title: True
- https://first-avenue.com/event/2026-06-the-last-dinner-party/: list title `The Last Dinner Party`; event page h1 `The Last Dinner Party`; <title> `The Last Dinner Party ★ Palace Theatre - First Avenue`; HTTP 200; h1 equal after normalization: True; list title contained in page title: True
- https://first-avenue.com/event/2026-06-dexter-and-the-moonrocks-mon/: list title `Dexter and the Moonrocks`; event page h1 `Dexter and the Moonrocks`; <title> `Dexter and the Moonrocks ★ Fine Line - First Avenue`; HTTP 200; h1 equal after normalization: True; list title contained in page title: True

## Row counts
Per venue_id (all rows; S1 = 1 Apr to 30 Jun 2026, S2 = 1 Jul to 30 Sep 2026):
- fa-7th-st-entry: 151 rows (S1 77, S2 74), canceled-flagged 0
- fa-fine-line: 110 rows (S1 62, S2 48), canceled-flagged 1
- fa-turf-club: 117 rows (S1 62, S2 55), canceled-flagged 1
- black-cat-dc: 58 rows (S1 58, S2 0), canceled-flagged 0
- fa-amsterdam-bar-hall: 19 rows (S1 15, S2 4), canceled-flagged 0
- fa-armory: 2 rows (S1 0, S2 2), canceled-flagged 0
- fa-first-avenue: 98 rows (S1 51, S2 47), canceled-flagged 1
- fa-grand-casino-arena: 1 rows (S1 0, S2 1), canceled-flagged 0
- fa-orpheum-theatre: 1 rows (S1 1, S2 0), canceled-flagged 0
- fa-palace-theatre: 19 rows (S1 11, S2 8), canceled-flagged 0
- fa-pryes-stage-at-schilling-amphitheater-at-the-west-end: 2 rows (S1 0, S2 2), canceled-flagged 0
- fa-state-theatre: 3 rows (S1 2, S2 1), canceled-flagged 0
- fa-surly-brewing-festival-field: 5 rows (S1 1, S2 4), canceled-flagged 0
- fa-the-cedar-cultural-center: 8 rows (S1 3, S2 5), canceled-flagged 0
- fa-the-fitzgerald-theater: 29 rows (S1 17, S2 12), canceled-flagged 0
- hideout-chicago: 100 rows (S1 100, S2 0), canceled-flagged 0
Test rooms per month (all rows, canceled rows included):
- fa-7th-st-entry: 2026-04 26, 2026-05 26, 2026-06 25, 2026-07 26, 2026-08 22, 2026-09 26
- fa-turf-club: 2026-04 24, 2026-05 21, 2026-06 17, 2026-07 16, 2026-08 16, 2026-09 23
- fa-fine-line: 2026-04 17, 2026-05 21, 2026-06 24, 2026-07 11, 2026-08 15, 2026-09 22
Other First Avenue rooms, rows per month (all rooms together): 2026-04 41, 2026-05 33, 2026-06 27, 2026-07 22, 2026-08 29, 2026-09 35.
Canceled or postponed flags are set from the title or slug only. Rows are kept, the protocol drops them later.

## Not done or not verified
- Capacity and operator for each venue are left empty with source `not verified`. No capacity or operator page was opened for this compilation.
- City for the First Avenue rooms is `not verified` (the protocol text gives "Minneapolis and St Paul" without a room-by-room city).
- Headliner resolution, the second-pass 10% check, and all Qloo steps are outside this task.

## Second-pass check (11 Oct 2026)
- A random 10% of test-room rows (38 of 378, seed 20261011) were checked against each row's live event page on first-avenue.com: title equals the page headline after normalization, the date appears on the page, the room name appears on the page.
- Result: 38 of 38 rows matched on all three. One request per row, 2.6 seconds apart.
- Room capacity and operator for the three test rooms come from First Avenue's own announcement (https://first-avenue.com/first-avenue-purchasing-fine-line/): "First Avenue owns and operates the 250-capacity 7th St Entry, the 350-capacity Turf Club, the 650-capacity Fine Line".
- Terms of use: no terms page was found on first-avenue.com (the only policy link returned 404). robots.txt allows this reading. In total about 105 page requests were made to first-avenue.com, spaced out. If First Avenue objects, the data is removed.
