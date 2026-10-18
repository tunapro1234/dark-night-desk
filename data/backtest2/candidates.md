# Study 2 candidate venues

This file lists every venue scouted for Study 2 (`BACKTEST-2.md`). For each one it gives the verdict under the registered text (§1-6)
and under the Amendments, which bind. It was first committed before `venues.csv` and before any show list was compiled; this version
adds the venues settled on 17-18 Oct 2026 from saved copies. No Qloo call has been made, no act has been rated for fit, and no ranker
has been run.

Checked 14-16 Oct 2026 by reading each venue's own pages, or web.archive.org copies of them, with a robots-enforced fetcher
(robots.txt read for our agent, for `*` and for every Anthropic agent; at least 2.5 s between requests to a host). Request counts,
robots results and the terms of use read for each site go into `data/backtest2/sources.md`. Counts are listed shows in S1
(1 Apr-30 Jun 2026) and S2 (1 Jul-30 Sep 2026) at the local date (Amendment 3), after the Amendment 4 rules (canceled, off-site, untitled
and non-music rows removed). A count marked ≥ is a lower bound: the rows confirmed on pages, where the source could not be read in full.
These are pre-compile counts. The run counts again on `shows.csv` and refuses to start if a room's role disagrees (Amendment 12).
The role corrections of 17 Oct 2026 (Result) use the compiled counts, and so do the operator and role corrections of 18 Oct 2026.
The venues settled or re-admitted on 17-18 Oct were counted offline, with no request of their own, on copies saved by the same
fetcher (web.archive.org copies on 17-18 Oct under its 30 s archive rule). The show lists of the 8 new buildings inside the cap (Center
Stage, Green Mill, Martyrs', Reggies, Old Town School of Folk Music, Beachland, Music Box, Amager Bio & BETA) were compiled on 18 Oct
from those saved copies and the venues' own pages, with no web.archive.org request (own-site requests: Green Mill 6, Reggies 4,
Beachland 456, the others none). Their table rows give the compiled counts and the settle or re-admit counts they replace where these
differ; every role holds on the compiled counts.
Owners and bookers are named by company or role, never by private name.

## How the rules were read (fixed before compiling)
The readings are Amendment 14 of `BACKTEST-2.md` (15 Oct 2026), committed before this file and before any show list. Each rests on the
text's own words or on a published definition; Amendment 14 gives the reasons. Below is where each one decides a venue.
1. **Operator (§1, Amendment 1).** The operator is the owner or the house booker: the company the venue names as its booker, or one
   company that presents more than half of the room's counted S1 and S2 shows. A disclosed Live Nation or AEG stake of 50% or more counts
   as Live Nation or AEG. Decides Cafe du Nord (Live Nation presents most shows) and Blueberry Hill Duck Room (booked by The Pageant's
   company, 50% Live Nation). evenko, 49% Live Nation, presents a minority of Théâtre Fairmount's rows and does not decide it. Outside
   promoters that present some nights are named in the tables and join no cluster.
2. **Public evidence (§1).** §1 passes when no public source names a Live Nation or AEG owner or house booker and the venue's own booking
   contact and ticketing show none. An owner no public source names is recorded as not identified (529, Nice'n'Sleazy); a shared owner
   with another venue can then be neither shown nor ruled out.
3. **Terms (§3).** Terms that forbid copying, reproducing or republishing the site's content, or license it for personal viewing only,
   mean the venue is not used. A bare "©" or "All rights reserved" is not terms; any text on the site that forbids copying or reuse is.
   Decides Eddie's Attic, Station Inn, Replay Lounge, HI-FI, The Vogue, Band on the Wall and Cornerstone.
4. **Platform terms (§3).** A platform's terms count when their own text reaches visitors of a site it hosts for a customer, or when
   that is unclear. Out: the Fatsoma-built sites (Deaf Institute, Gorilla), the Music Glue-hosted site (Hug & Pint), the
   Squarespace-built sites (The Lilypad, Hyde Park Book Club, Button Factory, Théâtre Fairmount), the Wix-built site (The Grand
   Social) and the sites built by Rockhouse Partners, an Etix company (Larimer Lounge, Kung Fu Necktie, Old Rock House and 15 more:
   their pages say "Powered by ROCKHOUSE PARTNERS an ETIX company", some link Etix's own policy pages as theirs, and those pages
   serve no readable text to us). Weebly's terms leave the sites it hosts to their own terms, so they do not decide Make-Out Room.
   Webflow's say it "does not have a direct relationship with any of your End Users", and its scraping ban covers only material
   "outside of what is intentionally made available", so they do not decide Horseshoe Tavern.
5. **Bot checks (§3).** A bot check or a 403 in front of a site's show listings means the venue is not used, and its listings are not
   read through any other path, web.archive.org included. Decides Lodge Room (its show archive is behind a bot check; its open events
   feed was not used), Old Rock House (a 403 from its host during the check), The Garage in Glasgow (one web.archive.org copy of its
   gig listing, 13 Mar 2026, is a hosting check page, "Please wait while your request is being verified", and other copies that month
   suggest the whole site was behind it; the check was served to the Archive, not to us, but we cannot tell how long it stood, so the
   venue is not used and its copies are not read) and the blocked sites listed at the end. We never tried to get past one.
6. **Metro (§5, §6).** The US metropolitan statistical area of OMB Bulletin 23-01, Statistics Canada's census metropolitan area, or else
   the OECD-EU functional urban area, named by its core city. Somerville and Cambridge are Boston, Berkeley is San Francisco (the San
   Francisco-Oakland-Fremont MSA), Decatur is Atlanta, Ardmore is Philadelphia; Lawrence and Ann Arbor are their own metros, apart
   from Kansas City and Detroit.
7. **Rooms (Amendment 1).** A room named in a field of its own, other than the title, is a room; a filter counts only if it can place
   the S1 and S2 rows. Pumpehuset's location filter covers only the coming programme, so Pumpehuset is one room; VEGA's room filter
   places past rows, so its rooms are split; so are Tranzac's (an event field) and Festsaal Kreuzberg's (a location field). Rows of a
   split venue with no room go to one pool room of the same building.
8. **Pool-only venues.** A venue whose rooms meet coverage only together is listed with role `pool`, also in a metro with no test
   room, because every eligible venue feeds its metro pool (VEGA; Tranzac and Festsaal Kreuzberg until the 17 Oct role corrections).

## Result
46 clusters hold a test room among the rooms listed in `venues.csv`, in 18 metros. The 20-cluster cap of `BACKTEST-2.md` keeps the
first 20 in `venues.csv` order, in 8 metros (Amsterdam, Atlanta, Berlin, Boston, Bristol, Chicago, Cleveland, Copenhagen); the cut
falls in Copenhagen, after ALICE. The test rooms of the other 26 clusters are pool rooms in the run (Amendment 12). Counting also the
venues found eligible after the cap and not listed (below), 61 clusters hold a test room, in 23 metros, or 62 in 23 metros if
Portland's True West and Mississippi Studios rooms are two clusters (below). The table includes the role corrections of 17 and 18 Oct 2026, made on the compiled show
lists, and the venues settled on 17-18 Oct (below), whose roles the compiled lists of 18 Oct confirm. Every listed venue still feeds its
metro pool and counts for §5.

| Metro | Test rooms kept (one cluster each) | Test rooms capped (pool in the run) | Pool-only rooms |
|---|---|---|---|
| Amsterdam | Bitterzoet, Cinetol (Zaal), OCCII | | Cinetol (Etage, house room), Tolhuistuin (8 rooms) |
| Atlanta | 529, The EARL | | Center Stage (Center Stage Theater, The Loft, Vinyl, house room) |
| Berlin | Badehaus, Festsaal Kreuzberg (Festsaal), Privatclub, Urban Spree | | Festsaal Kreuzberg (Biergarten, Gewächshaus, Kaminzimmer, Ostflügel, house room) |
| Boston | Arts at the Armory (Performance Hall, ROOTED Cafe), The Burren (Back Room, Front Room), Club Passim, The Rockwell | | Arts at the Armory (B5 Lavender Room, house room) |
| Bristol | The Louisiana | | Trinity Centre (5 rooms) |
| Chicago | Green Mill, Martyrs', Reggies (Rock Club, Music Joint, Banannas Comedy Shack) | | Reggies (Trainwreck Rooftop Deck), Old Town School of Folk Music (Maurer Hall, Szold Hall, house room) |
| Cleveland | Beachland Ballroom and Tavern (Ballroom, Tavern), Music Box Supper Club (Concert Hall, Supper Club) | | Beachland Ballroom and Tavern (This Way Out, house room) |
| Copenhagen | ALICE | Loppen, Pumpehuset | VEGA (5 rooms), Amager Bio & BETA (Amager Bio, Beta, house room) |
| Leeds | | Brudenell Social Club, The Wardrobe | |
| Manchester | | The Castle Hotel, Night & Day Cafe, YES (The Pink Room, Basement) | YES (Roof Terrace, Bar, house room) |
| Milwaukee | | Cactus Club, Linneman's Riverwest Inn, The Pabst Theater | |
| Montreal | | Le Ministère, Turbo Haus | |
| Philadelphia | | MilkBoy Philadelphia, PhilaMOCA | |
| Raleigh | | Kings, The Pour House | |
| San Francisco | | Bottom of the Hill, Make-Out Room, Yoshi's | |
| St. Louis | | Blue Strawberry, Off Broadway | |
| Toronto | | Horseshoe Tavern, Tranzac (Living Room, Main Hall, Southern Cross, Zine Library) | Tranzac (house room) |
| Vancouver | | The Pearl, Rickshaw Theatre, Rio Theatre | |

`venues.csv` lists the rooms by metro, then by `venue_id`. That order is fixed before compiling. The cap keeps the first 20 clusters
with a test room in that order, and the order sets the seed-2 placebo chains (Amendment 12); both are derived again from the file if a
role changes.

**Roles corrected on the compiled show lists (17 Oct 2026).** The show lists of 22 of the 24 buildings with a live source were
compiled in full on 17 Oct; Tranzac's is compiled except 1-15 April, and Lizard Lounge's could not be read (Amendment 12 checks
every role against `shows.csv`). Six rooms listed as pool meet coverage by themselves and are
test rooms: Cinetol's Zaal (74 / 57), Festsaal Kreuzberg's Festsaal (30 / 21) and Tranzac's Southern Cross (183 / 252), Living Room
(46 / 57), Main Hall (30 / 26) and Zine Library (22 / 26). Tranzac's list still lacks 1-15 April (its sitemap starts on 16 April;
those nights can come only from web.archive.org copies), and more rows can only raise these counts. Lizard Lounge is not used: on
17 Oct its events feed answered with a 403 Cloudflare check page (reading 5), so it leaves; Boston keeps four other clusters. Cinetol
and Festsaal Kreuzberg sort before the cut and enter it; on 17 Oct The Castle Hotel became the last kept cluster and Night & Day Cafe
the first capped one, with the cut still in Manchester. The compiled counts of other rooms differ from the
pre-compile counts in the tables (for example Rickshaw Theatre 40 / 29, The Pabst Theater 21 / 22, Trinity Centre 54 / 38 for the
building); every one of them keeps its role.

**Operators and roles corrected on the compiled show lists (18 Oct 2026).** These corrections are recorded only here; the table
rows refer here.
- The Burren's Front Room is a test room: 131 / 112 on the compiled list (Back Room 135 / 114). The scouting counts came from one
  copy of 21 May and were lower bounds. The Burren stays one cluster with two test rooms.
- The EARL's operator is Triple D's, its house booker: Triple D's presents 91 of the 102 compiled rows (the counted rows are S1 57, S2 44). 529's rows
  all name '529' as presenter, so 529 and The EARL stay two clusters and Atlanta keeps §5. Zero Mile, which presents 3 of The EARL's
  rows, is an AEG name on the presenter check, so under the literal reading of Amendment 1 The EARL leaves on §1 (estimate below).
- Tolhuistuin's house bookers are set per room on the compiled list: Parallel presents 0.957 of the Club's rows, Paradiso 0.902 of
  the house room's and Podcastnetwerk 0.588 of the Tuinhuis's. They are house bookers, not the owner, and every room is still pool
  (compiled: house room 87 / 45, IJzaal 34 / 12, Club 18 / 5, Tuin 14 / 26, other rooms fewer), so the open question of the Club
  reaching 20 / 20 is closed.
- Tranzac's 1-15 April gap was filled on 18 Oct from the saved copies as far as they go (27 rows; no night of 1-15 April is
  complete): Southern Cross 194 / 252, Living Room 47 / 57, Main Hall 31 / 26, Zine Library 25 / 26, house room 15 / 7. Roles unchanged.
- Beachland Ballroom and Tavern's operator is written as 'Beachland Ballroom & Tavern' for its four rooms.

**The cap after the 17-18 Oct settle.** The settle and re-admit runs of 17-18 Oct (see "Where the check stopped") add 8 buildings
inside the cap: Center Stage (Atlanta, pool only), Green Mill, Martyrs', Reggies and Old Town School of Folk Music (Chicago; Old Town
pool only), Beachland Ballroom and Tavern and Music Box Supper Club (Cleveland, each the other's §5 partner), and Amager Bio & BETA
(Copenhagen, pool only). Chicago and Cleveland add 5 test clusters before Copenhagen, so the cut moves from Manchester to Copenhagen:
ALICE is the 20th kept cluster, and Loppen, Pumpehuset, Brudenell Social Club, The Wardrobe and The Castle Hotel are now capped
(the draft `venues.csv` of 18 Oct; Rooms at the line gives what could still move the cut).
On 18 Oct the 8 buildings were compiled and merged with the others into a draft `shows.csv` of 9,250 rows, with a draft `venues.csv` of
100 rooms. A dry run of the runner on that draft gives the same cap: 20 clusters with 26 test rooms and 1,578 S2 test rows (1,539 live),
ALICE the 20th; 26 clusters with 30 test rooms are capped. It finds no room whose majority presenter is not its listed operator
(Rival Entertainment presents 0.533 of The Loft's counted rows, 0.52 of Center Stage Theater's and 0.767 of Vinyl's) and 1 coverage
problem: Off Broadway (St. Louis) had no row on that draft. Its show list was compiled later that night from 60 saved
web.archive.org copies (the 16 May listing and 59 show pages), with no request: 54 rows, counted 26 / 28, so it meets coverage and
stays a test room, capped (St. Louis sorts after the cut). A second merge with it, a draft `shows.csv` of 9,304 rows from 52 buildings
(the merge reads 53 building lists; Lizard Lounge's has no row),
and its dry run (18 Oct, 23:02) give the same cap again: 20 clusters with 26 test rooms and 1,578 S2 test rows (1,539 live), 26
clusters with 30 test rooms capped, 0 coverage problems and 0 rooms whose majority presenter is not the operator.

**Eligible after the cap, not in `venues.csv`.** The same runs found venues eligible in metros that sort after Copenhagen. They are
not added to `venues.csv` and their show lists are not compiled (decided 18 Oct): the cap would make every test room they hold a pool
room in the run. They are in the tables with "test room, not listed (after the cap)" or "pool only, not listed (after the cap)":
- Glasgow: Nice'n'Sleazy (Bar, Basement) and SWG3 (The Poetry Club), two clusters.
- Los Angeles: Hotel Cafe (Main Stage, Second Stage) and Whisky a Go Go.
- London: The Lexington and The Underworld.
- San Francisco: Brick & Mortar Music Hall, Hotel Utah Saloon, The Chapel (the music room) and The Lost Church (the San Francisco
  building), four clusters beside the three listed.
- Washington: The Atlantis, Pie Shop and The Pocket at 7DrumCity, three clusters.
- Philadelphia: Ardmore Music Hall, which joins MilkBoy Philadelphia in `rising-sun-presents`.
- Toronto: Lee's Palace (Lee's Palace, Dance Cave), which joins The Pearl in `modo-live`; The Garrison, pool only.
- Portland: Aladdin Theater and Revolution Hall (Revolution Hall Auditorium, Show Bar), both True West as house booker; Mississippi
  Studios and Polaris Hall, which share an operator and a booking office; and Wonder Ballroom (settled 18 Oct), house booker Monqui
  Presents, its own cluster (`monqui-presents`). The sections disagree on the first four: the Aladdin Theater, Polaris Hall and
  Revolution Hall sections read them as one operator family (a shared footer, common owners), one cluster; the Mississippi
  Studios section keeps Mississippi Studios and Polaris Hall as one cluster (`pdx-mississippi`) beside True West's Aladdin Theater
  and Revolution Hall, two clusters. The proposed Polaris Hall row writes Mississippi Studios as its operator but `true-west` as its
  cluster, which agrees with neither reading. With Wonder Ballroom as another cluster, Portland passes §5 under either reading, with
  2 or 3 clusters; which one is left to the run's lead, and the 61 / 62 count above follows it. Portland sorts after the cut either way.
These 15 clusters (16 with Portland as three clusters) and the 5 metros are the difference between the 46 / 18 and the 61 / 23 above.
Glasgow sorts before Leeds, and Los Angeles and London before Manchester: if three or more kept clusters lost their test rooms, Glasgow's
clusters would come in before Leeds had they been listed.

Seven checked venues, in six metros, meet coverage (Cyprus Avenue and Mr Smalls only as pool-only venues) but fail §5, because their
metro has no eligible venue of another cluster: Antone's Nightclub (Austin), Neurolux (Boise), Cyprus Avenue (Cork), Reverb Lounge
and The Waiting Room Lounge (Omaha, one cluster), Mr Smalls (Pittsburgh) and The State Room (Salt Lake City). Seven more venues
settled on 18 Oct fail §5 the same way and have no table row (see "Checked in full"; six of them meet §1-4, and Tipitina's coverage
is still open, which §5 makes moot). The Louisiana, PhilaMOCA and Off Broadway,
"not used" on §5 alone, became eligible on 17 Oct: Trinity Centre, MilkBoy Philadelphia and Blue Strawberry are the other clusters
their metros lacked. A second check of the three under the 16 Oct readings, on the saved pages, upheld each one (17 Oct). On 18 Oct six
more "not used" on §5 alone were re-admitted, each with a second check under the 16 Oct readings on the saved pages and no request:
Green Mill (Chicago; partners Martyrs' and Reggies), Beachland Ballroom and Tavern (Cleveland; Music Box Supper Club), The Underworld
(London; The Lexington), Nice'n'Sleazy (Glasgow; SWG3), Hotel Cafe (Los Angeles; Whisky a Go Go) and The Atlantis (Washington; Pie
Shop and The Pocket). hi-dive (Denver) and Cliff Bell's (Detroit) stay out: Lost Lake Lounge is not used, and The Magic Bag is
undecided.

**Rooms at the line.** Pumpehuset was at 20 / 20 and Le Ministère had 21 in S2 before the compile; on the compiled lists (`shows.csv`)
Pumpehuset is 92 / 99 and Le Ministère 41 / 22, both capped. Among the venues added on 17 Oct, Bitterzoet had S2 20 before the compile
(a lower bound; compiled 102 / 60), Loppen S2 21 (which rests on the three Frigjort Festival nights), OCCII S2 26 by the title rule (19 if read by
meaning) and ALICE S2 ≥23 confirmed on-site; The Burren's Back Room (S2 22 before the compile, 4 of them 'TBD' rows) is now 135 / 114.
Among the 8 buildings inside the cap compiled on 18 Oct: Amager Bio & BETA is 49 / 20 for the building on the compiled list (Amager Bio
23 / 10, Beta 25 / 8, house room 1 / 2). S2 is still exactly 20 and still counts two Amager Bio nights (Syd, 9 Sep; USO, 11 Sep) that
vanished from the 22 and 27 Aug copies with no cancel mark (18 without them). The compile finds 88 of 183 nights with no copy taken
within 14 days before them, and 5 captures, all in S1, were not prefetched; it is pool only, so a short S2 would remove it but no test
cluster. Old Town School of Folk Music's Maurer Hall is 33 / 18 on the compiled list, as in round 2, 2 short in S2; the compile used
the same 34 copies, so the plan task `settle:oldtownschool-org-gap` (not complete at the 22:55 stop; it is retried) could still
close the gap, and if Maurer Hall became a test room,
Chicago would hold 4 test clusters and ALICE would fall out of the cap. Szold Hall is 20 / 3 on the compiled list, 17 short in S2. Music Box Supper
Club's compiled counts are the settle's (Supper Club 39 / 26, Concert Hall 34 / 34), and its S2 still rests on the one advance copy of
17 May, which misses shows announced later and cannot show later cancellations: the Supper Club falls under 20 only if 7 or more of its
shows were canceled. Center Stage's compiled list leaves every room where the settle had it (Vinyl 15 / 15, Center Stage Theater
15 / 10, The Loft 12 / 3), and these are lower bounds: 1 Apr-27 Sep has no full listing copy, and 221 event-page captures, 57 later
captures of read pages and 23 category captures were not prefetched. If more copies lifted Vinyl to 20 / 20, Center Stage would add a
test cluster in Atlanta and push ALICE out. Beachland Ballroom and Tavern (compiled: Ballroom 49 / 38, Tavern 76 / 41) and Music Box
Supper Club are each other's only §5 partner in Cleveland: if one leaves, both do, and Loppen and Pumpehuset come back under the cap. Several counts are lower bounds
read from advance listings (Badehaus S2, The Castle Hotel, Night & Day Cafe): a later cancellation does not show in them, so they are
not strict lower bounds. Among the capped clusters, The Pabst Theater had S1 exactly 20 before the compile and reached S2 20 only if 5 of the 9 rows placed
by thumbnail code alone are Pabst rows (compiled: 21 / 22), and Kings had S1 21 before the compile (compiled: 59 / 54), with Kings and The Pour House each other's only §5 partner. The compiled `shows.csv`
confirms or corrects each role (Amendment 12), with the reason in `sources.md`. A test room that falls short becomes pool if its
venue's rooms still meet coverage together; otherwise the venue leaves, and if it was its metro's only other cluster, the metro's other
venues fail §5 and leave too. If a kept cluster loses its only test room, the next capped cluster in file order comes in under the cap,
`cph-loppen` (Loppen) first. The other way round, a room that reaches 20 / 20 on `shows.csv` in a metro before the cut adds a test
cluster and pushes ALICE out first: Maurer Hall and Center Stage's Vinyl (above) and Lido Berlin, if it is settled as a cluster of its own (see "Where the check
stopped"). Tolhuistuin's Club no longer can: it is 18 / 5 on the compiled list. Cinetol's Zaal reached 20 / 20 on 17 Oct (74 / 57);
Trinity Centre's Main Hall did not (0 / 0 on the compiled list). The house-room conflict
with `coverageProblems` is resolved, not open: the room named after its building holds the rows with no room and stays a pool room
whatever it counts (Amendment 14), as the runner does since commit ed27c6f, so Tolhuistuin's (85 / 45; 87 / 45 compiled) and Trinity Centre's (47 / 32;
49 / 34 compiled) house rooms add no test cluster. VEGA's per-room counts are lower bounds, so its rooms are pool for now; a room that reaches 20 in both
periods on `shows.csv` becomes a test room in the same way, as Tranzac's and Festsaal Kreuzberg's did.

**Where the check stopped (16-18 Oct 2026).** The queue was checked further on 16-17 Oct, after the 16 Oct stop: 29 venues were
upheld, the others were settled, and 41 stayed undecided, most because web.archive.org was stopped for good in the fetcher after its
second 429 on 17 Oct. On 17-18 Oct a separate prefetch saved web.archive.org copies for those venues under the 30 s archive rule
(the 21:27 run of 102 tasks ended at 22:18 on 18 Oct with every task complete but one of The Magic Bag's; at 22:28 the plan
held 105 tasks, 101 complete, after `compile:stl-offbroadway`, `settle:cassiopeia-berlin-de-r2` and `settle:oldtownschool-org-gap`
were added; the run on that plan, started at 22:19, ended at 22:55, "plan done", with 103 of the 105 complete: The Magic Bag's second task and
`settle:oldtownschool-org-gap` got no index answer and are retried on a later run, and the plan then took two more Cassiopeia tasks),
and settle runs read them offline, each with an independent second check and no request of their own (batches 1-5, a second round,
an Old Town round 2, a Wonder Ballroom run and a Cassiopeia round 3). Of the 41 entries (40 venues:
BETA is a room of Amager Bio & BETA):
- 23 venues are eligible: Center Stage (pool only), Martyrs', Reggies, Old Town School of Folk Music (pool only), Music Box Supper
  Club, Amager Bio & BETA (pool only), SWG3, The Lexington, Whisky a Go Go, Ardmore Music Hall, Aladdin Theater, Mississippi Studios,
  Polaris Hall, Revolution Hall, Wonder Ballroom, Brick & Mortar Music Hall, Hotel Utah Saloon, The Chapel, The Lost Church (its San
  Francisco building), The Garrison (pool only), Lee's Palace, Pie Shop and The Pocket at 7DrumCity. The first six are in metros
  before the cut and are in the draft `venues.csv`; the others sort after it and are not listed (Result).
- 4 are not used on §1-4: Great American Music Hall (§1: Pollstar 2018 and KQED 2019-2020 name Goldenvoice, an AEG company, as its
  booker and no source says that ended; 35 of its 72 counted rows name no presenter, so Goldenvoice's 26% share does not show it books
  under half), Lost Lake Lounge (§3, reading 4: the Rockhouse Partners credit is on its 15 Apr copy; S2 also fails), Oxford Art Factory
  (§4: 19 / 12) and Shank Hall (§4: S2 19; no copy covers August or 1-11 September, and its past months are disallowed by robots.txt).
- 7 are not used on §5 alone, the only venue of their metro that could be eligible (six meet §1-4; Tipitina's coverage is open): Launchpad (Albuquerque, 66 / 46), 40 Watt
  Club (Athens, 36 / 28), Saturn (Birmingham, 66 / 56), Pilot Light (Knoxville, 56 / 21; both of its 6 Mar copies are also a hosting
  challenge page), The Night Cat (Melbourne, 61 / 54), Tipitina's (New Orleans; 45 / 19, coverage still open but §5 decides either
  way) and Nectar Lounge (Seattle, 34 / 49). The Lost Church's Santa Rosa building (26 / 34) is its own metro with no other cluster
  and is not used on §5 either. Albuquerque, Athens and Birmingham sort before the cut: an eligible partner there would add a test
  cluster and push a kept one out.
- 6 stay undecided:
  - Lido Berlin (Berlin): 67 / 39 on its own pages, no archive needed; open are the room reading and whether the Festsaal Kreuzberg
    operator runs it. It was not settled. Berlin sorts before the cut: as a cluster of its own it would push ALICE out.
  - Cassiopeia (Berlin): S2 16 for the building after round 3 on 156 copies (Club 35 / 0, Sommergarten 16 / 11, house room 25 / 5;
    building 76 / 16; 80 / 18 listed and not canceled, as §4 registered reads it), 4 short as a pool; the 10 event-page copies of
    `settle:cassiopeia-berlin-de-r2` added one row in each period. Every event-page capture in the index files on disk is now read
    or ruled out; two prefix index lookups of its listing pages are planned (prefetch tasks `settle:cassiopeia-berlin-de-club` and
    `-sommer`), and if they find nothing it is not used (the second check asks also for one event-page lookup before 1 Mar 2026
    before that). No room can reach 20 / 20, so it can only be pool and cannot move the cut.
  - The Magic Bag (Detroit): ≥13 / ≥14; one of its three prefetch tasks is not complete, and it was not settled. A pass would give
    Cliff Bell's §5. Detroit sorts after the cut.
  - Bossa Bistro + Lounge (Washington; per room): its copies were saved on 18 Oct (both tasks complete) but not yet settled.
    Washington sorts after the cut.
  - Club Dada (Dallas): 41 / 19, one short in S2, with 2 more copies listed but no task planned; Spune presents 40 of 41 S1 and 13 of
    19 S2 rows, so it would be the house booker. Single-venue metro: it would fail §5 alone.
  - Woodward Theater (Cincinnati): S1 16 confirmed, S2 ≥26, held up by the venue-host request cap, not by the archive; no archive task.
    Single-venue metro: it would fail §5 alone.
This was decided before any show list of these venues was compiled, before any Qloo call and without any fit rating. It is not
neutral: the cap keeps clusters in file order, so a venue settled in a metro that sorts before the cut pushes out a later cluster
once it is paired. The 17-18 Oct settle did exactly that: Chicago and Cleveland moved the cut from Manchester to Copenhagen (Result).
Of the 6 venues still undecided, only Lido Berlin can still push a kept cluster out; of the settled ones, Maurer Hall can (Rooms at
the line), and so can Center Stage if more copies lift a room to 20 / 20 (its compiled list of 18 Oct leaves Vinyl at 15 / 15 and
Center Stage Theater at 15 / 10, lower bounds; 221 event-page captures were not prefetched). We record it here so that it can be weighed.

**Literal reading of Amendment 1, estimated before compiling, and the dry run.** Amendment 14's last item reports the study beside the
result with every company named as presenting a counted show treated as an operator of the room. The scouting pages already showed
these links; each item gives what the dry run of 18 Oct (23:02) on the merged draft reports for them:
- Futuresound Group, which owns and books The Wardrobe, presents some nights at Brudenell Social Club. The estimate made Leeds one
  cluster failing §5. The dry run does not join the two: Brudenell Social Club leaves on §1, and The Wardrobe then fails §5.
- Triple D's presents nights at both 529 and The EARL. Atlanta becomes one cluster and fails §5: both rooms leave. (Compiled, 18 Oct:
  529's rows all name '529' as presenter, so the two stay apart; The EARL leaves on §1 instead, for Zero Mile's 3 rows, and 529 keeps
  §5 only if Center Stage, settled since, survives the literal reading. It does not: Center Stage's compiled list confirms the
  Vinyl row presented by Zero Mile with Rival Entertainment (15 Jun) and adds a Center Stage Theater row presented by Shaky Knees
  (18 Sep), both counted and both names on the draft `ln-aeg.csv`, so Center Stage leaves on §1 and 529 on §5, as the dry run of
  18 Oct reports. Atlanta keeps no cluster under the literal reading.)
- MODO-LIVE, which owns The Pearl, presents some nights at Rickshaw Theatre and single shows at Horseshoe Tavern. The estimate made the
  three rooms one cluster, so that Vancouver failed §5 and The Pearl and Rickshaw Theatre left. The dry run does not join them:
  Rickshaw Theatre and Rio Theatre leave on §1, and The Pearl then fails §5. Horseshoe Tavern stays.
- Paradiso presents a minority of Bitterzoet's shows, is credited ('i.s.m. Paradiso') on 8 counted Cinetol rows, and is the house
  booker of Tolhuistuin's house room. The estimate made the three one cluster; the dry run does not join them (the compiled Cinetol
  list does not record 'i.s.m. Paradiso' as presenting). Amsterdam keeps §5 either way: Cinetol and OCCII are other clusters.
- Loft Concerts presents shows at both Privatclub and Urban Spree. The dry run joins the two, and with them Festsaal Kreuzberg and
  Bitterzoet (below).
- §1 hits on counted rows: Live Nation at Rio Theatre (1 S1 row, 30 Apr), at The Louisiana (3 'Live Nation Presents' rows and 1
  'Live Nation & SJM Concerts Present' row, plus 1 S1 row presented by 'Metropolis', 16 Apr) and at Arts at the Armory (1 S1 'Live
  Nation Presents' row), and The Bowery Presents, which is AEG-affiliated, at Arts at the Armory (4 S1 and 2 S2 rows). Trinity
  Centre has a hit of its own: 'Metropolis Music Communion One', on the draft `ln-aeg.csv` as live-nation, presents 1 counted S2 row
  of its house room (3 Sep). The dry run drops the four venues on §1, each whole building, so Bristol keeps no cluster. This assumes
  that 'Live Nation', 'The Bowery Presents' and the Metropolis names are on `ln-aeg.csv`; all are on the draft `ln-aeg.csv` of
  18 Oct, which is not in the repository yet.

The cluster estimate made before compiling from these links no longer holds and is replaced by the dry-run figures; the runner reports the literal reading from `shows.csv` and `ln-aeg.csv`. A dry run on the compiled lists of 18 Oct with the
repository `venues.csv`, before the 17-18 Oct settled venues, reported it descriptively as 20 clusters, with 17 rooms dropped on §1
(among them The EARL, The Castle Hotel, Le Ministère and Rio Theatre) and 4 on §5. The dry runs of 18 Oct on the merged drafts, with
the 8 buildings compiled that day (9,250 rows) and then with Off Broadway as well (9,304 rows, 23:02), report 20 clusters again, with
6 clusters (10 test rooms) capped after them, after 25 rooms dropped on §1 and 4 on §5 (529, The Wardrobe, Turbo Haus, The Pearl).
In the 23:02 run the 25 rooms on §1 are the whole buildings of Center Stage (4 rooms), The EARL, Arts at the Armory (4), The Louisiana, Trinity Centre
(5), Reggies (4), Pumpehuset, Brudenell Social Club, The Castle Hotel, Le Ministère, Rickshaw Theatre and Rio Theatre; Off Broadway
is on neither list. The dry run also joins listed clusters that share a presenter: Bitterzoet with Festsaal Kreuzberg, Privatclub and
Urban Spree (9 shared presenters), Cactus Club with MilkBoy Philadelphia and Blue Strawberry (1), and Bottom of the Hill with Make-Out
Room (1). The 8 rooms new on the §1 list against the first dry run are the two compiled buildings whose counted rows name a presenter
on the draft `ln-aeg.csv`; the runner drops each whole building:
- Center Stage (4 rooms): Zero Mile (AEG) on 1 counted Vinyl row (15 Jun, with Rival Entertainment) and Shaky Knees (Live Nation:
  Shaky Knees Fest, LLC is in Live Nation's Exhibit 21.1; C3 Presents produces the festival) on 1 counted Center Stage Theater row
  (18 Sep). A third Zero Mile row (6 May) is off-site and not counted.
- Reggies (4 rooms): 'live nation' on 2 counted S1 Rock Club rows (4 and 18 Jun) and 'c3' (C3 Presents, L.L.C., in Live Nation's
  Exhibit 21.1) on 1 counted S2 Rock Club row (30 Jul, with 'reggies').
No other row of the 8 buildings names a presenter on the draft `ln-aeg.csv`. Shaky Knees, 'c3' and 'live nation' were added to it as
live-nation from the presenter check of the 8 lists (74 names: 3 live-nation, 1 aeg, which is Zero Mile, already on the file,
46 no and 24 not identified). Chicago keeps Green Mill and Martyrs' as two clusters and so keeps §5; Cleveland keeps both of its
clusters. Outback Presents, in which AEG holds a minority stake (reported by a trade report seen only in search results; AEG's own release names no stake and no figure is disclosed), was judged no (under 50%) and is not on the file; it
co-presents 5 counted Center Stage Theater rows and 1 Beachland Ballroom row (as 'Outback', 17 Apr). If minority stakes counted,
Beachland would leave on §1 and Music Box Supper Club on §5. After the cap, the settle rows show Live Nation on 1 SWG3 Warehouse row
and AEG on 1 SWG3 Galvanizers row, Live Nation on 2 Aladdin Theater rows and 3 Revolution Hall rows, Goldenvoice on Brick &
Mortar Music Hall's rows, and Showbox Presents (AEG) on 4 counted Wonder Ballroom S2 rows, so that under the literal reading Wonder
Ballroom fails §1 (its settle report). Goldenvoice and DF Concerts are not on the draft `ln-aeg.csv` (C3 now is, as 'c3'); Brick &
Mortar Music Hall would leave on §1 for its Goldenvoice rows only once Goldenvoice is added as an AEG name.
The dry run compares the presenters of every listed room (69 rooms name one) and joins only the clusters above; Berlin keeps §5,
with Badehaus beside the joined cluster. The claim rule's N ≥ 8 stays within reach under the literal reading; the run reports the
number and the intervals either way.

## Every scouted candidate
Registered = §1-6 as first written. Amended = with Amendments 1-14 (binding). "Counted" = S1 / S2 after the Amendment 4 rules.
"Not listed (after the cap)" = eligible, in a metro that sorts after the cut, and not in `venues.csv` (Result). For the venues settled
on 17-18 Oct, Registered is the verdict in the settle report on the same counts; for the six re-admitted on 18 Oct it follows from
the new §5 partner. For the 8 buildings compiled on 18 Oct, and Off Broadway compiled the same night, Counted gives the compiled counts and, where they differ, the settle or
re-admit counts they replace.

### United States

| Metro | Venue | Operator (cluster) | Counted S1 / S2 | Registered | Amended | Why |
|---|---|---|---|---|---|---|
| Atlanta | 529 | the venue: house booking; owner not publicly identified, no Live Nation or AEG link found | 66 / 72 | eligible | **test room** | Local promoters present some nights (one of them, Triple D's, also at The EARL). |
| Atlanta | The EARL | private owners; house booker Triple D's (presents 91 of 102 compiled rows; corrected 18 Oct, Result) | ≥40 / ≥30 (compiled 57 / 44) | eligible | **test room** | Counted on web.archive.org copies of its own listing. |
| Atlanta | Center Stage | a private family owns the building; Rival Entertainment (independent Atlanta promoter) is named as operator and presents more than half of each room's rows (Center Stage Theater 13 of 25, The Loft 8 of 15, Vinyl 23 of 30; the same shares in the dry run on the compiled list), cluster `rival-entertainment` | Center Stage Theater 15 / 10, The Loft 12 / 3, Vinyl 15 / 15, house room 0 / 0; building 42 / 28 (compiled 18 Oct, the settle's counts; lower bounds) | eligible | **pool only** | Settled 17 Oct from copies read that day; compiled 18 Oct on 122 saved copies (120 event-page copies of 104 distinct pages, the 28 Sep feed copy and the 15 May home copy), no request. Rooms from the room field of each event page and the feed's venue_room field (reading 7). No room reaches 20 / 20. 1 Apr-27 Sep has no full listing copy, so rows come from single event-page copies; 221 event-page captures were not prefetched. Under the literal reading it leaves on §1 (Zero Mile 1 row, Shaky Knees 1 row; Result). |
| Atlanta (Decatur) | Eddie's Attic | private owners, house booking | 25 / ≥15 | not used | not used | §3: "Unauthorized use or reproduction is strictly prohibited" (eddiesattic.com/terms-of-service/, §3). |
| Nashville | Station Inn | private owner, house booking | 105 / 104 | not used | not used | §3: "Nothing on this website can be copied or duplicated without written consent" (footer, stationinn.com). Also §5: no other Nashville venue was scouted. |
| Lawrence, KS | The Bottleneck | same owner and booking as The Granada | 51 / 53 | unclear: rests on The Granada | not used | §5: the only other Lawrence venue left is the same cluster and below coverage. |
| Lawrence, KS | The Granada | same as The Bottleneck | 22 / 18 | unclear: 21 S2 rows listed, 3 of them football watch parties | not used | §4: S2 18 after Amendment 4. |
| Lawrence, KS | Replay Lounge | private, house booking | 161 / 154 | not used | not used | §3: a licence "for personal, non-commercial transitory viewing only" (replaylounge.com/privacy-policy/, "Use License"). |
| Kansas City | recordBar | private co-owners; Mammoth Presents (majority-owned by CTS Eventim) presents many nights, about 25 rows in 3 snapshots, with no Live Nation or AEG stake found | ≥54 / ≥25 | not used | not used | §5: no other Kansas City venue had dated past listings (Knuckleheads lists past acts without dates). One S2 night was presented by AEG Presents as a promoter. |
| Denver | hi-dive | private owners, house booking | 61 / 58 | not used | not used | §5: the other Denver venues, Larimer Lounge and Lost Lake Lounge (settled 17 Oct), are out on §3. |
| Denver | Larimer Lounge | a private owner (who also owns Globe Hall and Lost Lake Lounge), in-house booking team | Larimer Lounge room ≥73 / ≥50; Ski House and Treehouse about 26 / 15; Campground 5 / 14 | not used | not used | §3, platform terms: the site is built by Rockhouse Partners, an Etix company (reading 4). Counted on web.archive.org copies before that was found. |
| Boston (Somerville) | The Rockwell | private family restaurant group, house booking | 121 / 73 | eligible | **test room** | Two S2 rows are marked canceled only in the site's list view, not in the feed. Many counted rows are theatre or comedy; the music category alone is about 39 / 32. |
| Boston (Cambridge) | Lizard Lounge | private family group (with the restaurant upstairs), house booking | 59 / 57 | eligible | not used | §3 (reading 5): on 17 Oct, when the show list was compiled, the events feed answered with a 403 Cloudflare check page; nothing was read another way. On 14 Oct the feed was open; "No Event Tonight" and closed-night rows (26 in each period) were not counted. |
| Boston (Cambridge) | Club Passim | 47 Palmer Inc. (nonprofit, operating as Passim), house booking | ≥79 / ≥84 | eligible | **test room** | Counted on web.archive.org copies of its own calendar page; the live page lists coming shows only. "Passim Presents" shows in other buildings are not counted. Dropped at first while scouting for its size, which is not a §1-6 rule. |
| Boston (Cambridge) | The Lilypad | private owner, house booking and rentals | 193 / 175 | not used | not used | §3, platform terms: the site is built on Squarespace (reading 4). |
| Boston (Somerville) | Arts at the Armory | The Center for Arts at the Armory (non-profit) runs it in a city-owned building; booking through its own form, most nights rentals by outside groups, none presenting more than half | 107 / 97 in all; Performance Hall 54 / 47, ROOTED Cafe 53 / 49 | eligible | **test room** (Performance Hall, ROOTED Cafe) | Rooms from the Events Manager category field (reading 7); the B5 Lavender Room and the house room are pool. Many counted rows are dance socials, classes, comedy without the word and fairs, which the Amendment 4 words do not remove. Outside presenters include The Bowery Presents (4 + 2) and Live Nation (1 S1 row). |
| Boston (Somerville) | The Burren | private owners, house booking; the Backroom Series is run by an outside promoter (24 Hour Concerts), whose ticket link is on 49 of the 77 counted back-room rows of the capture, with no presenting credit | ≥112 / ≥41 in all; Back Room ≥55 / ≥22, Front Room ≥57 / ≥19 (compiled: Back Room 135 / 114, Front Room 131 / 112) | eligible | **test rooms** (Back Room, Front Room) | Lower bounds from one web.archive.org copy of its music page (21 May 2026); 1 Apr-17 May not read. Each row's Room cell places it (reading 7). 4 of the Back Room's S2 rows are titled 'TBD'. The Front Room became a test room on the compiled list (18 Oct, Result). |
| Ann Arbor | The Ark | nonprofit membership organisation, house booking | 78 / 76 | not used | not used | §5: no other Ann Arbor venue was scouted. |
| Detroit | Cliff Bell's | private owners, house booking | 151 / 157 | not used | not used | §5: no other Detroit venue had a usable source; The Magic Bag is undecided ("Where the check stopped"). |
| San Francisco | Bottom of the Hill | Bottom Of The Hill Inc., house booking | 81 / 75 | eligible | **test room** | Announced to close after 31 Dec 2026, after S2. Its own RSS feed gives 81 / 74 show dates, a second route to the same count. |
| San Francisco | Make-Out Room | private owner, house booking | ≥51 / ≥57 | eligible | **test room** | Nights with a titled event that is not a DJ night (one blog post per night). Listed for sale in June 2026; no buyer was reported by mid-October. |
| San Francisco (Berkeley) | The UC Theatre | Berkeley Music Group (nonprofit), house booking | 26 / 10 | not used | not used | §4: S2 10. |
| San Francisco (Berkeley) | Cornerstone | private owners; booker not established | not counted | not used | not used | §3: the terms forbid access "through automated or non-human means" (cornerstoneberkeley.com/terms-of-use). |
| San Francisco | Cafe du Nord | operating company; Live Nation presents most shows | not counted | not used | not used | §1: the venue says "Live Nation presents most of the shows on our calendar". Its terms only state ownership and would pass §3. |
| San Francisco | Starline Social Club | a local owner group | 0 / 0 | not used | not used | §4: no countable row in any room. Also built by Rockhouse Partners (reading 4). |
| San Francisco | Thee Parkside, Ivy Room (Albany) | | not counted | not used | not used | §3, platform terms: both sites are built on Squarespace (reading 4). |
| San Francisco (Oakland) | Yoshi's | private owners, house booking | ≥35 / ≥49 | eligible | **test room** | One web.archive.org copy of its own home page (18 May 2026); 1 Apr-17 May not covered. Oakland is in the San Francisco-Oakland-Fremont MSA. Its own custom CMS. |
| San Francisco | Brick & Mortar Music Hall | a private owner group, no company owner identified; the venue is its own house booker (presents 58 of 107 counted rows, alone or with Popscene) | ≥58 / ≥49 | eligible | **test room**, not listed (after the cap) | Settled 18 Oct on the union of 53 web.archive.org copies; an independent recount found the same 107 rows. One room: the venue field names only the building. Goldenvoice (AEG) presents 28 of 107 rows as an outside promoter, so under the literal reading it leaves on §1. |
| San Francisco | Hotel Utah Saloon | owner not identified (the site names only past owners, private persons); in-house booking team | ≥44 / 25 | eligible | **test room**, not listed (after the cap) | Settled 18 Oct on 16 web.archive.org copies. One room, capacity 79. 20 weekly open-mic rows and 1 'class' row removed (Amendment 4). Press and company records were not checked. |
| San Francisco | The Chapel | a private owner (a restaurateur); house booker of the music room (((folkYEAH!))), an independent production company (53 of its 86 counted rows) | The Chapel (music room) ≥43 / ≥43; Main Bar ≥4 / 0, Curio 0 / ≥4, Outdoor Stage 0 / ≥2, house room ≥6 / ≥16; building ≥53 / ≥65 | eligible | **test room** (The Chapel), not listed (after the cap) | Settled 18 Oct. Rooms from the venue field of each list row (reading 7); the other rooms are pool. |
| San Francisco | The Lost Church | THELOSTCHURCH.ORG, INC (501(c)(3) nonprofit arts organisation), house booking | San Francisco ≥40 / ≥37; Santa Rosa building 26 / 34 | eligible | **test room** (San Francisco), not listed (after the cap) | Settled 18 Oct on the 12 copies with San Francisco rows. The two buildings are one cluster; the Santa Rosa building is its own metro with no other cluster and is not used on §5. |
| St. Louis | Blueberry Hill Duck Room | booked by The Pageant's booking company; The Pageant is 50% owned by Live Nation (press, Mar 2026) | 29 / 22 | not used | not used | §1. |
| St. Louis | Red Flag | private owner, house booking | ≥39 / ≥15 | not used | not used | §4: S2. |
| St. Louis | Blue Strawberry | private owners, in-house booking and its own ticketing | ≥35 / ≥29 | eligible | **test room** | One web.archive.org copy of its own home page (17 May 2026); S1 covers 19 May-30 Jun only. Two S2 rows are early and late sets of one act (28 act-nights). Its §5 partner is Off Broadway. |
| St. Louis | Off Broadway | private owners, house booking ('Presented by Off Broadway') | ≥25 / ≥27 (compiled 18 Oct: 26 / 28, lower bounds) | eligible | **test room** | Re-admitted on §5 (17 Oct): Blue Strawberry is another cluster in the metro; a second check under the 16 Oct readings upheld it. One web.archive.org listing copy (16 May) plus the CDX index of its show pages; 1 Apr-15 May not covered. Built on Webflow, which passes; Opendate's terms bind organizers, not visitors (reading 4). Compiled 18 Oct on 60 saved copies (the 16 May listing and 59 show pages), no request: 54 rows, coverage met. 1 Apr-15 May (45 nights) has no capture. One row (Solya) moved from S1 to S2 on a later page copy (against the 27 / 27 union by slug in `sources.md`: S1 27 to 26, S2 27 to 28). 26 in-period captures, later copies of pages already read and one 404, were not prefetched, so a later cancellation would not show. Presenters on its pages include 1% Productions; no Live Nation or AEG name. |
| St. Louis | Old Rock House | a local private operating company, house booking | ≥41 / ≥24 | not used | not used | §3: its host answered a 403 during the check (reading 5); also built by Rockhouse Partners (reading 4). Nothing read from it is used. |
| Indianapolis | HI-FI | MOKB Presents (independent promoter) | 89 / 81 | not used | not used | §3: "You may not reproduce, distribute, or create derivative works of any content from the website without express written permission" (hifiindy.com/terms-and-conditions/). |
| Indianapolis | The Vogue | private owners | ≥38 / ≥21 | not used | not used | §3: personal use only, "You must not republish material" (thevogue.com/terms-conditions). |
| Richmond | The Camel | private owner, house booking | ≥151 / ≥113 | not used | not used | §5: no other Richmond venue was scouted. |
| Cleveland | Beachland Ballroom and Tavern | private co-owners, house booking; operator written as 'Beachland Ballroom & Tavern' (Result) | Ballroom 49 / 38, Tavern 76 / 41, This Way Out 6 / 4, house room 0 / 0; building 131 / 83 (compiled 18 Oct, lower bounds; re-admit counts: Ballroom ≥43 / ≥32, Tavern ≥64 / ≥35, This Way Out 0 / 4, house room 23 / 13, building ≥130 / ≥84) | eligible | **test rooms** (Ballroom, Tavern) | Re-admitted on §5 (18 Oct): Music Box Supper Club is another cluster in the metro; a second check under the 16 Oct readings upheld it. Union of three web.archive.org copies of its listing. Rooms from the room field (reading 7); This Way Out (the shop in the basement) and the house room are pool. Was "not used" on §5 alone. Compiled 18 Oct on the listing copies and 456 of its own live event pages (447 answered, 9 gave 404), which gave the 37 period shows known only from the archive index a date and a room, so the house room's rows went to named rooms, and marked one Tavern show canceled; the lead has to confirm this wider use of live pages. 5 rows lost their presenter lines on the live pages (listed in its report.json). Outback presents 1 counted Ballroom row (Result). |
| Cleveland | Music Box Supper Club | an employee ownership trust since March 2026 (press and the venue's staff page); house booking | Supper Club 39 / 26, Concert Hall 34 / 34; building 73 / 60 (compiled 18 Oct, the settle's counts; lower bounds) | eligible | **test rooms** (Supper Club, Concert Hall) | Settled 17-18 Oct on four web.archive.org copies, recounted by an independent check; compiled 18 Oct on the same four copies, no request (1-10 Apr and 3-16 May have no capture; 24-25 Apr and 2 May are partly seen). Rooms from the room field and the At-A-Glance code column (reading 7). S2 rests on the advance copy of 17 May; the Supper Club falls under 20 only if 7 or more of its shows were canceled. Ticketing through Etix only. Its §5 partner is Beachland. |
| Los Angeles | Lodge Room | owner-operator (also runs Checker Hall), house booking | 85 / 83 | not used | not used | §3: a bot check guards the site's own show archive (reading 5). Robots.txt and its terms allow reading; the events feed was open, and we did not use it to get round the check. |
| Los Angeles | Hotel Cafe | private owners, house booking | Main Stage ≥74 / ≥28, Second Stage ≥114 / ≥59, house room 1 / 1 | eligible | **test rooms** (Main Stage, Second Stage), not listed (after the cap) | Re-admitted on §5 (18 Oct): Whisky a Go Go is another cluster in the metro; a second check under the 16 Oct readings upheld it. Its stage is a category field (reading 7). Was "not used" on §5 alone. |
| Los Angeles | Whisky a Go Go | private owners, a family; no current company owner named; in-house booking | ≥20 / ≥61 | eligible | **test room**, not listed (after the cap) | Settled 17-18 Oct. S1 from 20 live event pages of 4-28 Jun (the live sitemap keeps past pages only from 4 Jun); S2 from 14 live event pages and 4 web.archive.org listing copies. S1 is exactly at the line. One room. |
| Los Angeles | Checker Hall | the owner-operator of Lodge Room | 0 / 0 | not used | not used | §2 and §4: no dated listing of its own for the periods. |
| Milwaukee | Linneman's Riverwest Inn | private owner, house booking | 56 / 54 | eligible | **test room** | |
| Milwaukee | Cactus Club | private owner, house booking (co-promotes some off-site shows) | 138 / 125 | eligible | **test room** | Off-site rows are labelled and not counted. |
| Milwaukee | The Pabst Theater | Pabst Theater Group (owner and house booker, privately co-owned), cluster `mke-ptg` | 20 / about 24 (15 S2 rows confirmed on detail pages) | eligible | **test room** | One room: each detail page's Venue field places the row; the other PTG buildings are not counted. 2 S1 rows are marked canceled only on their pages. S2 reaches 20 only if 5 of the 9 rows placed by thumbnail code alone are Pabst rows. The site runs on carbonhouse and sells through AXS (AEG companies), which are vendors, not owner or booker. |
| Philadelphia | PhilaMOCA | private operator, house programming in a building rented from a private owner; R5 Productions presents 25 of 147 counted rows | ≥69 / ≥78 | eligible | **test room** | Re-admitted on §5 (17 Oct): MilkBoy Philadelphia is another cluster in the metro; a second check under the 16 Oct readings upheld it. Counted on 8 web.archive.org copies of its own home page; 67 / 76 if the 'Comedy@PhilaMOCA' label is read with the title. Tickets mostly through Etix, which does not host the site. |
| Philadelphia | MilkBoy Philadelphia | MilkBoy (private co-owners); house booker Rising Sun Presents (also Ardmore Music Hall and The 8x10), cluster `rising-sun-presents` | ≥55 / ≥59 | eligible | **test room** | Union of three web.archive.org copies of its own home page; one moved and one off-site row taken out. One upstairs room, capacity 200. |
| Philadelphia (Ardmore) | Ardmore Music Hall | a private owner and partners; house booker Rising Sun Presents (its flagship venue), cluster `rising-sun-presents` with MilkBoy Philadelphia | ≥27 / ≥37 | eligible | **test room**, not listed (after the cap) | Settled 17-18 Oct on 7 web.archive.org copies, unioned on the Tixr event id (retitled shows counted once). One room: the hidden Tixr venue id names no room. WXPN presents 7 of 64 rows. Same cluster as MilkBoy Philadelphia, so it adds no cluster. |
| Philadelphia | Kung Fu Necktie | owner not identified, house calendar | ≥76 / ≥75 (main room 53 / 49, KFN room 23 / 26) | not used | not used | §3, platform terms: the site is built by Rockhouse Partners, an Etix company (reading 4). |
| Austin | Antone's Nightclub | private owners, in-house booking; Ticketmaster is the ticket vendor only | about 59 / about 67 (estimates; 7 / 11 confirmed on its pages) | not used | not used | §5: no other eligible Austin venue (Continental Gallery and Mohawk are out). |
| Boise | Neurolux | house booker Duck Club Entertainment (presents 37 of 66 counted rows and co-presents 1); bar owner not identified | ≥38 / ≥28 | not used | not used | §5: no other eligible Boise venue. 19 karaoke rows removed (Amendment 4). |
| Chicago | Green Mill | private owners (two longtime managers since 19 Jun 2026), house booking | 135 / 157 (compiled 18 Oct, lower bounds; re-admit count ≥129 / ≥157, S1 ≥135 with the 13 May copy) | eligible | **test room** | Re-admitted on §5 (18 Oct): Martyrs' and Reggies are other clusters in the metro; a second check under the 16 Oct readings upheld it. One room (the calendar has no location field). Hideout is excluded (Amendment 11). Was "not used" on §5 alone. Compiled 18 Oct on its six live month grids (6 requests) and the 13 May copy: every night is covered, but the live grid drops past rows of a replaced recurring event, and further archive captures (listed in its report.json) were not read. |
| Chicago | Martyrs' | a private owner (the founder) and family, no company owner identified; the venue's own booking office | 45 / 39 (compiled 18 Oct, the settle's counts; lower bounds) | eligible | **test room** | Settled 17-18 Oct on five web.archive.org copies of its calendar and its RSS feed; compiled 18 Oct on the same saved copies, no request. One room. One private memorial row withheld (S2 40 with it). 18 Apr-13 Jul rests on one copy, so shows announced and played between copies are not seen. |
| Chicago | Reggies | Reggie's Bar & Grill, LLC (named as website owner), house booking | Rock Club 51 / 38, Music Joint 105 / 87, Banannas Comedy Shack 42 / 27, Trainwreck Rooftop Deck 6 / 5; building 204 / 157 (compiled 18 Oct, lower bounds; settle counts: Rock Club ≥51 / ≥36, Music Joint ≥105 / ≥88, Comedy Shack ≥42 / ≥26, building ≥204 / ≥155) | eligible | **test rooms** (Rock Club, Music Joint, Banannas Comedy Shack) | Settled 17 Oct on 20 web.archive.org copies and 6 live show pages, recounted by an independent check. Rooms from the venue taxonomy field (reading 7); the Rooftop Deck is pool, and Reggies on the Beach rows are at another building (off-site). Empire Productions presents 32% of the Rock Club's rows (compiled: 29 of 89 counted rows, in two spellings). Compiled 18 Oct with rows keyed by post id, not slug (reused slugs and retitled posts move some rows; Music Joint S2 is 87 against the settle's 88), and 4 live show-page requests, which gave 3 S2 rows (without them Rock Club S2 36, Comedy Shack 26). 6 rows that vanished from a later copy are kept (without them Rock Club 49 / 37, Music Joint 105 / 85, Comedy Shack 41 / 27); no role changes either way. Comedy Shack and Rooftop Deck have no copy for 9 Aug or 22-29 Sep. Under the literal reading it leaves on §1 (Live Nation 2 rows, C3 1 row; Result). |
| Chicago | Old Town School of Folk Music | Old Town School of Folk Music (501(c)(3) not-for-profit school), owner and house booker | Maurer Hall 33 / 18, Szold Hall 20 / 3, house room 4 / 1; Lincoln Square building 57 / 22 (compiled 18 Oct, lower bounds; round 2: Szold Hall ≥18 / ≥3, building ≥55 / ≥22) | eligible | **pool only** | Settled 17 Oct and again on 18 Oct (round 2: 34 copies, early and late sets counted apart). Compiled 18 Oct on the same 34 copies, no request; Szold Hall's S1 20 counts one forum as three date-only rows, as its own event page gives them (18 with one row), and Szold Hall stays pool either way. Rooms from the date line and the calendar's location field (reading 7); the two buildings across the street are read as one. Maurer Hall is 2 short in S2 (Rooms at the line). Armitage Hall is another building (0 / 0). |
| Omaha | Reverb Lounge | owned by the founders of 1% Productions, which books it; cluster `oma-1percent` with The Waiting Room Lounge | ≥32 / ≥23 | not used | not used | §5: Omaha's other venue, The Waiting Room Lounge, is the same cluster. The site uses the Rockhouse Partners events plugin, but no page read carries the 'Powered by ROCKHOUSE PARTNERS' credit, so reading 4 does not apply. |
| Omaha | The Waiting Room Lounge | same as Reverb Lounge | ≥37 / ≥46 (main room ≥35 / ≥44, joint nights with Reverb Lounge 2 / 2, Outdoors 0 / 0) | not used | not used | §5: same cluster as Reverb Lounge. Rooms from the venue field (reading 7). Rockhouse Partners plugin without the credit, as at Reverb Lounge. |
| Pittsburgh | Mr Smalls | private owner couple; Opus One Productions (independent) books most national acts in the Theatre, the in-house Mr. Smalls Presents the rest | ≥22 / ≥23 in all; Theatre ≥6 / ≥7, Funhouse ≥3 / ≥4, Cafe ≥13 / ≥12 | not used | not used | §5: no other eligible Pittsburgh venue. Rooms from the location field; no room is shown at 20 / 20, so it could only be pool. PromoWest (AEG) co-presents 2 of 13 counted Theatre rows. |
| Raleigh | Kings | private owners (three local people since Oct 2023), house booking | ≥21 / ≥26 | eligible | **test room** | S1 margin 1; 1 Apr-14 May unseen. No presenter has more than 4 of the 47 counted rows. |
| Raleigh | The Pour House Music Hall & Record Shop | private owner, who is the sole talent buyer | ≥36 / ≥31 | eligible | **test room** | Built on Webflow, which passes (reading 4). S1 from one web.archive.org copy (16 May 2026). Record-shop listening parties count (30 / 30 without them). |
| Salt Lake City | The State Room | The State Room Presents (owner and house booker; NIVA Live Independent certified) | 38 / 23 | not used | not used | §5: no other eligible Salt Lake City venue. From the operator's own iCal feed; without 5 World Cup streams S2 would be 18. AXS (AEG) is the ticket vendor only. |
| Washington | The Atlantis | I.M.P. (independent promoter; owner and house booker, also 9:30 Club, The Anthem, Lincoln Theatre) | ≥27 / 25 | eligible | **test room**, not listed (after the cap) | Re-admitted on §5 (18 Oct): Pie Shop and The Pocket are other clusters in the metro; a second check under the 16 Oct readings upheld it. Black Cat is excluded (Amendment 11), and I.M.P.'s other rooms are the same cluster. One web.archive.org copy (19 May 2026). Was "not used" on §5 alone. |
| Washington | Pie Shop | private owners, no company owner identified; house booking ('Pie Shop Presents') | ≥79 / ≥83 | eligible | **test room**, not listed (after the cap) | Settled 18 Oct on 3 listing copies, 6 home-page copies and the live list of 16 Oct. One room upstairs. Its show list is on Webflow, which passes (reading 4); the footer reads 'Powered by Opendate'. |
| Washington | The Pocket at 7DrumCity | 7DrumCity (music school and rehearsal business), in-house booker | ≥42 / ≥36 | eligible | **test room**, not listed (after the cap) | Settled 17-18 Oct on saved web.archive.org copies. 26 weekly open-mic rows removed (Amendment 4). One room. Its listings subdomain is on Webflow, which passes (reading 4). |
| Portland | Aladdin Theater | owner and house booker True West LLC, a Portland promoter (presents 75 of 89 counted rows), cluster `true-west` | ≥58 / ≥31 | eligible | **test room**, not listed (after the cap) | Settled 18 Oct on 12 web.archive.org copies. One room; rows at other buildings are off-site. Live Nation presents 2 rows as an outside promoter. Portland's clusters are open (Result). |
| Portland | Revolution Hall | Good George LLC (Mississippi Productions Inc., the Mississippi Studios owners) with True West as co-owner; house booker True West (69 of 99 counted main-hall rows), cluster `true-west` | Revolution Hall Auditorium ≥54 / ≥45, Show Bar ≥27 / ≥23; building ≥81 / ≥68 | eligible | **test rooms** (Auditorium, Show Bar), not listed (after the cap) | Settled 18 Oct on 18 web.archive.org copies. Rooms from the venue id field (reading 7). Same operator as Aladdin Theater. |
| Portland | Mississippi Studios | a privately held ownership group (private owners), company not identified; house booking ('Mississippi Studios Presents') | ≥81 / ≥67 | eligible | **test room**, not listed (after the cap) | Settled 18 Oct on 20 web.archive.org copies; the independent check added the calendar tab (14 rows) to the settle's 72 / 63. One room; Polaris Hall rows are off-site. Cluster `pdx-mississippi` as written; the Mississippi Studios section puts Polaris Hall in it too (Result). |
| Portland | Polaris Hall | the owners of Mississippi Studios (private owners), company not named; house booker Mississippi Studios ('Polaris Hall Presents' on every row) | ≥59 / ≥62 | eligible | **test room**, not listed (after the cap) | Settled 18 Oct on 7 web.archive.org copies. One room. Its footer names a "family of music venues" with Mississippi Studios, Revolution Hall and True West, which would make those four one cluster; the Mississippi Studios section puts it with Mississippi Studios in `pdx-mississippi` (Result). The proposed row writes it in `true-west`, which disagrees with its operator; left to the run's lead. |
| Portland | Wonder Ballroom | private owners, no company owner named; house booker Monqui Presents, named by the venue as its music booker (presents 41 of 47 counted rows), cluster `monqui-presents` | ≥21 / ≥26 | eligible | **test room**, not listed (after the cap) | Settled 18 Oct on 67 web.archive.org copies (60 event pages, the 13 Jun listing and 6 home-page copies that hold no event rows), recounted by an independent check (the same 51 rows). One room: no room field. S1 margin 1: 1 Apr-12 Jun rests on single event pages. S2 rests on the one 13 Jun listing copy, so shows announced later are missing (27 on the copies alone; deca joins, 26 Sep, is canceled by the venue's live sitemap). The 2024 AEG-Monqui alliance concerns another venue and is not a stake. Showbox Presents (AEG) presents 4 counted S2 rows as an outside promoter; under the literal reading it fails §1. Its own cluster, so Portland passes §5 whatever the other Portland clusters are (Result). |
| Minneapolis-St Paul | Icehouse, Crooners, Cedar Cultural Center, Berlin, Parkway Theater, White Squirrel Bar | various | not counted | not used | not used | §6: Study 1's metro. |
| Chicago, Washington DC | Hideout, Black Cat | | not counted | not checked | not used | Amendment 11: Study 1's placebo rooms. |

### Canada

| Metro | Venue | Operator (cluster) | Counted S1 / S2 | Registered | Amended | Why |
|---|---|---|---|---|---|---|
| Montreal | Turbo Haus | private co-owner, house booking (many nights by local promoters) | 106 / 101 | eligible | **test room** | Its site is the venue's own build (all files from its own host); no site-builder platform. |
| Montreal | Le Ministère | Les Productions Le Ministère, in-house programming; a rental hall where outside companies present most nights, none more than half. It likely shares an operations team with Club Soda (owned by L-A BE since 2023). | ≥31 / 21 (compiled 41 / 22) | eligible | **test room** | S1 from web.archive.org copies of its own listing and its own event pages (1-23 Apr not covered), S2 from its own event pages. evenko (49% Live Nation) presents 1 of 21 S2 rows. Dropped while scouting for its programme, which is not a §1-6 rule. |
| Montreal | Théâtre Fairmount | Neon Productions (local promoter; third-party sources), room rented or co-promoted per show | 37 / 21 | not used | not used | §3, platform terms: the site is built on Squarespace (reading 4). evenko (49% Live Nation) presents 3 of 37 S1 and 4 of 21 S2 rows. |
| Toronto | Tranzac | member-run not-for-profit | ≥25 / ≥25 in all; Southern Cross ≥16 / ≥15, other rooms fewer | eligible | **test rooms** (Southern Cross, Living Room, Main Hall, Zine Library) | Rooms from each event's rooms field (reading 7). Compiled 17 Oct (16 Apr-30 Sep): Southern Cross 183 / 252, Living Room 46 / 57, Main Hall 30 / 26, Zine Library 22 / 26, house room 4 / 7. 1-15 April gap filled 18 Oct from the saved copies (27 rows): Southern Cross 194 / 252, Living Room 47 / 57, Main Hall 31 / 26, Zine Library 25 / 26, house room 15 / 7. |
| Toronto | Horseshoe Tavern | private co-owners, house booking (an independent promoter presents a minority of nights) | ≥78 / ≥61 | eligible | **test room** | Counted on web.archive.org copies of its own pages; the live site lists coming shows only. Built on Webflow, whose terms do not decide it (reading 4). |
| Toronto | Lee's Palace and Dance Cave | MODO-LIVE, owner since December 2023 and house booker (named on the venue's booking page), cluster `modo-live` with The Pearl | Lee's Palace ≥54 / ≥49, Dance Cave ≥31 / ≥27; building ≥85 / ≥76 | eligible | **test rooms** (Lee's Palace, Dance Cave), not listed (after the cap) | Settled 18 Oct on 11 home-page and 60 event-page web.archive.org copies. Rooms from the separate 'Venue:' field (reading 7). Without rows that vanished from a later copy: 51 / 44 and 30 / 27. Built on Webflow, which passes (reading 4). Same cluster as The Pearl, so it adds no cluster. |
| Toronto | The Garrison | a private owner-operator (who also runs The Baby G), in-house booking | Front Room 19 / 0, house room 83 / 78; building 102 / 78 (lower bounds) | eligible | **pool only**, not listed (after the cap) | Settled 18 Oct on 15 web.archive.org copies. 'Front room' is named in the doors/cover field of late-night rows up to June only; all concerts go to the house room. No room reaches 20 / 20 apart from the house room, which stays pool (Amendment 14). |
| Vancouver | Rickshaw Theatre | private owner, house booking and hires | 55 / 33 | eligible | **test room** | MODO-LIVE presents some nights (see The Pearl). |
| Vancouver | The Pearl | MODO-LIVE (independent promoter and operator, also owner of Lee's Palace in Toronto), owner and house presenter | ≥76 / ≥61 | eligible | **test room** | Counted on web.archive.org copies of its own home page. Its own cluster `modo-live`. |
| Vancouver | Rio Theatre | a private owner and partners (their group bought the building in 2018), house programming and hires | 202 / 219 | eligible | **test room** | Exact, from its own listings feed; most rows are film showings (event rows alone 44 / 46). Outside companies present a minority of live nights, Live Nation one of them (30 Apr). |

### United Kingdom and Ireland

| Metro | Venue | Operator (cluster) | Counted S1 / S2 | Registered | Amended | Why |
|---|---|---|---|---|---|---|
| Leeds | Brudenell Social Club | not-for-profit company, house booking | ≥76 / ≥51 | eligible | **test room** | One room: the source does not say which of its two rooms an event is in. |
| Leeds | The Wardrobe | Futuresound Group (owner and booker) | ≥42 / ≥27 | eligible | **test room** | Futuresound also presents some nights at Brudenell and Hyde Park Book Club as an outside promoter. |
| Leeds | Hyde Park Book Club | private owner, house booking | ≥20 / ≥35 | not used | not used | §3, platform terms: the site is built on Squarespace (reading 4). |
| Bristol | The Louisiana | private family ('family-run'); outside promoters book most nights, none more than half (DHP 14 of 153 rows, the venue itself 11, Live Nation 4) | 85 / 68 | eligible | **test room** | Re-admitted on §5 (17 Oct): Trinity Centre is another cluster in the metro; a second check under the 16 Oct readings upheld it. Exact as listed on its own month pages. Under the literal reading of Amendment 1 it leaves on §1 (the Live Nation rows). |
| Bristol | Trinity Centre | Trinity Community Arts Ltd (charity), house booking; building owner not confirmed | 52 / 36 in all; house room 47 / 32, The Den 3 / 3, Fyfe Hall 2 / 0, garden 0 / 1, Main Hall 0 / 0 | eligible | **pool only** | Rooms from the iCal LOCATION field (reading 7). The house room holds the building-only rows and stays pool (Amendment 14); no named room reaches 20 / 20. Its §5 partner is The Louisiana. |
| Cork | Cyprus Avenue | private owner (with the Old Oak bar), in-house presenting | at most 75 / 64 for the venue; Winthrop Avenue 4 / 0, the main room and Wavelength not placed in full | not used | not used | §5: no other eligible Cork venue. Rooms from each event page's room line (reading 7); no room is shown at 20 / 20, so it could only be pool. The weekly jazz jams are at another building. |
| London | The Underworld | Glendola Leisure (private pub and bar company), in-house promoters | 74 / 60 | eligible | **test room**, not listed (after the cap) | Re-admitted on §5 (18 Oct): The Lexington is another cluster in the metro; a second check under the 16 Oct readings upheld it. Counted from its own event sitemaps, not exact. Live Nation presents a minority of gigs as an outside promoter. Was "not used" on §5 alone. |
| London | The Lexington | owner not identified as one company (two pub and bar companies at its address, both controlled by a private owner); in-house booking | ≥103 / ≥90 | eligible | **test room**, not listed (after the cap) | Settled 17-18 Oct on 8 web.archive.org copies of its listing. One room: GIG / CLUB is an event type, not a room. |
| Manchester | YES | Now Wave (independent promoters), house programming | 133 / 77 in all; The Pink Room 64 / 30, Basement 56 / 37, Roof Terrace 12 / 7, Bar 0 / 1, house room 1 / 2 | eligible | **test room** (The Pink Room, Basement) | Rooms from each row's room field (reading 7); Roof Terrace, Bar and the house room are pool. Its own hand-built site. |
| Manchester | Night & Day Cafe | private family owner, house booking | ≥26 / ≥27 | eligible | **test room** | One room: no room field. |
| Manchester | The Castle Hotel | freehold owned by a regional brewer, run by a private pub group; house management hires the room to outside promoters, none near half | ≥26 / ≥25 | eligible | **test room** | Lower bounds: sampled days on its own date filter plus web.archive.org copies. |
| Manchester | Band on the Wall | Inner City Music Ltd (charity), house programme | 137 / 97 | not used | not used | §3: "All such rights are reserved"; copying is limited to one printed copy and extracts (bandonthewall.org/terms-of-use/). |
| Manchester | Deaf Institute | Tokyo Industries (also Gorilla) | ≥31 / 98 | not used | not used | §3, platform terms: the site is built on Fatsoma. |
| Manchester | Gorilla | Tokyo Industries (also Deaf Institute) | 54 / 51 | not used | not used | §3, platform terms: the site is built on Fatsoma. |
| Glasgow | Nice'n'Sleazy | owner not named publicly, house booking | Bar 51 / 56, Basement 94 / 78, house room 3 / 3; venue 148 / 137 | eligible | **test rooms** (Bar, Basement), not listed (after the cap) | Re-admitted on §5 (18 Oct): SWG3 is another cluster in the metro; a second check under the 16 Oct readings upheld it. Recounted 18 Oct from the 8 saved feed pages; Bar is 49 / 55 with the two-room rows left out. Was "not used" on §5 alone. |
| Glasgow | SWG3 | owners Douglas House Security and Yardworks Ltd lease the site to a charity (Clydeside Initiative for Arts Ltd); SWG3 Ltd runs events and booking | The Poetry Club ≥50 / ≥33, SWG3 Galvanizers ≥21 / ≥15, SWG3 Warehouse ≥24 / ≥8, SWG3 TV Studio ≥17 / ≥8, SWG3 Galvanizers Yard ≥8 / ≥7, SWG3 Zinc Bar 0 / ≥1, house room ≥6 / ≥1; building ≥126 / ≥73 | eligible | **test room** (The Poetry Club), not listed (after the cap) | Settled 17-18 Oct on 11 web.archive.org listing copies. Rooms from the space field (reading 7); 'Full Complex' rows go to the house room. DF Concerts (listed in Live Nation's Exhibit 21.1 with no ownership share, so whether it counts as Live Nation is not settled) presents 17 of The Poetry Club's 83 rows on the pages read (17 to 69 of 83, since 45 rows have no page copy); the settle's lead read it as an outside promoter, and a share above half is not ruled out on the copies. 54 Bongo's Bingo rows removed (Amendment 4). |
| Glasgow | The Garage | Hold Fast Entertainment Ltd (owner; for sale since Jul 2026, no buyer named); every show by outside promoters, none more than half (DF Concerts, listed in Live Nation's Exhibit 21.1 with no ownership share, about 26%) | rooms 18 / 15, 16 / 11, 20 / 9 | not used | not used | §3: one web.archive.org copy of its gig listing is a hosting check page (reading 5). Without that it would be pool only: no room reaches 20 / 20. |
| Glasgow | Broadcast | private owner; closed for flood damage in Sep 2024, lease sold in 2025 | 0 / 0 | not used | not used | §4: no listings after Feb 2025. |
| Glasgow | Òran Mór | Skerryvore Ltd, with an investment by a hospitality group | not counted | not used | not used | §3: "Any redistribution or reproduction of part or all of the contents in any form is prohibited", apart from extracts "for your personal and non-commercial use only" (copyright notice on its site). |
| Glasgow | Hug & Pint | private owners; booked by its sister promoter 432 Presents | 40 / 36 | not used | not used | §3, platform terms: the site is hosted by Music Glue. |
| Glasgow | Mono | private, house booking and hires | 8 / 17 | not used | not used | §4. |
| Dublin | Button Factory | Nottub Ltd; a hire venue with its own club nights | 25 / 27 | not used | not used | §3, platform terms: the site is built on Squarespace (reading 4). |
| Dublin | The Workman's Club | Lolapop Ltd (bought back in 2026; before that a lender-controlled hospitality group) | Main Room 37 / ≥20, First Floor Bar 21 / 0, room not given 16 / ≥26 | not used | not used | §5: the other Dublin candidates are out on §3 (The Grand Social: Wix; Button Factory: Squarespace). The room is given in each event's Time field ("8pm (Main room)"), not in the title, so the rooms would be split (reading 7). Outside promoters, among them MCD Productions (part-owned by Live Nation), present single shows. |
| Dublin | The Grand Social | the venue's operating company; no public source names the one for 2026 (2018: Townhouse Leisure; 2023: a consultancy company; a former operating company was wound up in 2025), no Live Nation or AEG link | 34 / 48 | not used | not used | §3, platform terms: the site is built on Wix (reading 4). |

### Continental Europe

| Metro | Venue | Operator (cluster) | Counted S1 / S2 | Registered | Amended | Why |
|---|---|---|---|---|---|---|
| Amsterdam | Melkweg | Stichting Melkweg (foundation), house programming | 200 / 137 | not used | not used | §5: the other Amsterdam candidate, Paradiso, is not readable. §3 is also unclear: its visitor terms (VNPF, Art. 4) forbid copying from the programme. |
| Amsterdam | Paradiso | | not counted | not used | not used | §3: robots.txt disallows ClaudeBot from the whole site. |
| Amsterdam | Bitterzoet | a private owner; the venue rents itself out and books no bands itself, so there is no outside house booker | ≥33 / ≥20 | eligible | **test room** | S1 from four web.archive.org copies of its agenda, S2 from 20 own event pages; S2 is at the line. Paradiso presents a minority of nights. |
| Amsterdam | Cinetol | Stichting Kunst- en Cultuurhuis Cinetol (foundation), house programming | 81 / 58 in all; Zaal ≥6 / ≥9, Etage ≥1 / 0 from 17 event pages | eligible | **test room** (Zaal) | Compiled 17 Oct: Zaal 74 / 57, Etage 2 / 0, house room 3 / 0. Rooms from each event page's LOCATION field (reading 7). Built on Webflow, which passes (reading 4). Paradiso is co-credited ('i.s.m.') on 8 counted rows. |
| Amsterdam | OCCII | Stichting In It (non-profit foundation), house programming | 43 / 26 | eligible | **test room** | Exact, from its own 2026 archive. Read by meaning rather than by the title words, S2 would be 19. |
| Amsterdam | Tolhuistuin | Stichting Tolhuistuin with THT Horeca BV and Stichting Paradiso; house bookers per room on the compiled list (Result): Paradiso (house room), Parallel (Club), Podcastnetwerk (Tuinhuis) | ≥171 / ≥91 in all; house room 85 / 45, IJzaal 33 / 11, Club 16 / 5, Tuin 12 / 18, other rooms fewer (compiled: 87 / 45, 34 / 12, 18 / 5, 14 / 26) | eligible | **pool only** | Rooms from the agenda's location field (reading 7); counted on five web.archive.org copies. No named room reaches 20 / 20; the house room does, but it holds the rows with no room and stays pool (Amendment 14). |
| Copenhagen | Pumpehuset | management-owned company in a municipal building, house booking | 20 / 20 (compiled 92 / 99) | eligible | **test room** | One room (reading 7): Byhaven, its free outdoor stage at the same address, appears only in titles, the concert pages have no room field, and the location filter covers only the coming programme. At the line before the compile; the compiled list clears it. |
| Copenhagen | VEGA | Koncertvirksomhedens Fond (foundation), house booking | Store VEGA ≥33 / ≥15, Lille VEGA ≥21 / ≥9, Ideal Bar ≥17 / ≥7 | eligible | **pool only** | Rooms from the site's room filter. No room confirmed at 20 / 20. |
| Copenhagen | ALICE | Fonden ALICE (foundation), house booking by its music group | 43 / 30 (≥28 / ≥23 confirmed on-site) | eligible | **test room** | From its own past-event month lists; off-site rows show only in the page text. KLANG Festival presents 7 of the 43 S1 rows. |
| Copenhagen | Loppen | Musikforeningen Loppen (members' association), in-house booking | 34 / 21 | eligible | **test room** | From its own past-shows listing. S2 rests on the three Frigjort Festival nights, whose pages head the line-up 'Loppen'; read as off-site, S2 would be 18. |
| Copenhagen | Amager Bio & BETA | Kulturbegivenhedsfonden Odd Productions (a foundation set up by Roskilde Festival and VEGA), operator on a municipal concession since 1 Sep 2025, in-house booking; cluster `odd-productions` | Amager Bio 23 / 10, Beta 25 / 8, house room 1 / 2; building 49 / 20 (compiled 18 Oct; settle counts: Amager Bio ≥22 / ≥10, building ≥48 / 20) | eligible | **pool only** | Settled 18 Oct (second round) on 11 web.archive.org copies of its home page. Compiled 18 Oct on 12 saved copies, no request; it adds one Amager Bio S1 row (9 May) that a later copy's reuse of the same slug for a 2027 show had hidden. 88 of 183 nights have no copy taken within 14 days before them, and 5 captures, all in S1, were not prefetched. Capacities as the venue publishes them: Amager Bio 1250, Beta 200. Rooms from the scene field (reading 7). S2 is exactly 20: it counts two Amager Bio nights (Syd, 9 Sep; USO, 11 Sep) that vanished from the 22 and 27 Aug copies with no 'aflyst' mark (18 without them). The second check's correction is used: M.O.P. (24 May, 'Flyttet til Loppen') is off-site. Live Nation's ticket brand is on a minority of ticket links, none on a counted S2 row. Self-hosted WordPress, no terms. |
| Berlin | Hole44 | Channel Music GmbH | 39 / 16 | not used | not used | §4: S2. |
| Berlin | Festsaal Kreuzberg | Neue Flutgraben Betriebsgesellschaft (operating company; promoters' association) | ≥24 / ≥30 in all; Festsaal ≥16 / ≥21 | eligible | **test room** (Festsaal) | Rooms from each event's location field (reading 7). Compiled 17 Oct from all 626 event pages: Festsaal 30 / 21, Biergarten 2 / 8, house room 6 / 1. |
| Berlin | Badehaus | Badehaus Musik GmbH (owner and house booker); outside promoters present single shows | ≥90 / ≥34 | eligible | **test room** | Counted on web.archive.org copies of its own listing; 19 pub-quiz rows removed (Amendment 4). |
| Berlin | Privatclub | Milchmädchen Musikkultur GmbH, house booking; outside promoters present most nights, none more than half (Trinity Music GmbH 21 of 127, Loft Concerts 7) | 83 / about 44 (≥21 confirmed on its event pages) | eligible | **test room** | Union of five web.archive.org copies of its own home page; 3 of 24 sampled S2 pages are now marked ABGESAGT. Served through Cloudflare as a CDN; no challenge was met. |
| Berlin | Urban Spree | Urban Spree GmbH; no house booker (13 different promoters on 16 sampled pages, the largest with 3) | 36 / 27 | eligible | **test room** | On the 16 Oct queue; checked on 16 Oct 2026 UTC. Exact, from the Concerts filter of its own programme pages. Loft Concerts presents shows here and at Privatclub. |

### Checked in full on 16-18 Oct 2026, without a table row
These venues came from the 16 Oct queue and the archive survey lists below. Each had a full §1-6 check with a second, skeptical
check; the venues left undecided on 17 Oct were settled on 17-18 Oct from saved copies ("Where the check stopped"). The 23 found
eligible now have table rows. The others have no table row: 50 are not used and 6 are undecided.

**Not used (50).**
- §1 (5): Academy Dublin (Dublin): MCD, which counts as Live Nation, is named as a partner in the venue, and its stake and its booking
  role are not disclosed; Brooklyn Bowl (New York): Live Nation's own filing and the venue's privacy policy show it as Live Nation
  owned or operated; Great American Music Hall (San Francisco; settled 18 Oct): Pollstar (2018) and KQED (2019-2020) name Goldenvoice,
  wholly owned by AEG, as its booker and no source says that ended; 35 of its 72 counted rows name no presenter, so Goldenvoice's 26%
  share does not show that it books under half; The Roxy (Los Angeles): Goldenvoice is the house booker; Underground Arts
  (Philadelphia): public sources name AEG Live (2015) and The Bowery Presents (AEG) for it.
- §3, terms that forbid copying or reuse, or allow personal use only (reading 3) (11): Columbiahalle (Berlin; also §4, S2 13);
  Frannz Club (Berlin); Georgia Theatre (Athens; its footer links AEG's terms); Hotel Esplanade (Melbourne); Lager House (Detroit);
  Neumos (Seattle); Ophelia's Electric Soapbox (Denver); Smalls Jazz Club (New York); The Great Hall (Toronto); Visulite Theatre
  (Charlotte); White Oak Music Hall (Houston).
- §3, terms that cannot be read (reading 4) (3): Continental Gallery (Austin): its listing site, continentalclub.com, is built on
  Squarespace; Lost Lake Lounge (Denver; settled 17 Oct): its 15 Apr 2026 copy carries "Powered by ROCKHOUSE PARTNERS an ETIX
  company", gone from the live site now, and S2 fails too; Natalie's Grandview (Columbus): its terms page loads the text from a policy
  service that robots.txt does not let us read.
- §3, a bot check or a 403 from the venue host (reading 5) (2): Higher Ground (Burlington): a 403 'Just a moment...' check page;
  The Mint (Los Angeles): a 403 on its /api/ path.
- §2 or §4 (22): Belgrave Music Hall & Canteen (Leeds): no countable dated source; Dee's Country Cocktail Lounge (Nashville): 0 / 0;
  Electric Brixton (London): S2 17; Jazz St. Louis (St. Louis): S2 4; Lost Lane (Dublin): no own dated listing; Mohawk (Austin): no
  own listing or feed; Northcote Social Club (Melbourne): no own dated source; ONCE Somerville (Boston): 0 / 0, now a promoter without
  a room of its own; Oxford Art Factory (Sydney; settled 18 Oct): 19 / 12; Q-Factory (Amsterdam): S2 15 and no room at 20 / 20; Rae's
  London (London): 4 / 3; Rosemount Hotel (Perth): no countable source; Shank Hall (Milwaukee; settled 18 Oct): S2 19, no copy covers
  August or 1-11 September and its past months are disallowed by robots.txt; Star Theater (Portland): S1 cannot be shown on any allowed source (its footer also reads 'powered by TicketWeb');
  Stereo (Glasgow): S2 ≥6; Sunset Tavern (Seattle): a DICE widget only; The 8x10 (Baltimore): S2 0, closed for renovation; The Heavy
  Anchor (St. Louis): ≥7 / ≥2; The New Parish (San Francisco): no count is possible without the archive (its footer also reads
  'powered by TicketWeb', and the terms it refers to cannot be found); The Peer Hat (Manchester): 11 / 6; The Tote (Melbourne): 0 / 0;
  Zebulon (Los Angeles): a DICE widget only.
- §5 alone, settled 17-18 Oct (7): the only venue of its metro that could be eligible, so it fails §5: Launchpad (Albuquerque):
  66 / 46; 40 Watt Club (Athens): 36 / 28, Live Nation presents none of its counted rows; Saturn (Birmingham): 66 / 56; Pilot Light
  (Knoxville): 56 / 21, and both of its 6 Mar 2026 copies are a hosting challenge page, which by reading 5 could rule it out on its
  own; The Night Cat (Melbourne): 61 / 54; Tipitina's (New Orleans): 45 / 19, coverage still open (two index queries would decide it),
  out on §5 either way; Nectar Lounge (Seattle): 34 / 49. The Lost Church's Santa Rosa building (26 / 34) is its own metro with no
  other cluster and is not used on §5 either; it is counted with The Lost Church, not here.

**Undecided (6).** Unless noted, §1-3 pass and the open point is coverage (§4, for some also §2); the reason each stays open is in
"Where the check stopped":
- Before the cut (Berlin): Lido Berlin (no archive needed, 67 / 39 on its own pages; open are the room reading and whether the
  Festsaal Kreuzberg operator runs it; not settled); Cassiopeia (S2 16 for the building after three rounds, 4 short; pool at most;
  two listing lookups planned, and if they find nothing it is not used).
- Single-venue metros, which fail §5 alone: Club Dada (Dallas; 41 / 19, one short in S2); Woodward Theater (Cincinnati; S1 16
  confirmed, S2 ≥26; held up by the venue-host request cap, not by the archive).
- After the cut: The Magic Bag (Detroit; ≥13 / ≥14; a pass would give Cliff Bell's §5); Bossa Bistro + Lounge (Washington; per room; copies saved 18 Oct, not settled).

## Looked at during scouting, never a candidate
These were settled without a full §1-6 check: no readable dated source for the periods, a block, a rule that decides them on sight,
or the stop on 16 Oct. None of them was counted for this file.

**Built by Rockhouse Partners, an Etix company (reading 4).** 18 sites carry the credit on their pages and are not used, whatever
their archive coverage: Alberta Rose Theatre (Portland), Asheville Music Hall, The Grey Eagle (Asheville), Boom Boom Room (San
Francisco), Starline Social Club (San Francisco), Cain's Ballroom (Tulsa), Cat's Cradle and Local 506 (Durham-Chapel Hill), Globe
Hall and Larimer Lounge (Denver), Holocene (Portland), Johnny Brenda's and Kung Fu Necktie (Philadelphia), Lincoln Theatre (Raleigh),
Old Rock House (St. Louis), The Broadberry (Richmond), Ottobar (Baltimore), Thunderbird Cafe & Music Hall (Pittsburgh).

**Archive survey only (15-16 Oct).** A survey counts the venue's own listing pages that web.archive.org holds for S1 and S2;
it is not a §1-6 check. Sites that went on to a full check are in the tables above.
- Copies cover both periods (20) and coverage unclear (11): every one of these 31 sites was checked in full on 16-17 Oct (and settled on 17-18 Oct where it stayed undecided).
  They are in the tables above or in "Checked in full on 16-18 Oct 2026, without a table row".
- No usable copies for S1 or S2 (27): Barfly Camden (London); Barrowland Ballroom (Glasgow); Bi Nuu (Berlin); Biltmore Cabaret (Vancouver); Brunswick Ballroom (Melbourne); Burdock Brewery music hall (Toronto); Bush Hall (London); Cactus Cafe & Bar (Austin); Corner Hotel (Melbourne); Crowbar Brisbane (Brisbane); DC9 (Washington); Delmar Hall (St. Louis); Doug Fir Lounge (Portland); El Club (Detroit); Gasa Gasa (New Orleans); Harlow's (Sacramento); Headrow House (Leeds); Holy Diver (Sacramento); Knuckleheads (Kansas City); MOTH Club (London); MOTR Pub (Cincinnati); Mahall's (Cleveland); Richmond Music Hall (Richmond); The Baby G; The Evening Muse (Charlotte); The Waiting Room (London); The Workers Club (Melbourne).
- Out on their own terms (§3, reading 3) (7): Belly Up (San Diego); Club Soda (Montreal); Headliners Music Hall (Louisville); Manchester Academy (Manchester); SO36 (Berlin): its terms page /agb is disallowed by its robots.txt, so the terms are unclear; Songbyrd (Washington); The Majestic Theatre complex (Detroit).
- Out on a bot check (reading 5) (1): Casa del Popolo / La Sala Rossa (Montreal).
- Out on §1 (1): The Pageant (St. Louis): 50% owned by Live Nation.
- Out on §6 (1): The Hook and Ladder (Minneapolis), Study 1 metro.

**Queued, never run (stopped 16 Oct).** Full checks (32): all 32 were run on 16-17 Oct; they are in the tables above or in "Checked in full on 16-18 Oct 2026, without a table row".
Archive surveys (20; most were found by the 15 Oct host retry; the other 46 were checked in full on 16-17 Oct): Bootleg Theater (Los Angeles); Bovine Sex Club (Toronto); Burdock Music Hall (Toronto); Flicker Theatre & Bar (Athens); Gold Diggers (Los Angeles); Hi-Ho Lounge (New Orleans); Irving Theater (Indianapolis); Lazybones Lounge (Sydney); Pat's Pub (Hastings Mill Brewing) (Vancouver); Quasimodo (Berlin); The End (Nashville); The Firkin; The Old Market Assembly (Bristol); The Sheldon (St. Louis); The Starry Plough (San Francisco); The Victoria (London); Thekla (Bristol); Trinosophes (Detroit); Underground Music Cafe; Willis Show Bar (Detroit).

**Hosts that failed in the first sweep, tried again on 15 Oct** (home page, terms page and one listing page through the same
robots-enforced fetcher; guessed hosts with no DNS were looked up by web search first). Settled without a count:
- Did not answer on two tries (first sweep, 15 Oct retry: time-out, refused connection or TLS failure), or not public (30): 191 Toole (Tucson); Amnesia (San Francisco); Crystal Ballroom (Boston); DNA Lounge (San Francisco); Fiddlers (Bristol); Gruene Hall (San Antonio); Herman's Hideaway (Denver); Hootananny (London); Hotel Vegas (Austin); Howler (Melbourne); Jackpot Saloon (Lawrence); Jammin Java (Washington); Jazzhouse (Copenhagen); Kessler Theater (Dallas); Le National (Montreal); McCabe's Guitar Shop (Los Angeles); Moroccan Lounge (Los Angeles); New Century Hall; Opus One Productions; Permanent Records Roadhouse (Los Angeles); Smalls (Detroit); Snug Harbor (New Orleans); Soup Kitchen (Manchester); Star Community Bar (Atlanta); The Cannery; The Salt Shed (Chicago); The Satellite (Los Angeles); Toad (Boston); World Cafe Live (Philadelphia); Zanzabar (Louisville).
- A bot check, a 403 or a 429 (we never try again or another way) (9): Aisle 5 (Atlanta); Farewell (Kansas City); Foufounes Électriques (Montreal); Hungry Brain (Chicago); Melody Inn (Indianapolis); Rumba Cafe (Columbus); The 5 Spot (Nashville); The Blue Note Grill (Durham); The Saxon Pub (Austin).
- robots.txt disallows our agent or ClaudeBot, or answers 5xx (treated as disallow all) (4): Drake Hotel (Toronto) (robots.txt 530); Midway Café (Boston); Motorco (Durham) (robots.txt 503); The Sanctuary (Detroit).
- Terms forbid copying or automated reading (reading 3) (4): Heartwood Soundstage (Gainesville): "You must not republish material from Heartwood Soundstage ... reproduce, duplicate, or copy material" (/terms-of-service); Saint Luke's (Glasgow): "Reproduction is prohibited other than in accordance with the copyright notice" (/site-information/site-terms/); Troubadour (Los Angeles): "Use automated tools to scrape, copy, or collect information from the Website without our permission" (troubadour.com/terms-conditions); Union Stage Presents (Union Stage, Pearl Street Warehouse) (Washington): "You must not republish material from Union Stage Presents ... reproduce, duplicate, or copy material" (/terms).
- Built on Squarespace or Wix (reading 4) (8): Conor Byrne Pub (Seattle); Jalopy Theatre (New York); Sebright Arms (London); The Crofters Rights (now The Croft) (Bristol); The Key Club (Leeds); The Plough and Stars (Cambridge); The Rivoli (Toronto); The Ship (Kansas City).
- No own website: only social pages or listings, or the venue could not be identified (9): Aster (venue not identified); Bello Bar (Dublin); Brillobox (Pittsburgh); Healer (Indianapolis); L'Escogriffe (Montreal); Marble Bar (Detroit); One Eyed Jacks (New Orleans); The Gasometer Hotel (Melbourne); The Parish (Austin).
- Closed before the periods (4): Landmark Saloon (Portland): closed Feb 2026, reopened as Switchback Saloon with no own site found; Little Gem Saloon (New Orleans): closed in 2019; Rockwood Music Hall (New York): closed in late 2024; The Riot Room (Kansas City): closed in 2021.

**First sweep (14 Oct).**
- **No past dates on the source.** Knuckleheads and Globe Hall (past acts without dates), Webflow sites without a sitemap (Biltmore),
  DC9 and Songbyrd (current events only), Corner Hotel (future shows only), Headrow House and the old Band on the Wall sitemaps (stale).
  Several sites first put here were surveyed again in the archive on 15 Oct and are listed above with that result.
- **Blocked to us.** A Cloudflare check or a plain 403 on 34 sites, among them Exit/In, The Basement, The Orange Peel, Middle East,
  Great Scott, Smith's, The Independent, Teragram, Masquerade, Crescent, Bimbo's, Rickshaw Stop, Neck of the Woods, August Hall, Freight
  & Salvage, Whelan's, Rescue Rooms, Rock City, The Fleece, Drake Hotel and Hotel Cecil. DNA Lounge timed out. HI-FI Annex's robots.txt
  disallows everything. We did not try to get past any of these.
- **Dropped while scouting, before §1-6 were applied.** White Rabbit (mostly comedy) was dropped for its programme and never checked.
  Òran Mór, Le Ministère and Passim were dropped at first too, then checked in full on 15 Oct (tables above). The Peer Hat (S2 6) and
  Stengade (24 / 18) are below coverage (§4).
- **Possible Live Nation link.** Majestic Madison: its robots.txt points to FPC Live sites. Not checked further.
