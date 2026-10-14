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
All of these are dated 14 Oct 2026. They were written before `venues.csv` was committed, before any show list was compiled and before any
Qloo call. While scouting, we saw candidate venues' pages, including act names, stage names, date formats and rough counts of listed titles.
We looked nothing up in Qloo and rated no act for fit. No ranker has been run and no result of any kind exists. An outside review of a first
draft of this section (same day) shaped the wording below.
`data/backtest2/candidates.md`, committed before `venues.csv`, lists every scouted candidate venue with its eligibility under the registered
text and under these amendments. The claim rule's thresholds are unchanged. Amendments 1, 10 and 11 make the rule stricter; amendment 1 also
changes signals and room weights, which may help or hurt Q.
The Study 2 runner (metro pools, clusters, per-room placebo with seed 2) is not written yet: `server/backtest/run.js` is Study 1's. It is
written, with tests on synthetic data, and committed before compiling.

1. **Stages and operators.** A stage is its own room only if the source gives it in a separate field or filter, not only in title text. Each
   such room has its own S1 headliners and test shows and must meet coverage (§4) by itself. A stage that fails coverage is not a test room,
   but its shows stay in the metro pool. Rows held at another building are dropped (reason `off-site`). Operator means the owner or the
   company that books the shows; either one joins rooms into a **cluster**. N in the claim rule and the 20 cap count clusters. MRR averages
   rooms within a cluster, then clusters with equal weight, and the bootstrap draws clusters. §5 needs an eligible venue in another cluster.
   A placebo room comes from another metro and another cluster.
2. **Structured performer field.** Where the source publishes a structured performer field (schema.org `performer` in the page, or a performer
   or artist field in the site's own events feed), the headliner rule queries in this order, and the first exact match wins: (1) the first
   performer that is a person or group and whose normalized name is not the venue's or the operator's; (2) the whole title; (3) the title before
   its first separator. The step is recorded as `performer`, `title` or `split`. Without such a field the rule is Study 1's, unchanged.
3. **Local date.** A show's date is its start date in the venue's local time zone (the IANA zone is recorded in `venues.csv`). Start means the
   show time, or the doors time if that is all the source gives. A start between 00:01 and 04:59 belongs to the previous night. A start of
   exactly 00:00, or a date-only value, counts as no time given, and the listed date is used. Feeds that give UTC times are converted first.
4. **Non-music and untitled rows.** Words are matched after the headliner rule's normalization, as whole words: karaoke, trivia, quiz, open mic,
   open-mic, bingo, comedy, film screening, movie night, private event, closed, market, workshop, class, watch party. For coverage (§4), a row
   with an empty title or one of these words does not count. In the run, a row is dropped as `untitled` if its title is empty, and as
   `non-music` only if the word lies outside the name the headliner rule resolved. Dropped rows stay in `shows.csv` with a `drop_reason`
   column, so the 10% second pass can check them.
5. **P2, "draw fits the room" (descriptive).** P2 ranks the pool by the distance between an act's Qloo popularity and the median popularity of
   the room's resolved S1 headliners, smallest first; ties go to the more popular act, and acts tied on both keep pool order. Acts with no
   popularity value go to the bottom in pool order, as in P. It uses P's data and needs no extra call. MRR(P2) and Q − P2 are reported with the
   same intervals, next to Q − P. P2 is not a condition of the claim rule. "Q beats P2" means the lower bound of the Q − P2 interval is above 0;
   if it does not, the write-up says so beside any result. The share of tied P2 scores is reported.
6. **Comparisons with L.** A sentence that Q beat Claude alone (L) is written only if the lower bound of the 95% room-bootstrap interval for
   Q − L is above 0, and it is a separate sentence from the claim. For every ranker, the median of Qloo's popularity value over its top 5,
   across all test shows, is reported (descriptive).
7. **Same-room acts in the pool.** Per room, the median count of pool acts booked at the same room in the window is reported, and separately
   the count for the same cluster. Descriptive only; the pool rule is unchanged.
8. **Secondary splits (descriptive, never claimed).** MRR for Q, P and P2 split by (a) room size: capacity is the largest figure the venue or
   operator publishes for that room, recorded in `venues.csv` before compiling; at most 650 versus larger (650 is the largest Study 1 room);
   a room with no published figure is "size unknown", left out of the split and counted; (b) weekday, Monday to Wednesday versus Thursday to
   Sunday. The `/search` resolution rate is also reported by room size.
9. **Expert answers.** We are asking two researchers and one booker about the pool and the room profile. Any variant an answer could switch on
   is written here with its exact definition before the Qloo key arrives; an answer can only switch on a variant already written, and every
   variant switched on is reported whatever its result. None is written yet.
10. **Direction of "excludes 0".** In the claim rule, "excludes 0" means the lower bound of the interval is above 0 (Study 1 Amendment 3).
11. **Study 1 rooms.** §6 also excludes Hideout (Chicago) and Black Cat (Washington, DC), Study 1's placebo rooms, whose 2026 listings are
    already in Study 1's data.
12. **Runner choices (14 Oct 2026, later the same night).** The Study 2 runner is now written, tested on synthetic data only and committed
    (`server/backtest/study2.js`, `study2-data.js`, `scripts/backtest2.js`). An outside review of the runner found choices the text above does
    not fix. They are fixed here, still before `venues.csv` is committed, before any show list is compiled and before any Qloo call.
    - **No signal.** A test room with no resolved S1 headliner has no signal: its S2 shows are dropped (reason `no_signal`) and it is never
      a placebo. Without this, one such room would stop Q and the placebo for the whole study.
    - **Placebo.** The test rooms, in `venues.csv` order after the cap, are shuffled once with seed 2. A test room's candidates are the rooms
      after it in that order, wrapping round, in another metro and another cluster; the first is its assigned placebo. For each window,
      the placebo signal is that room's S1 headliners minus the window's pool, as Q's signal never overlaps the pool either. If nothing is
      left, the next candidate is used. The number of windows that moved to another candidate, and of acts removed, is reported. If a
      window has no candidate left, the placebo is not run and the claim sentence cannot be used.
    - **Cap.** The 20-cluster cap counts clusters that hold a test room, in `venues.csv` order. Test rooms of later clusters become pool
      rooms. Every listed venue feeds its metro pool and counts for §5.
    - **Venue and coverage.** A venue is the rooms that share a `building` in `venues.csv` (one room if it is empty). Coverage (§4,
      Amendment 4) is counted on `shows.csv`: rows not canceled, not off-site, with a title and with none of the Amendment 4 words. A room
      is a test room if and only if it meets coverage by itself, and a venue is eligible if its rooms together meet it. The run refuses
      to start if `venues.csv` disagrees with these counts; the file is then corrected, with the reason in `sources.md`.
    - **One unit per act and night.** A room's S2 rows with the same night and the same resolved headliner (a repeated listing, or early
      and late sets) count once; the rest are dropped (reason `duplicate`).
    - **Dropped rows.** Rows dropped as canceled, off-site, untitled or non-music leave the pool and the S1 signal as well as the test.
      An act whose only S1 row at the room was dropped is therefore not a repeat booking.
    - **Midnight.** A start written as exactly 00:00 with `Z` or an offset counts as a date with no time (Amendment 3), and its written
      date is used: feeds write date-only values that way. Impossible dates are rejected.
    - **Separator.** "Its first separator" (Amendment 2) means the first separator in Study 1's list order that occurs in the title, as in
      Study 1.
    - **Performer field.** "Person or group" means the entries the source types as a person or a group (schema.org `Person`,
      `MusicGroup` or `PerformingGroup`, or the feed's own artist or performer field). The venue's building name is skipped, like the
      venue's and the operator's.
    - **Popularity.** P and P2 use the popularity value in the resolving `/search` result, as in Study 1. The shares of positives and of
      pool members without a value are reported. P2's target is the median over the S1 headliners that have a value.
    - **Rankers on part of the sample.** T, P2 and the venue variant are reported over the rooms where they are defined (a room with no
      genre tag, no popularity target or no place entity is left out), with the room count; Q − T and Q − P2 use those rooms only. Q, P,
      the placebo and L must cover every tested room, or they are reported as not run.
    - **Smaller choices.** The `/search` resolution rate by size (Amendment 8) counts test rooms' S1 and S2 rows only. "Outside the
      resolved name" (Amendment 4) means the title with the first whole-word occurrence of the resolved name taken out. The top-5
      popularity median (Amendment 6) pools all test shows. Same-room counts (Amendment 7) leave out the show's own headliner. The splits
      (Amendment 8) are point MRRs, weighted by cluster like the headline. Cut windows are counted.
    - **Run discipline.** The test run accepts only bootstrap seed 1 and 2,000 resamples. Its log records the commit and the SHA-256 of
      both data files.
13. **Expert-answer variants (Amendment 9).** Three questions went out on 14 Oct 2026 (two researchers, one booker). These are the only
    variants an answer can switch on. A variant is switched on only if an answer recommends it in substance; the answer (quoted with
    permission, otherwise paraphrased) and the decision go into `sources.md` before the run, and the variant's code and synthetic tests
    are committed before the run. A switched-on variant is computed in the same single run and reported beside the headline, with the
    same intervals and drop counts, whatever its result. It never replaces the headline and is never a condition of the claim rule. If
    the headline's Q − P or Q − placebo lower bound is above 0 and the variant's is not, the write-up says so next to the claim sentence.
    - **V1, acts already seen in the city.** The pool also leaves out every act that headlined a counted S1 show at any listed venue of
      the metro (the room's own S1 headliners are already out). A test show whose headliner is such an act is dropped (reason
      `metro_repeat`). Windows whose pool falls under 10 are dropped as in the headline.
    - **V2, recent shows weigh more.** The room's S1 headliners are split by show date into older (1 Apr to 15 May 2026) and recent
      (16 May to 30 Jun 2026); an act with shows in both halves counts as recent. Each half ranks the pool as Q does. An act's score is
      (2 × its recent affinity + its older affinity) / 3, a missing affinity counting as 0; acts with no affinity in either half go to
      the bottom in pool order, and ties keep pool order. If one half is empty, the other half alone is used. The placebo is not changed.
    - **V3, no acts from large rooms.** For test rooms with a published capacity of at most 650, the pool also leaves out every act whose
      counted shows in the window are all at rooms with a published capacity of 1,500 or more. Acts with any show at a smaller room, or at
      a room with no published figure, stay. The positive always stays, since it played the test room. Other test rooms are unchanged.
