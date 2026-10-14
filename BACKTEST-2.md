# Dark Night Desk: back-test Study 2 (pre-registered replication)

Status: **REGISTERED on 14 Oct 2026**, before any Study 2 show data was compiled and before any Qloo call on back-test data (the Qloo key has not arrived).
Study 1 (`BACKTEST.md`, frozen 11 Oct, pilot, N = 3 First Avenue rooms) is not changed by this file. Its result is reported as it comes out, separately, and is never pooled with Study 2.
Changes after registration go to "Amendments" at the bottom, with a date and a reason, and only before the single test run.

## Why a second study
Study 1 can never use the claim sentence: it has 3 rooms in one city, and the sentence needs at least 8 venues and 300 test shows.
Study 2 asks the same question with the same design on rooms we have not used, so that the claim rule can be tested at all.
If Study 2 also ends below the thresholds, it is reported as "pilot 2" with the same honesty rules, and the claim sentence is not used.

## Question (same as Study 1)
For a show a venue actually booked, would a ranking built from **this room's past crowd** (Qloo taste signal) have put that show's headliner near the top
of the acts playing the same city around that date? Does it beat simpler rankings that need no taste data?

## Venue selection (fixed before any show data is compiled)
A venue is **eligible** only if all of these hold. Every check is made on the source, never on Qloo data or on any ranking.
1. **Independent:** not owned or operated by Live Nation or AEG, by public evidence (venue site, operator site or press).
2. **Own public source:** dated show listings for the venue on the venue's or its operator's own site, or a machine-readable feed that site publishes
   (for example an events REST endpoint or an iCal feed), or web.archive.org snapshots of those pages.
   Ticketing platforms, Songkick, Bandsintown, setlist.fm and social media are not sources. Same rule as Study 1; setlist.fm is also out because
   a show appears there only if a fan logged it, which favours acts with many active fans and would bias the comparison with popularity.
3. **Permission:** the site's robots.txt allows the pages we read, and its terms of use do not forbid automated reading or reuse of the listings.
   If the terms are unclear or forbid it, the venue is not used. The check and its date go into `data/backtest2/sources.md`.
4. **Coverage:** at least 20 listed shows in S1 and at least 20 in S2, counted on the source before compiling, with no reading of acts' names for fit.
5. **Pool:** the city has at least one other eligible venue, so the pool is not made only of the room's own shows.
6. **Not Study 1:** the Minneapolis and St Paul metro area is excluded, so Study 2 shares no rooms and no pool source with Study 1.

The eligible list is committed as `data/backtest2/venues.csv` **before** any show list is compiled. Every eligible venue is used, up to 20 venues;
if more than 20 are eligible, the first 20 by the commit order of that file are used, and the order is fixed before compiling.

## Periods
- **S1 (signal):** 1 Apr to 30 Jun 2026. Headliners who played the room.
- **S2 (test):** 1 Jul to 30 Sep 2026. Shows listed, minus anything marked canceled or postponed.

## Unit, headliner rule and pool
- The headliner rule is Study 1's, unchanged (exact normalized match on Qloo `/search`, the fixed separator list, no fuzzy matching, no hand fixing).
- **Positive:** the resolved headliner of an S2 show. Dropped if unresolved, or if the same artist headlined the room in S1.
- **Pool:** resolved headliners of every compiled show in the **same metro area** in the 21-day window (the show's Monday-to-Sunday week, the week before and the week after),
  from all eligible venues in that metro, minus the room's own S1 headliners. The positive is in the pool by construction. Shows with a pool under 10 are dropped.
- Windows are cut at 30 Sep 2026; the number of cut windows is reported. Every dropped show is counted with its reason.

## Rankers
Q (taste, the product), P (Qloo popularity only), T (genre tags only), L (Claude only, no Qloo; Amendment 2 of Study 1 applies) and R (random, analytic),
exactly as defined in `BACKTEST.md`. The pool restriction method (`filter.results.entities` or `take=500`) is the one fixed by the key-day test, before any metric is computed.

**Placebo (changed from Study 1, because the sample now spans cities):** each test room gets one placebo room from **another** metro area in the sample,
assigned before any Qloo call with a seeded shuffle (seed 2, recorded in the run log). The placebo ranking uses the placebo room's S1 headliners as the signal
on the test room's pool. The venue-entity variant of Q is run and reported separately as a leakage size, never as the headline.

## Metrics and uncertainty
- **Primary:** reciprocal rank of the positive, averaged per room, then across rooms with equal weight (MRR).
- **Secondary:** hit@5 and mean percentile rank. Medians and IQR per room. Per-room results are shown.
- **Interval:** bootstrap over rooms (draw rooms with replacement, each drawn room keeps its own mean; 2,000 resamples, seed 1;
  `clusterBootstrap` in `server/backtest/metrics.js`). Differences Q−P, Q−T, Q−L and Q−placebo use paired per-show differences, then the same room bootstrap.
  The show-within-room interval (`stratifiedBootstrap`) is also printed, labelled as too narrow.

## Claim rule (written before any data)
The sentence **"On real nights at N independent venues, ranking by the room's own crowd put the actual headliner higher than popularity alone did"** is used only if:
- N ≥ 8 venues and ≥ 300 test shows remain after all drops;
- the 95% room-bootstrap interval for MRR(Q) − MRR(P) excludes 0;
- the 95% room-bootstrap interval for MRR(Q) − MRR(placebo) excludes 0.

Otherwise the result is published as it came out, with intervals, labelled "Study 2, N = … rooms, n = … shows", and the sentence is not used.
If Q − P holds but Q − placebo does not, we report that the gain looks like general taste-graph structure, not this room's crowd.

## Run discipline
- One run, after the data check below. The command, the commit and the full log are committed. No re-run on new settings.
- If the Qloo key arrives too late for a complete run before 27 Oct (feature freeze), Study 2 is reported as "registered, not run", with the compiled data counts.

## Data handling
- `data/backtest2/shows.csv`: venue, date, show title, resolved-headliner rule step, source URL, fetch date, compiled_by, checked_by.
  Before the run, a second pass checks a random 10% of rows (seed 3) against the source and records the result.
- Only performers' billing names are recorded. No other names and no personal data.
- No Qloo response data in this repository. Qloo responses stay in a private server-side cache; the repo holds only aggregate and per-room numbers.

## Amendments
(none)
