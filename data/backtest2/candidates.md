# Study 2 candidate venues

This file lists every venue scouted for Study 2 (`BACKTEST-2.md`). For each one it gives the verdict under the registered text (§1-6)
and under the Amendments, which bind. It is committed before `venues.csv` and before any show list is compiled. No Qloo call has been
made, no act has been rated for fit, and no ranker has been run.

Checked 14-16 Oct 2026 by reading each venue's own pages, or web.archive.org copies of them, with a robots-enforced fetcher
(robots.txt read for our agent, for `*` and for every Anthropic agent; at least 2.5 s between requests to a host). Request counts,
robots results and the terms of use read for each site go into `data/backtest2/sources.md`. Counts are listed shows in S1
(1 Apr-30 Jun 2026) and S2 (1 Jul-30 Sep 2026) at the local date (Amendment 3), after the Amendment 4 rules (canceled, off-site, untitled
and non-music rows removed). A count marked ≥ is a lower bound: the rows confirmed on pages, where the source could not be read in full.
These are pre-compile counts. The run counts again on `shows.csv` and refuses to start if a room's role disagrees (Amendment 12).
The role corrections of 17 Oct 2026 (Result) use the compiled counts.
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
41 clusters hold a test room, in 16 metros. The 20-cluster cap of `BACKTEST-2.md` keeps the first 20 in `venues.csv` order, in 8
metros. The test rooms of the other 21 clusters are pool rooms in the run (Amendment 12). The table includes the role corrections of
17 Oct 2026, made on the compiled show lists (below). Every listed venue still feeds its metro
pool and counts for §5.

| Metro | Test rooms kept (one cluster each) | Test rooms capped (pool in the run) | Pool-only rooms |
|---|---|---|---|
| Amsterdam | Bitterzoet, Cinetol (Zaal), OCCII | | Cinetol (Etage, house room), Tolhuistuin (8 rooms) |
| Atlanta | 529, The EARL | | |
| Berlin | Badehaus, Festsaal Kreuzberg (Festsaal), Privatclub, Urban Spree | | Festsaal Kreuzberg (Biergarten, Gewächshaus, Kaminzimmer, Ostflügel, house room) |
| Boston | Arts at the Armory (Performance Hall, ROOTED Cafe), The Burren (Back Room), Club Passim, The Rockwell | | Arts at the Armory (B5 Lavender Room, house room), The Burren (Front Room) |
| Bristol | The Louisiana | | Trinity Centre (5 rooms) |
| Copenhagen | ALICE, Loppen, Pumpehuset | | VEGA (5 rooms) |
| Leeds | Brudenell Social Club, The Wardrobe | | |
| Manchester | The Castle Hotel | Night & Day Cafe, YES (The Pink Room, Basement) | YES (Roof Terrace, Bar, house room) |
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
and Festsaal Kreuzberg sort before the cut and enter it; The Castle Hotel is now the last kept cluster and Night & Day Cafe the first
capped one. The cut still falls in Manchester, and the 8 metros are unchanged. The compiled counts of other rooms differ from the
pre-compile counts in the tables (for example Rickshaw Theatre 40 / 29, The Pabst Theater 21 / 22, Trinity Centre 54 / 38 for the
building); every one of them keeps its role.

Ten checked venues, in nine metros, meet coverage (Cyprus Avenue and Mr Smalls only as pool-only venues) but fail §5, because their
metro has no eligible venue of another cluster: Antone's Nightclub (Austin), Neurolux (Boise), Green Mill (Chicago), Cyprus Avenue
(Cork), The Underworld (London), Reverb Lounge and The Waiting Room Lounge (Omaha, one cluster), Mr Smalls (Pittsburgh), The State
Room (Salt Lake City) and The Atlantis (Washington). The Louisiana, PhilaMOCA and Off Broadway, "not used" on §5 alone, become
eligible: Trinity Centre, MilkBoy Philadelphia and Blue Strawberry are the other clusters their metros lacked. A second check of the
three under the 16 Oct readings, on the saved pages, upheld each one (17 Oct).

**Rooms at the line.** Pumpehuset is at 20 / 20 and Le Ministère has 21 in S2. Among the venues added on 17 Oct, Bitterzoet has S2 20
(a lower bound), Loppen S2 21 (which rests on the three Frigjort Festival nights), The Burren's Back Room S2 22 (4 of them 'TBD'
rows), OCCII S2 26 by the title rule (19 if read by meaning) and ALICE S2 ≥23 confirmed on-site. Several counts are lower bounds
read from advance listings (Badehaus S2, The Castle Hotel, Night & Day Cafe): a later cancellation does not show in them, so they are
not strict lower bounds. Among the capped clusters, The Pabst Theater has S1 exactly 20 and reaches S2 20 only if 5 of the 9 rows placed
by thumbnail code alone are Pabst rows, and Kings has S1 21 with Kings and The Pour House each other's only §5 partner. The compiled `shows.csv`
confirms or corrects each role (Amendment 12), with the reason in `sources.md`. A test room that falls short becomes pool if its
venue's rooms still meet coverage together; otherwise the venue leaves, and if it was its metro's only other cluster, the metro's other
venues fail §5 and leave too. If a kept cluster loses its only test room, the next capped cluster in file order comes in under the cap,
`man-nightday` (Night & Day Cafe) first. The other way round, Tolhuistuin's Club (16 / 5 on the copies read, 90 / 48 only if Paradiso's 74 / 43 rows
with no room were placed there) may reach 20 / 20 on `shows.csv`; it would add a test cluster before the cut and push The Castle Hotel
out first. Cinetol's Zaal reached it on 17 Oct (74 / 57); Trinity Centre's Main Hall did not (0 / 0 on the compiled list). The house-room conflict
with `coverageProblems` is resolved, not open: the room named after its building holds the rows with no room and stays a pool room
whatever it counts (Amendment 14), as the runner does since commit ed27c6f, so Tolhuistuin's (85 / 45) and Trinity Centre's (47 / 32;
49 / 34 compiled) house rooms add no test cluster. VEGA's per-room counts are lower bounds, so its rooms are pool for now; a room that reaches 20 in both
periods on `shows.csv` becomes a test room in the same way, as Tranzac's and Festsaal Kreuzberg's did.

**Where the check stopped (16-17 Oct 2026).** The queue was checked further on 16-17 Oct, after the 16 Oct stop: 29 venues were
upheld, the others were settled, and 41 stay undecided, most because web.archive.org was stopped for good in the fetcher after its
second 429 on 17 Oct (Lido Berlin and Woodward Theater for other reasons; Whisky a Go Go, The Lexington and Reggies could also be
settled by more reads of their own event pages than the request cap allowed). They are listed after the tables. This was decided before any
show list was compiled, before any Qloo call and without any fit rating. It is not neutral: the cap keeps clusters in file order, so
an undecided venue in a metro that sorts before the cut could push out a later cluster once it is checked and paired. Before the cut
(between The Castle Hotel and Night & Day Cafe, in Manchester) these are Center Stage (Atlanta); Lido Berlin and Cassiopeia (Berlin); Martyrs',
Old Town School of Folk Music and Reggies (Chicago); Music Box Supper Club (Cleveland); Amager Bio & BETA (Copenhagen); Lost Lake
Lounge (Denver); The Magic Bag (Detroit); SWG3 (Glasgow); The Lexington (London); and Whisky a Go Go (Los Angeles). In Chicago,
Cleveland, Denver, Detroit, Glasgow, London and Los Angeles, a pass would also give §5 to a venue that is "not used" on §5 alone
(Green Mill, Beachland Ballroom and Tavern, hi-dive, Cliff Bell's, Nice'n'Sleazy, The Underworld, Hotel Cafe); those partners need
the 16 Oct readings checked again before they come back. Shank Hall (Milwaukee) and Ardmore Music Hall (Philadelphia) sort after this
cut but before the cut of the literal reading as estimated below (that estimate predates the 17 Oct role corrections). The undecided venues of Portland, San Francisco, Toronto and Washington sort
after both cuts; in Washington any one of them would bring The Atlantis back. We record it here so that it can be weighed.

**Literal reading of Amendment 1, estimated before compiling.** Amendment 14's last item reports the study beside the result with every
company named as presenting a counted show treated as an operator of the room. The scouting pages already show these links:
- Futuresound Group, which owns and books The Wardrobe, presents some nights at Brudenell Social Club. Leeds becomes one cluster and
  fails §5: both rooms leave.
- Triple D's presents nights at both 529 and The EARL. Atlanta becomes one cluster and fails §5: both rooms leave.
- MODO-LIVE, which owns The Pearl, presents some nights at Rickshaw Theatre and single shows at Horseshoe Tavern. The three rooms become
  one cluster; Vancouver then has one cluster and fails §5 (with Rio Theatre gone on §1, below), so The Pearl and Rickshaw Theatre
  leave, and Horseshoe Tavern stays (Tranzac is another cluster in Toronto).
- Paradiso presents a minority of Bitterzoet's shows, is credited ('i.s.m. Paradiso') on 8 counted Cinetol rows, and is the house
  booker of Tolhuistuin's house room. Bitterzoet, Cinetol and Tolhuistuin become one cluster; OCCII is another, so Amsterdam keeps §5.
- Loft Concerts presents shows at both Privatclub and Urban Spree. The two become one cluster.
- §1 hits on counted rows: Live Nation at Rio Theatre (1 S1 row, 30 Apr), at The Louisiana (3 'Live Nation Presents' rows and 1
  'Live Nation & SJM Concerts Present' row) and at Arts at the Armory (1 S1 'Live Nation Presents' row), and The Bowery Presents, which
  is AEG-affiliated, at Arts at the Armory (4 S1 and 2 S2 rows). The three venues leave; the runner drops the whole building. This
  assumes that 'Live Nation' and 'The Bowery Presents' are on `ln-aeg.csv`, which is not in the repository yet.

If `shows.csv` confirms these in S1 or S2, 29 clusters hold a test room after §1 and §5. Applied again, the cap keeps 20 in 8 metros
(Amsterdam, Berlin, Boston, Copenhagen, Manchester, Milwaukee, Montreal, Philadelphia); the venues of 14 of the main study's 20 clusters survive, as 13 clusters (Privatclub and Urban Spree join). These figures predate the 17 Oct role corrections and no longer hold:
Cinetol's Zaal and Festsaal Kreuzberg's Festsaal are now test rooms, and whether Cinetol joins Bitterzoet's cluster depends on
'i.s.m. Paradiso', which the compiled list does not record as presenting. The runner reports the literal reading from `shows.csv`
and `ln-aeg.csv`.
Fewer remain if `presented_by` links more rooms (the presenters at Badehaus, Festsaal Kreuzberg, Pumpehuset, VEGA, the Manchester
rooms, The Burren, the other Boston rooms, Raleigh and St. Louis have not been compared; Trinity Music, at Privatclub and Festsaal
Kreuzberg, could join Berlin into one cluster, which would then fail §5) or names Live Nation or AEG at a room (§1). The claim rule's
N ≥ 8 stays within reach under that estimate; the run reports the number and the intervals either way.

## Every scouted candidate
Registered = §1-6 as first written. Amended = with Amendments 1-14 (binding). "Counted" = S1 / S2 after the Amendment 4 rules.

### United States

| Metro | Venue | Operator (cluster) | Counted S1 / S2 | Registered | Amended | Why |
|---|---|---|---|---|---|---|
| Atlanta | 529 | the venue: house booking; owner not publicly identified, no Live Nation or AEG link found | 66 / 72 | eligible | **test room** | Local promoters present some nights (one of them, Triple D's, also at The EARL). |
| Atlanta | The EARL | private owners, house booking | ≥40 / ≥30 | eligible | **test room** | Counted on web.archive.org copies of its own listing. |
| Atlanta (Decatur) | Eddie's Attic | private owners, house booking | 25 / ≥15 | not used | not used | §3: "Unauthorized use or reproduction is strictly prohibited" (eddiesattic.com/terms-of-service/, §3). |
| Nashville | Station Inn | private owner, house booking | 105 / 104 | not used | not used | §3: "Nothing on this website can be copied or duplicated without written consent" (footer, stationinn.com). Also §5: no other Nashville venue was scouted. |
| Lawrence, KS | The Bottleneck | same owner and booking as The Granada | 51 / 53 | unclear: rests on The Granada | not used | §5: the only other Lawrence venue left is the same cluster and below coverage. |
| Lawrence, KS | The Granada | same as The Bottleneck | 22 / 18 | unclear: 21 S2 rows listed, 3 of them football watch parties | not used | §4: S2 18 after Amendment 4. |
| Lawrence, KS | Replay Lounge | private, house booking | 161 / 154 | not used | not used | §3: a licence "for personal, non-commercial transitory viewing only" (replaylounge.com/privacy-policy/, "Use License"). |
| Kansas City | recordBar | private co-owners; Mammoth Presents (majority-owned by CTS Eventim) presents many nights, about 25 rows in 3 snapshots, with no Live Nation or AEG stake found | ≥54 / ≥25 | not used | not used | §5: no other Kansas City venue had dated past listings (Knuckleheads lists past acts without dates). One S2 night was presented by AEG Presents as a promoter. |
| Denver | hi-dive | private owners, house booking | 61 / 58 | not used | not used | §5: the other Denver venue, Larimer Lounge, is out on §3. |
| Denver | Larimer Lounge | a private owner (who also owns Globe Hall and Lost Lake Lounge), in-house booking team | Larimer Lounge room ≥73 / ≥50; Ski House and Treehouse about 26 / 15; Campground 5 / 14 | not used | not used | §3, platform terms: the site is built by Rockhouse Partners, an Etix company (reading 4). Counted on web.archive.org copies before that was found. |
| Boston (Somerville) | The Rockwell | private family restaurant group, house booking | 121 / 73 | eligible | **test room** | Two S2 rows are marked canceled only in the site's list view, not in the feed. Many counted rows are theatre or comedy; the music category alone is about 39 / 32. |
| Boston (Cambridge) | Lizard Lounge | private family group (with the restaurant upstairs), house booking | 59 / 57 | eligible | not used | §3 (reading 5): on 17 Oct, when the show list was compiled, the events feed answered with a 403 Cloudflare check page; nothing was read another way. On 14 Oct the feed was open; "No Event Tonight" and closed-night rows (26 in each period) were not counted. |
| Boston (Cambridge) | Club Passim | 47 Palmer Inc. (nonprofit, operating as Passim), house booking | ≥79 / ≥84 | eligible | **test room** | Counted on web.archive.org copies of its own calendar page; the live page lists coming shows only. "Passim Presents" shows in other buildings are not counted. Dropped at first while scouting for its size, which is not a §1-6 rule. |
| Boston (Cambridge) | The Lilypad | private owner, house booking and rentals | 193 / 175 | not used | not used | §3, platform terms: the site is built on Squarespace (reading 4). |
| Boston (Somerville) | Arts at the Armory | The Center for Arts at the Armory (non-profit) runs it in a city-owned building; booking through its own form, most nights rentals by outside groups, none presenting more than half | 107 / 97 in all; Performance Hall 54 / 47, ROOTED Cafe 53 / 49 | eligible | **test room** (Performance Hall, ROOTED Cafe) | Rooms from the Events Manager category field (reading 7); the B5 Lavender Room and the house room are pool. Many counted rows are dance socials, classes, comedy without the word and fairs, which the Amendment 4 words do not remove. Outside presenters include The Bowery Presents (4 + 2) and Live Nation (1 S1 row). |
| Boston (Somerville) | The Burren | private owners, house booking; the Backroom Series is run by an outside promoter (24 Hour Concerts), whose ticket link is on 49 of the 77 counted back-room rows of the capture, with no presenting credit | ≥112 / ≥41 in all; Back Room ≥55 / ≥22, Front Room ≥57 / ≥19 | eligible | **test room** (Back Room) | Lower bounds from one web.archive.org copy of its music page (21 May 2026); 1 Apr-17 May not read. Each row's Room cell places it (reading 7). 4 of the Back Room's S2 rows are titled 'TBD'. The Front Room is pool for now. |
| Ann Arbor | The Ark | nonprofit membership organisation, house booking | 78 / 76 | not used | not used | §5: no other Ann Arbor venue was scouted. |
| Detroit | Cliff Bell's | private owners, house booking | 151 / 157 | not used | not used | §5: no other Detroit venue had a usable source. |
| San Francisco | Bottom of the Hill | Bottom Of The Hill Inc., house booking | 81 / 75 | eligible | **test room** | Announced to close after 31 Dec 2026, after S2. Its own RSS feed gives 81 / 74 show dates, a second route to the same count. |
| San Francisco | Make-Out Room | private owner, house booking | ≥51 / ≥57 | eligible | **test room** | Nights with a titled event that is not a DJ night (one blog post per night). Listed for sale in June 2026; no buyer was reported by mid-October. |
| San Francisco (Berkeley) | The UC Theatre | Berkeley Music Group (nonprofit), house booking | 26 / 10 | not used | not used | §4: S2 10. |
| San Francisco (Berkeley) | Cornerstone | private owners; booker not established | not counted | not used | not used | §3: the terms forbid access "through automated or non-human means" (cornerstoneberkeley.com/terms-of-use). |
| San Francisco | Cafe du Nord | operating company; Live Nation presents most shows | not counted | not used | not used | §1: the venue says "Live Nation presents most of the shows on our calendar". Its terms only state ownership and would pass §3. |
| San Francisco | Starline Social Club | a local owner group | 0 / 0 | not used | not used | §4: no countable row in any room. Also built by Rockhouse Partners (reading 4). |
| San Francisco | Thee Parkside, Ivy Room (Albany) | | not counted | not used | not used | §3, platform terms: both sites are built on Squarespace (reading 4). |
| San Francisco (Oakland) | Yoshi's | private owners, house booking | ≥35 / ≥49 | eligible | **test room** | One web.archive.org copy of its own home page (18 May 2026); 1 Apr-17 May not covered. Oakland is in the San Francisco-Oakland-Fremont MSA. Its own custom CMS. |
| St. Louis | Blueberry Hill Duck Room | booked by The Pageant's booking company; The Pageant is 50% owned by Live Nation (press, Mar 2026) | 29 / 22 | not used | not used | §1. |
| St. Louis | Red Flag | private owner, house booking | ≥39 / ≥15 | not used | not used | §4: S2. |
| St. Louis | Blue Strawberry | private owners, in-house booking and its own ticketing | ≥35 / ≥29 | eligible | **test room** | One web.archive.org copy of its own home page (17 May 2026); S1 covers 19 May-30 Jun only. Two S2 rows are early and late sets of one act (28 act-nights). Its §5 partner is Off Broadway. |
| St. Louis | Off Broadway | private owners, house booking ('Presented by Off Broadway') | ≥25 / ≥27 | eligible | **test room** | Re-admitted on §5 (17 Oct): Blue Strawberry is another cluster in the metro; a second check under the 16 Oct readings upheld it. One web.archive.org listing copy (16 May) plus the CDX index of its show pages; 1 Apr-15 May not covered. Built on Webflow, which passes; Opendate's terms bind organizers, not visitors (reading 4). |
| St. Louis | Old Rock House | a local private operating company, house booking | ≥41 / ≥24 | not used | not used | §3: its host answered a 403 during the check (reading 5); also built by Rockhouse Partners (reading 4). Nothing read from it is used. |
| Indianapolis | HI-FI | MOKB Presents (independent promoter) | 89 / 81 | not used | not used | §3: "You may not reproduce, distribute, or create derivative works of any content from the website without express written permission" (hifiindy.com/terms-and-conditions/). |
| Indianapolis | The Vogue | private owners | ≥38 / ≥21 | not used | not used | §3: personal use only, "You must not republish material" (thevogue.com/terms-conditions). |
| Richmond | The Camel | private owner, house booking | ≥151 / ≥113 | not used | not used | §5: no other Richmond venue was scouted. |
| Cleveland | Beachland Ballroom and Tavern | private co-owners, house booking | Ballroom 44 / 32, Tavern 64 / 34 | not used | not used | §5: no other Cleveland venue was scouted. |
| Los Angeles | Lodge Room | owner-operator (also runs Checker Hall), house booking | 85 / 83 | not used | not used | §3: a bot check guards the site's own show archive (reading 5). Robots.txt and its terms allow reading; the events feed was open, and we did not use it to get round the check. |
| Los Angeles | Hotel Cafe | private owners, house booking | Main Stage 74 / 28, Second Stage 114 / 60 | not used | not used | §5: the other Los Angeles venue is out on §3. Its stage is a category field (Main Stage 215, Second Stage 75). |
| Los Angeles | Checker Hall | the owner-operator of Lodge Room | 0 / 0 | not used | not used | §2 and §4: no dated listing of its own for the periods. |
| Milwaukee | Linneman's Riverwest Inn | private owner, house booking | 56 / 54 | eligible | **test room** | |
| Milwaukee | Cactus Club | private owner, house booking (co-promotes some off-site shows) | 138 / 125 | eligible | **test room** | Off-site rows are labelled and not counted. |
| Milwaukee | The Pabst Theater | Pabst Theater Group (owner and house booker, privately co-owned), cluster `mke-ptg` | 20 / about 24 (15 S2 rows confirmed on detail pages) | eligible | **test room** | One room: each detail page's Venue field places the row; the other PTG buildings are not counted. 2 S1 rows are marked canceled only on their pages. S2 reaches 20 only if 5 of the 9 rows placed by thumbnail code alone are Pabst rows. The site runs on carbonhouse and sells through AXS (AEG companies), which are vendors, not owner or booker. |
| Philadelphia | PhilaMOCA | private operator, house programming in a building rented from a private owner; R5 Productions presents 25 of 147 counted rows | ≥69 / ≥78 | eligible | **test room** | Re-admitted on §5 (17 Oct): MilkBoy Philadelphia is another cluster in the metro; a second check under the 16 Oct readings upheld it. Counted on 8 web.archive.org copies of its own home page; 67 / 76 if the 'Comedy@PhilaMOCA' label is read with the title. Tickets mostly through Etix, which does not host the site. |
| Philadelphia | MilkBoy Philadelphia | MilkBoy (private co-owners); house booker Rising Sun Presents (also Ardmore Music Hall and The 8x10), cluster `rising-sun-presents` | ≥55 / ≥59 | eligible | **test room** | Union of three web.archive.org copies of its own home page; one moved and one off-site row taken out. One upstairs room, capacity 200. |
| Philadelphia | Kung Fu Necktie | owner not identified, house calendar | ≥76 / ≥75 (main room 53 / 49, KFN room 23 / 26) | not used | not used | §3, platform terms: the site is built by Rockhouse Partners, an Etix company (reading 4). |
| Austin | Antone's Nightclub | private owners, in-house booking; Ticketmaster is the ticket vendor only | about 59 / about 67 (estimates; 7 / 11 confirmed on its pages) | not used | not used | §5: no other eligible Austin venue (Continental Gallery and Mohawk are out). |
| Boise | Neurolux | house booker Duck Club Entertainment (presents 37 of 66 counted rows and co-presents 1); bar owner not identified | ≥38 / ≥28 | not used | not used | §5: no other eligible Boise venue. 19 karaoke rows removed (Amendment 4). |
| Chicago | Green Mill | private owners (two longtime managers since 19 Jun 2026), house booking | 129 / 157 | not used | not used | §5: Hideout is excluded (Amendment 11), and Martyrs', Old Town School of Folk Music and Reggies are undecided. |
| Omaha | Reverb Lounge | owned by the founders of 1% Productions, which books it; cluster `oma-1percent` with The Waiting Room Lounge | ≥32 / ≥23 | not used | not used | §5: Omaha's other venue, The Waiting Room Lounge, is the same cluster. The site uses the Rockhouse Partners events plugin, but no page read carries the 'Powered by ROCKHOUSE PARTNERS' credit, so reading 4 does not apply. |
| Omaha | The Waiting Room Lounge | same as Reverb Lounge | ≥37 / ≥46 (main room ≥35 / ≥44, joint nights with Reverb Lounge 2 / 2, Outdoors 0 / 0) | not used | not used | §5: same cluster as Reverb Lounge. Rooms from the venue field (reading 7). Rockhouse Partners plugin without the credit, as at Reverb Lounge. |
| Pittsburgh | Mr Smalls | private owner couple; Opus One Productions (independent) books most national acts in the Theatre, the in-house Mr. Smalls Presents the rest | ≥22 / ≥23 in all; Theatre ≥6 / ≥7, Funhouse ≥3 / ≥4, Cafe ≥13 / ≥12 | not used | not used | §5: no other eligible Pittsburgh venue. Rooms from the location field; no room is shown at 20 / 20, so it could only be pool. PromoWest (AEG) co-presents 2 of 13 counted Theatre rows. |
| Raleigh | Kings | private owners (three local people since Oct 2023), house booking | ≥21 / ≥26 | eligible | **test room** | S1 margin 1; 1 Apr-14 May unseen. No presenter has more than 4 of the 47 counted rows. |
| Raleigh | The Pour House Music Hall & Record Shop | private owner, who is the sole talent buyer | ≥36 / ≥31 | eligible | **test room** | Built on Webflow, which passes (reading 4). S1 from one web.archive.org copy (16 May 2026). Record-shop listening parties count (30 / 30 without them). |
| Salt Lake City | The State Room | The State Room Presents (owner and house booker; NIVA Live Independent certified) | 38 / 23 | not used | not used | §5: no other eligible Salt Lake City venue. From the operator's own iCal feed; without 5 World Cup streams S2 would be 18. AXS (AEG) is the ticket vendor only. |
| Washington | The Atlantis | I.M.P. (independent promoter; owner and house booker, also 9:30 Club, The Anthem, Lincoln Theatre) | ≥27 / 25 | not used | not used | §5: Black Cat is excluded (Amendment 11), I.M.P.'s other rooms are the same cluster, and Pie Shop, Bossa and The Pocket are undecided. One web.archive.org copy (19 May 2026). |
| Minneapolis-St Paul | Icehouse, Crooners, Cedar Cultural Center, Berlin, Parkway Theater, White Squirrel Bar | various | not counted | not used | not used | §6: Study 1's metro. |
| Chicago, Washington DC | Hideout, Black Cat | | not counted | not checked | not used | Amendment 11: Study 1's placebo rooms. |

### Canada

| Metro | Venue | Operator (cluster) | Counted S1 / S2 | Registered | Amended | Why |
|---|---|---|---|---|---|---|
| Montreal | Turbo Haus | private co-owner, house booking (many nights by local promoters) | 106 / 101 | eligible | **test room** | Its site is the venue's own build (all files from its own host); no site-builder platform. |
| Montreal | Le Ministère | Les Productions Le Ministère, in-house programming; a rental hall where outside companies present most nights, none more than half. It likely shares an operations team with Club Soda (owned by L-A BE since 2023). | ≥31 / 21 | eligible | **test room** | S1 from web.archive.org copies of its own listing and its own event pages (1-23 Apr not covered), S2 from its own event pages. evenko (49% Live Nation) presents 1 of 21 S2 rows. Dropped while scouting for its programme, which is not a §1-6 rule. |
| Montreal | Théâtre Fairmount | Neon Productions (local promoter; third-party sources), room rented or co-promoted per show | 37 / 21 | not used | not used | §3, platform terms: the site is built on Squarespace (reading 4). evenko (49% Live Nation) presents 3 of 37 S1 and 4 of 21 S2 rows. |
| Toronto | Tranzac | member-run not-for-profit | ≥25 / ≥25 in all; Southern Cross ≥16 / ≥15, other rooms fewer | eligible | **test rooms** (Southern Cross, Living Room, Main Hall, Zine Library) | Rooms from each event's rooms field (reading 7). Compiled 17 Oct (16 Apr-30 Sep): Southern Cross 183 / 252, Living Room 46 / 57, Main Hall 30 / 26, Zine Library 22 / 26, house room 4 / 7. |
| Toronto | Horseshoe Tavern | private co-owners, house booking (an independent promoter presents a minority of nights) | ≥78 / ≥61 | eligible | **test room** | Counted on web.archive.org copies of its own pages; the live site lists coming shows only. Built on Webflow, whose terms do not decide it (reading 4). |
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
| London | The Underworld | Glendola Leisure (private pub and bar company), in-house promoters | 74 / 60 | not used | not used | §5: no other eligible London venue. Counted from its own event sitemaps, not exact. Live Nation presents a minority of gigs as an outside promoter. |
| Manchester | YES | Now Wave (independent promoters), house programming | 133 / 77 in all; The Pink Room 64 / 30, Basement 56 / 37, Roof Terrace 12 / 7, Bar 0 / 1, house room 1 / 2 | eligible | **test room** (The Pink Room, Basement) | Rooms from each row's room field (reading 7); Roof Terrace, Bar and the house room are pool. Its own hand-built site. |
| Manchester | Night & Day Cafe | private family owner, house booking | ≥26 / ≥27 | eligible | **test room** | One room: no room field. |
| Manchester | The Castle Hotel | freehold owned by a regional brewer, run by a private pub group; house management hires the room to outside promoters, none near half | ≥26 / ≥25 | eligible | **test room** | Lower bounds: sampled days on its own date filter plus web.archive.org copies. |
| Manchester | Band on the Wall | Inner City Music Ltd (charity), house programme | 137 / 97 | not used | not used | §3: "All such rights are reserved"; copying is limited to one printed copy and extracts (bandonthewall.org/terms-of-use/). |
| Manchester | Deaf Institute | Tokyo Industries (also Gorilla) | ≥31 / 98 | not used | not used | §3, platform terms: the site is built on Fatsoma. |
| Manchester | Gorilla | Tokyo Industries (also Deaf Institute) | 54 / 51 | not used | not used | §3, platform terms: the site is built on Fatsoma. |
| Glasgow | Nice'n'Sleazy | owner not named publicly, house booking | Bar 49 / 55, Basement 94 / 78 | not used | not used | §5: the other Glasgow venues are out (The Garage on a bot check). |
| Glasgow | The Garage | Hold Fast Entertainment Ltd (owner; for sale since Jul 2026, no buyer named); every show by outside promoters, none more than half (DF Concerts, a Live Nation joint venture, about 26%) | rooms 18 / 15, 16 / 11, 20 / 9 | not used | not used | §3: one web.archive.org copy of its gig listing is a hosting check page (reading 5). Without that it would be pool only: no room reaches 20 / 20. |
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
| Amsterdam | Tolhuistuin | Stichting Tolhuistuin with THT Horeca BV and Stichting Paradiso; Paradiso is the house booker of the house room (117 of its 130 rows), Parallel of the Club | ≥171 / ≥91 in all; house room 85 / 45, IJzaal 33 / 11, Club 16 / 5, Tuin 12 / 18, other rooms fewer | eligible | **pool only** | Rooms from the agenda's location field (reading 7); counted on five web.archive.org copies. No named room reaches 20 / 20; the house room does, but it holds the rows with no room and stays pool (Amendment 14). |
| Copenhagen | Pumpehuset | management-owned company in a municipal building, house booking | 20 / 20 | eligible | **test room** | One room (reading 7): Byhaven, its free outdoor stage at the same address, appears only in titles, the concert pages have no room field, and the location filter covers only the coming programme. At the line; the compile decides. |
| Copenhagen | VEGA | Koncertvirksomhedens Fond (foundation), house booking | Store VEGA ≥33 / ≥15, Lille VEGA ≥21 / ≥9, Ideal Bar ≥17 / ≥7 | eligible | **pool only** | Rooms from the site's room filter. No room confirmed at 20 / 20. |
| Copenhagen | ALICE | Fonden ALICE (foundation), house booking by its music group | 43 / 30 (≥28 / ≥23 confirmed on-site) | eligible | **test room** | From its own past-event month lists; off-site rows show only in the page text. KLANG Festival presents 7 of the 43 S1 rows. |
| Copenhagen | Loppen | Musikforeningen Loppen (members' association), in-house booking | 34 / 21 | eligible | **test room** | From its own past-shows listing. S2 rests on the three Frigjort Festival nights, whose pages head the line-up 'Loppen'; read as off-site, S2 would be 18. |
| Berlin | Hole44 | Channel Music GmbH | 39 / 16 | not used | not used | §4: S2. |
| Berlin | Festsaal Kreuzberg | Neue Flutgraben Betriebsgesellschaft (operating company; promoters' association) | ≥24 / ≥30 in all; Festsaal ≥16 / ≥21 | eligible | **test room** (Festsaal) | Rooms from each event's location field (reading 7). Compiled 17 Oct from all 626 event pages: Festsaal 30 / 21, Biergarten 2 / 8, house room 6 / 1. |
| Berlin | Badehaus | Badehaus Musik GmbH (owner and house booker); outside promoters present single shows | ≥90 / ≥34 | eligible | **test room** | Counted on web.archive.org copies of its own listing; 19 pub-quiz rows removed (Amendment 4). |
| Berlin | Privatclub | Milchmädchen Musikkultur GmbH, house booking; outside promoters present most nights, none more than half (Trinity Music GmbH 21 of 127, Loft Concerts 7) | 83 / about 44 (≥21 confirmed on its event pages) | eligible | **test room** | Union of five web.archive.org copies of its own home page; 3 of 24 sampled S2 pages are now marked ABGESAGT. Served through Cloudflare as a CDN; no challenge was met. |
| Berlin | Urban Spree | Urban Spree GmbH; no house booker (13 different promoters on 16 sampled pages, the largest with 3) | 36 / 27 | eligible | **test room** | On the 16 Oct queue; checked on 16 Oct 2026 UTC. Exact, from the Concerts filter of its own programme pages. Loft Concerts presents shows here and at Privatclub. |

### Checked in full on 16-17 Oct 2026, without a table row
These venues came from the 16 Oct queue and the archive survey lists below. Each had a full §1-6 check with a second, skeptical
check. They have no table row: 39 are not used and 41 are undecided.

**Not used (39).**
- §1 (4): Academy Dublin (Dublin): MCD, which counts as Live Nation, is named as a partner in the venue, and its stake and its booking
  role are not disclosed; Brooklyn Bowl (New York): Live Nation's own filing and the venue's privacy policy show it as Live Nation
  owned or operated; The Roxy (Los Angeles): Goldenvoice, wholly owned by AEG, is the house booker; Underground Arts (Philadelphia):
  public sources name AEG Live (2015) and The Bowery Presents (AEG) for it.
- §3, terms that forbid copying or reuse, or allow personal use only (reading 3) (11): Columbiahalle (Berlin; also §4, S2 13);
  Frannz Club (Berlin); Georgia Theatre (Athens; its footer links AEG's terms); Hotel Esplanade (Melbourne); Lager House (Detroit);
  Neumos (Seattle); Ophelia's Electric Soapbox (Denver); Smalls Jazz Club (New York); The Great Hall (Toronto); Visulite Theatre
  (Charlotte); White Oak Music Hall (Houston).
- §3, terms that cannot be read (reading 4) (2): Continental Gallery (Austin): its listing site, continentalclub.com, is built on
  Squarespace; Natalie's Grandview (Columbus): its terms page loads the text from a policy service that robots.txt does not let us read.
- §3, a bot check or a 403 from the venue host (reading 5) (2): Higher Ground (Burlington): a 403 'Just a moment...' check page;
  The Mint (Los Angeles): a 403 on its /api/ path.
- §2 or §4 (20): Belgrave Music Hall & Canteen (Leeds): no countable dated source; Dee's Country Cocktail Lounge (Nashville): 0 / 0;
  Electric Brixton (London): S2 17; Jazz St. Louis (St. Louis): S2 4; Lost Lane (Dublin): no own dated listing; Mohawk (Austin): no
  own listing or feed; Northcote Social Club (Melbourne): no own dated source; ONCE Somerville (Boston): 0 / 0, now a promoter without
  a room of its own; Q-Factory (Amsterdam): S2 15 and no room at 20 / 20; Rae's London (London): 4 / 3; Rosemount Hotel (Perth): no
  countable source; Star Theater (Portland): S1 cannot be shown on any allowed source (its footer also reads 'powered by TicketWeb');
  Stereo (Glasgow): S2 ≥6; Sunset Tavern (Seattle): a DICE widget only; The 8x10 (Baltimore): S2 0, closed for renovation; The Heavy
  Anchor (St. Louis): ≥7 / ≥2; The New Parish (San Francisco): no count is possible without the archive (its footer also reads
  'powered by TicketWeb', and the terms it refers to cannot be found); The Peer Hat (Manchester): 11 / 6; The Tote (Melbourne): 0 / 0;
  Zebulon (Los Angeles): a DICE widget only.

**Undecided (41).** Unless noted, §1-3 pass and the open point is coverage (§4, for some also §2), which needs web.archive.org copies because
the venue's own listing keeps only coming shows:
- Before the main cut: Center Stage (Atlanta; 3 rooms, per room); Cassiopeia (Berlin); Lido Berlin (Berlin; no archive needed, 67 /
  39 on its own pages; open are the room reading and whether the Festsaal Kreuzberg operator runs it); Martyrs', Old Town School of
  Folk Music and Reggies (Chicago; the last two per room); Music Box Supper Club (Cleveland; per room); Amager Bio & BETA (Copenhagen;
  S2 19 of 20 for the building) and BETA (Copenhagen; its own stage ≥13 / ≥7); Lost Lake Lounge (Denver; also a check for the
  Rockhouse Partners credit); The Magic Bag (Detroit; ≥13 / ≥14); SWG3 (Glasgow; §1: whether DF Concerts counts as Live Nation and
  presents more than half of a room's shows); The Lexington (London; few rows verified, the rest needs several hundred event-page reads or the archive); Whisky a Go Go
  (Los Angeles; S1 20, S2 14 confirmed on its own event pages, the rest held up by the venue-host request cap).
- Single-venue metros before the main cut, which fail §5 alone: Launchpad (Albuquerque); 40 Watt Club (Athens; ≥7 / ≥5); Saturn
  (Birmingham); Woodward Theater (Cincinnati; S1 16 confirmed, S2 ≥26; held up by the venue-host request cap, not by the archive); Club Dada
  (Dallas); Pilot Light (Knoxville).
- Between the main cut and the literal cut: Shank Hall (Milwaukee; its past-month calendars are disallowed by robots.txt, so only
  archive copies of the bare listing can be read); Ardmore Music Hall (Philadelphia; S1 26, S2 19 of 20).
- After both cuts: Aladdin Theater, Mississippi Studios, Polaris Hall, Revolution Hall and Wonder Ballroom (Portland; Wonder Ballroom
  S1 15 confirmed, S2 ≥26); Brick & Mortar Music Hall and Great American Music Hall (San Francisco; also §1: whether Goldenvoice
  presents more than half), Hotel Utah Saloon, The Chapel and The Lost Church (San Francisco); The Garrison (Toronto; also the room
  split) and Lee's Palace (Toronto; passes at ≥26 / ≥24 for the main room, open is The Dance Cave's role); Pie Shop (Washington; S2
  ≥44, S1 not counted), Bossa Bistro + Lounge (Washington; per room) and The Pocket at 7DrumCity (Washington; S1 10 before the site's
  100-item list cap, S2 not countable).
- Single-venue metros with no effect: Nectar Lounge (Seattle), The Night Cat (Melbourne; S2 ≥38), Tipitina's (New Orleans), Oxford
  Art Factory (Sydney).

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
- Copies cover both periods (20) and coverage unclear (11): every one of these 31 sites was checked in full on 16-17 Oct.
  They are in the tables above or in "Checked in full on 16-17 Oct 2026, without a table row".
- No usable copies for S1 or S2 (27): Barfly Camden (London); Barrowland Ballroom (Glasgow); Bi Nuu (Berlin); Biltmore Cabaret (Vancouver); Brunswick Ballroom (Melbourne); Burdock Brewery music hall (Toronto); Bush Hall (London); Cactus Cafe & Bar (Austin); Corner Hotel (Melbourne); Crowbar Brisbane (Brisbane); DC9 (Washington); Delmar Hall (St. Louis); Doug Fir Lounge (Portland); El Club (Detroit); Gasa Gasa (New Orleans); Harlow's (Sacramento); Headrow House (Leeds); Holy Diver (Sacramento); Knuckleheads (Kansas City); MOTH Club (London); MOTR Pub (Cincinnati); Mahall's (Cleveland); Richmond Music Hall (Richmond); The Baby G; The Evening Muse (Charlotte); The Waiting Room (London); The Workers Club (Melbourne).
- Out on their own terms (§3, reading 3) (7): Belly Up (San Diego); Club Soda (Montreal); Headliners Music Hall (Louisville); Manchester Academy (Manchester); SO36 (Berlin): its terms page /agb is disallowed by its robots.txt, so the terms are unclear; Songbyrd (Washington); The Majestic Theatre complex (Detroit).
- Out on a bot check (reading 5) (1): Casa del Popolo / La Sala Rossa (Montreal).
- Out on §1 (1): The Pageant (St. Louis): 50% owned by Live Nation.
- Out on §6 (1): The Hook and Ladder (Minneapolis), Study 1 metro.

**Queued, never run (stopped 16 Oct).** Full checks (32): all 32 were run on 16-17 Oct; they are in the tables above or in "Checked in full on 16-17 Oct 2026, without a table row".
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
