# Dark Night Desk: back-test protocol (pre-registered)

Status: **FROZEN on 11 Oct 2026**, after the show data was compiled and checked and before any Qloo call on back-test data (no Qloo key existed yet).
The product's ranking module was written the same day, tested only on synthetic data; it does not change anything below. The commit hash of this version is quoted in the README.
Changes made after the freeze go to "Amendments" at the bottom, with a date and a reason. They must be made before the single test run.
## Question
For a show a venue actually booked, would a ranking built from **this room's past crowd** (Qloo taste signal) have put that show's
headliner near the top of the acts who were playing the same city that week? And does it beat simpler rankings that need no taste data?

This tests the product's core claim on real, already-played shows. It does **not** test ticket sales, artist availability, fees, or whether a booker would agree.

## This is a pilot
We looked for independent rooms whose played shows from April to September 2026 can be read from public pages (the venue's own site or web.archive.org
snapshots of it). Most calendars we checked in New York, Chicago, Washington and Seattle load through ticketing widgets, so the dates and acts
are not in the page, or the archive has gaps. One source passed: First Avenue's own past-shows archive in Minneapolis. The source notes are in `data/backtest/sources.md`.

So the sample is **3 rooms in one city**, and the result is labelled **"pilot (N = 3 rooms)"** from the start. The claim sentence below needs at least 8 rooms
and 300 test shows, so this pilot can never use it. We publish whatever comes out.

## Sample
- **Test rooms:** 7th St Entry (about 250), Turf Club (about 350) and Fine Line (about 650), Minneapolis and St Paul. All three are run by First Avenue,
  an independent company (not Live Nation, not AEG). Capacity sources are in `data/backtest/venues.csv`.
- **Source:** `https://first-avenue.com/shows/?orderby=past_shows` and its numbered pages, read once, politely (robots.txt allows it; at least 2 seconds between requests).
  Each row gives the date, the room and the show title. Ticketing platforms, Songkick, Bandsintown and social media are not used.
- **Placebo rooms (signal only, never tested):** Hideout (Chicago) and Black Cat (Washington, DC), read from web.archive.org snapshots of each venue's own calendar page.
- There are no dev rooms. Nothing is tuned on results (see "Fixed choices").

## Periods
- **S1 (signal):** 1 Apr to 30 Jun 2026. Headliners who played the room.
- **S2 (test):** 1 Jul to 30 Sep 2026. Shows listed in the archive, minus anything marked canceled or postponed.

## Headliner rule (fixed before any Qloo call)
1. Normalize a name: lowercase, strip accents and punctuation, drop a leading "the", collapse spaces.
2. Search the **whole show title** with Qloo `/search` (artist type). It resolves only if the top artist result's normalized name equals the normalized title.
3. If not, split the title at the first of these separators: " ft. ", " feat. ", " featuring ", " with ", " w/ ", " + ", " / ", ", ", " and ", " & ".
   Search the part before it with the same exact-match test.
4. Otherwise the show is dropped as "unresolved". There is no fuzzy matching and no hand fixing. Comedy, dance nights and other non-artist titles fall out here.

## Unit: one test show
For room *v* and an S2 show *s* on date *d*:
- **Positive:** the resolved headliner of *s*. Dropped if it is unresolved, or if the same artist already headlined *v* in S1. We are not measuring repeat bookings.
- **Pool:** resolved headliners of every show in the First Avenue archive (all rooms it lists, any size) in the **same Monday-to-Sunday week as *d***,
  minus anything that headlined *v* in S1. The positive is in the pool by construction. Shows with a pool smaller than 10 are dropped.
- Every dropped show is counted and reported, with the reason.

## Rankers (each one orders the pool for the show)
| Code | Ranker | What it uses |
|---|---|---|
| **Q** | Taste (the product) | `GET /v2/insights` with `filter.type=urn:entity:artist` and `signal.interests.entities` = *v*'s resolved S1 headliners (equal weights), restricted to the pool. *v*'s own place entity is **not** in the signal. |
| **P** | Popularity | Pool ordered by Qloo's popularity value only. A rough stand-in for draw. We have no ticket data. |
| **T** | Genre tags only | The most common genre tags of *v*'s S1 headliners as `signal.interests.tags`, with no entity signal. |
| **L** | LLM only, no Qloo | A Claude model given *v*'s S1 headliner names and the pool names, with a fixed prompt and temperature 0. Run only if the project's Claude key is available before the test run; otherwise reported as "not run". |
| **R** | Random | Analytic expectation for the pool size. |

## Fixed choices (no tuning)
- **Pool restriction for Q, T and P:** use `filter.results.entities` if the key-day test shows it returns the requested entities. Otherwise `take=500` and keep the pool members found;
  pool members missing from the result go to the bottom in pool order. This is decided by whether the API feature works, before any back-test metric is computed.
- No `filter.popularity` limit. Equal signal weights. For T, the 5 most frequent genre tags of S1 headliners (ties broken alphabetically).
- The run happens **once** and its log is committed.

## Metrics
- **Primary:** reciprocal rank (RR) of the positive, averaged per room, then averaged across rooms with equal weight (MRR).
- **Secondary:** hit@5 (positive in the top 5) and mean percentile rank (0 = top, 1 = bottom).
- **Uncertainty:** with 3 rooms a bootstrap over rooms is not meaningful. We resample **shows within each room** (2,000 resamples, fixed seed),
  keeping each room's count, and give a 95% interval for each ranker and each difference (Q−P, Q−T, Q−L, Q−placebo).
  Shows in the same room are not independent, so these intervals are too narrow. We say so next to every number.
- Per-room results are shown separately. Medians and IQR are also reported. No single example is shown in place of the distribution.

## Leakage and confound controls
1. **Placebo:** each test show's pool is also ranked with the S1 signal of Hideout and, separately, of Black Cat.
   If a placebo is about as good as Q (the Q−placebo interval includes 0), we report that the gain is general popularity or graph structure, not this room's crowd.
2. **Venue-entity variant:** Q is also run with *v*'s own place entity added to the signal. It is reported separately as a leakage size and is never the headline number.
3. **Temporal leakage, disclosed:** Qloo's graph may already contain S2-period data, and an LLM may have seen it in training. Neither can be fully removed. Both are stated in the README.
4. **Co-billing and one promoter:** artist-to-artist affinity may partly come from acts sharing the same rooms, and all three rooms share one booking company.
   The placebo partly catches this; it is stated as a limitation.

## Claim rule (written before results)
The sentence **"On real nights at N independent venues, ranking by the room's own crowd put the actual headliner higher than popularity alone did"**
is used only if all of these hold:
- N ≥ 8 venues and ≥ 300 test shows;
- the 95% interval for MRR(Q) − MRR(P) excludes 0;
- the 95% interval for MRR(Q) − MRR(placebo) excludes 0 for every placebo room.

This pilot does not meet the first condition, so the sentence is not used. The result is published as it came out,
labelled "pilot (N = 3 rooms, n = … shows)", with intervals, and the pitch rests on evidence and explainability.

## Data handling
- `data/backtest/shows.csv`: room, date, show title, resolved-headliner rule step, source URL, fetch date, compiled_by, checked_by.
  It comes from public pages only. Before the run, a second pass checks a random 10% of rows against the source page and records the result.
- **No Qloo response data in this repository.** Qloo responses stay in a private server-side cache. The repo holds only aggregate metrics and per-room summary numbers.
- No personal data. Venues and touring acts are public entities, and only billing names are used.

## Amendments
1. **11 Oct 2026, before any Qloo call. Pool window.** A dry run with no Qloo call counted 7 to 34 distinct show titles per Monday-to-Sunday week
   (most weeks 13 to 21) before the headliner rule. After name resolution and removing the room's own S1 headliners, many shows would fall under the
   minimum pool of 10 for reasons unrelated to taste. The pool for a show on date *d* is now the resolved headliners of every archive show in **the week of *d*,
   the week before and the week after** (21 days, Monday to Sunday), with the same exclusions. The archive data ends on 30 Sep 2026, so windows are cut there;
   the number of shows whose window is cut is reported. No result of any ranker was seen before this change.
2. **11 Oct 2026, before any Qloo call. Ranker L sampling.** If the Claude model used for L does not accept a `temperature` setting, L runs once with the
   model's default sampling, and the run log records which setting applied. Its result is then one draw, not a deterministic answer, and is labelled so.
3. **14 Oct 2026, before any Qloo call. Direction of "excludes 0".** In the claim rule, "the 95% interval ... excludes 0" means its lower bound is
   above 0. An interval wholly below 0 also excludes 0, but it means Q lost, and it never allows the sentence. The code had accepted both
   (`claimRule` in `server/backtest/metrics.js`); an outside review found it, and the code now checks the lower bound. This only makes the rule
   stricter; the thresholds are unchanged. No ranker has been run.
