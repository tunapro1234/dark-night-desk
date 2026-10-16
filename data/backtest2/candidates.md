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
   room, because every eligible venue feeds its metro pool (VEGA, Tranzac, Festsaal Kreuzberg).

## Result
20 clusters hold a test room, in 11 metros. That is the 20-cluster cap of `BACKTEST-2.md` exactly, so the cap drops none.

| Metro | Test rooms (one cluster each) | Pool-only rooms |
|---|---|---|
| Atlanta | 529, The EARL | |
| Berlin | Badehaus | Festsaal Kreuzberg (6 rooms) |
| Boston | Club Passim, Lizard Lounge, The Rockwell | |
| Copenhagen | Pumpehuset | VEGA (5 rooms) |
| Leeds | Brudenell Social Club, The Wardrobe | |
| Manchester | The Castle Hotel, Night & Day Cafe | |
| Milwaukee | Cactus Club, Linneman's Riverwest Inn | |
| Montreal | Le Ministère, Turbo Haus | |
| San Francisco | Bottom of the Hill, Make-Out Room | |
| Toronto | Horseshoe Tavern | Tranzac (5 rooms) |
| Vancouver | The Pearl, Rickshaw Theatre | |

`venues.csv` lists the rooms by metro, then by `venue_id`. That order is fixed before compiling. The cap keeps the first 20 clusters
with a test room in that order, and the order sets the seed-2 placebo chains (Amendment 12); both are derived again from the file if a
role changes.

**Rooms at the line.** Pumpehuset is at 20 / 20 and Le Ministère has 21 in S2. Several counts are lower bounds read from advance
listings (Badehaus S2, The Castle Hotel, Night & Day Cafe): a later cancellation does not show in them, so they are not strict lower
bounds. The compiled `shows.csv` confirms or corrects each role (Amendment 12), with the reason in `sources.md`. A test room that falls
short becomes pool; if it was its metro's only other cluster, the metro's other test rooms fail §5 and leave too. VEGA's, Tranzac's and
Festsaal Kreuzberg's per-room counts are lower bounds, so their rooms are pool for now; a room that reaches 20 in both periods on
`shows.csv` becomes a test room in the same way.

**Where the check stopped (16 Oct 2026).** The full checks were stopped on 16 Oct to keep within the compute budget, with the queue
not empty: the venues still waiting are listed at the end, under "not checked". The 20-cluster cap was already reached. This was
decided before any show list was compiled, before any Qloo call and without any fit rating. It is not neutral: the cap keeps clusters
in file order, so a venue left unchecked in a metro that sorts earlier (Philadelphia, for one, with Ardmore Music Hall and Underground
Arts surveyed as promising) could have pushed out a later cluster (San Francisco, Toronto or Vancouver) had it been checked and
paired. We record it here so that it can be weighed; the study is run on these 20.

**Literal reading of Amendment 1, estimated before compiling.** Amendment 14's last item reports the study beside the result with every
company named as presenting a counted show treated as an operator of the room. The scouting pages already show these links:
- Futuresound Group, which owns and books The Wardrobe, presents some nights at Brudenell Social Club. Leeds becomes one cluster and
  fails §5: both rooms leave.
- Triple D's presents nights at both 529 and The EARL. Atlanta becomes one cluster and fails §5: both rooms leave.
- MODO-LIVE, which owns The Pearl, presents some nights at Rickshaw Theatre and single shows at Horseshoe Tavern. The three rooms become
  one cluster; Vancouver then has one cluster and fails §5, so The Pearl and Rickshaw Theatre leave, and Horseshoe Tavern stays (Tranzac
  is another cluster in Toronto).

If `shows.csv` confirms these in S1 or S2, about 14 clusters remain, fewer if `presented_by` links more rooms (the promoters at the
Berlin and Manchester rooms have not been compared) or names Live Nation or AEG at a room (§1). The claim rule's N ≥ 8 stays within
reach under that estimate; the run reports the number and the intervals either way.

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
| Boston (Cambridge) | Lizard Lounge | private family group (with the restaurant upstairs), house booking | 59 / 57 | eligible | **test room** | "No Event Tonight" and closed-night rows (26 in each period) are not shows and are not counted. |
| Boston (Cambridge) | Club Passim | 47 Palmer Inc. (nonprofit, operating as Passim), house booking | ≥79 / ≥84 | eligible | **test room** | Counted on web.archive.org copies of its own calendar page; the live page lists coming shows only. "Passim Presents" shows in other buildings are not counted. Dropped at first while scouting for its size, which is not a §1-6 rule. |
| Boston (Cambridge) | The Lilypad | private owner, house booking and rentals | 193 / 175 | not used | not used | §3, platform terms: the site is built on Squarespace (reading 4). |
| Ann Arbor | The Ark | nonprofit membership organisation, house booking | 78 / 76 | not used | not used | §5: no other Ann Arbor venue was scouted. |
| Detroit | Cliff Bell's | private owners, house booking | 151 / 157 | not used | not used | §5: no other Detroit venue had a usable source. |
| San Francisco | Bottom of the Hill | Bottom Of The Hill Inc., house booking | 81 / 75 | eligible | **test room** | Announced to close after 31 Dec 2026, after S2. Its own RSS feed gives 81 / 74 show dates, a second route to the same count. |
| San Francisco | Make-Out Room | private owner, house booking | ≥51 / ≥57 | eligible | **test room** | Nights with a titled event that is not a DJ night (one blog post per night). Listed for sale in June 2026; no buyer was reported by mid-October. |
| San Francisco (Berkeley) | The UC Theatre | Berkeley Music Group (nonprofit), house booking | 26 / 10 | not used | not used | §4: S2 10. |
| San Francisco (Berkeley) | Cornerstone | private owners; booker not established | not counted | not used | not used | §3: the terms forbid access "through automated or non-human means" (cornerstoneberkeley.com/terms-of-use). |
| San Francisco | Cafe du Nord | operating company; Live Nation presents most shows | not counted | not used | not used | §1: the venue says "Live Nation presents most of the shows on our calendar". Its terms only state ownership and would pass §3. |
| San Francisco | Starline Social Club | a local owner group | 0 / 0 | not used | not used | §4: no countable row in any room. Also built by Rockhouse Partners (reading 4). |
| San Francisco | Thee Parkside, Ivy Room (Albany) | | not counted | not used | not used | §3, platform terms: both sites are built on Squarespace (reading 4). |
| St. Louis | Blueberry Hill Duck Room | booked by The Pageant's booking company; The Pageant is 50% owned by Live Nation (press, Mar 2026) | 29 / 22 | not used | not used | §1. |
| St. Louis | Red Flag | private owner, house booking | ≥39 / ≥15 | not used | not used | §4: S2. |
| St. Louis | Off Broadway | private owners, house booking | ≥27 / ≥27 | not used | not used | §5: no other eligible St. Louis venue. |
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
| Philadelphia | PhilaMOCA | private operator, house programming | ≥69 / ≥79 | not used | not used | §5: the only other checked Philadelphia venue is out on §3. |
| Philadelphia | Kung Fu Necktie | owner not identified, house calendar | ≥76 / ≥75 (main room 53 / 49, KFN room 23 / 26) | not used | not used | §3, platform terms: the site is built by Rockhouse Partners, an Etix company (reading 4). |
| Minneapolis-St Paul | Icehouse, Crooners, Cedar Cultural Center, Berlin, Parkway Theater, White Squirrel Bar | various | not counted | not used | not used | §6: Study 1's metro. |
| Chicago, Washington DC | Hideout, Black Cat | | not counted | not checked | not used | Amendment 11: Study 1's placebo rooms. |

### Canada

| Metro | Venue | Operator (cluster) | Counted S1 / S2 | Registered | Amended | Why |
|---|---|---|---|---|---|---|
| Montreal | Turbo Haus | private co-owner, house booking (many nights by local promoters) | 106 / 101 | eligible | **test room** | Its site is the venue's own build (all files from its own host); no site-builder platform. |
| Montreal | Le Ministère | Les Productions Le Ministère, in-house programming; a rental hall where outside companies present most nights, none more than half. It likely shares an operations team with Club Soda (owned by L-A BE since 2023). | ≥31 / 21 | eligible | **test room** | S1 from web.archive.org copies of its own listing and its own event pages (1-23 Apr not covered), S2 from its own event pages. evenko (49% Live Nation) presents 1 of 21 S2 rows. Dropped while scouting for its programme, which is not a §1-6 rule. |
| Montreal | Théâtre Fairmount | Neon Productions (local promoter; third-party sources), room rented or co-promoted per show | 37 / 21 | not used | not used | §3, platform terms: the site is built on Squarespace (reading 4). evenko (49% Live Nation) presents 3 of 37 S1 and 4 of 21 S2 rows. |
| Toronto | Tranzac | member-run not-for-profit | ≥25 / ≥25 in all; Southern Cross ≥16 / ≥15, other rooms fewer | eligible | **pool only** | Rooms from each event's rooms field (reading 7). No room is shown at 20 / 20. |
| Toronto | Horseshoe Tavern | private co-owners, house booking (an independent promoter presents a minority of nights) | ≥78 / ≥61 | eligible | **test room** | Counted on web.archive.org copies of its own pages; the live site lists coming shows only. Built on Webflow, whose terms do not decide it (reading 4). |
| Vancouver | Rickshaw Theatre | private owner, house booking and hires | 55 / 33 | eligible | **test room** | MODO-LIVE presents some nights (see The Pearl). |
| Vancouver | The Pearl | MODO-LIVE (independent promoter and operator, also owner of Lee's Palace in Toronto), owner and house presenter | ≥76 / ≥61 | eligible | **test room** | Counted on web.archive.org copies of its own home page. Its own cluster `modo-live`. |

### United Kingdom and Ireland

| Metro | Venue | Operator (cluster) | Counted S1 / S2 | Registered | Amended | Why |
|---|---|---|---|---|---|---|
| Leeds | Brudenell Social Club | not-for-profit company, house booking | ≥76 / ≥51 | eligible | **test room** | One room: the source does not say which of its two rooms an event is in. |
| Leeds | The Wardrobe | Futuresound Group (owner and booker) | ≥42 / ≥27 | eligible | **test room** | Futuresound also presents some nights at Brudenell and Hyde Park Book Club as an outside promoter. |
| Leeds | Hyde Park Book Club | private owner, house booking | ≥20 / ≥35 | not used | not used | §3, platform terms: the site is built on Squarespace (reading 4). |
| Bristol | The Louisiana | private family; mostly outside promoters per show | 85 / 68 | not used | not used | §5: no other Bristol venue had a usable source. |
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
| Copenhagen | Pumpehuset | management-owned company in a municipal building, house booking | 20 / 20 | eligible | **test room** | One room (reading 7): Byhaven, its free outdoor stage at the same address, appears only in titles, the concert pages have no room field, and the location filter covers only the coming programme. At the line; the compile decides. |
| Copenhagen | VEGA | Koncertvirksomhedens Fond (foundation), house booking | Store VEGA ≥33 / ≥15, Lille VEGA ≥21 / ≥9, Ideal Bar ≥17 / ≥7 | eligible | **pool only** | Rooms from the site's room filter. No room confirmed at 20 / 20. |
| Berlin | Hole44 | Channel Music GmbH | 39 / 16 | not used | not used | §4: S2. |
| Berlin | Festsaal Kreuzberg | Neue Flutgraben Betriebsgesellschaft (operating company; promoters' association) | ≥24 / ≥30 in all; Festsaal ≥16 / ≥21 | eligible | **pool only** | Rooms from each event's location field (reading 7). No room is shown at 20 / 20. |
| Berlin | Badehaus | Badehaus Musik GmbH (owner and house booker); outside promoters present single shows | ≥90 / ≥34 | eligible | **test room** | Counted on web.archive.org copies of its own listing; 19 pub-quiz rows removed (Amendment 4). |

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
- Copies cover both periods; never checked in full (20): Academy Dublin (Dublin); Amager Bio & BETA (Copenhagen); Antone's Nightclub (Austin); Ardmore Music Hall (Philadelphia); Blue Strawberry (St. Louis); Brick & Mortar Music Hall (San Francisco); Cyprus Avenue (Cork); Great American Music Hall (San Francisco); Kings (Raleigh); LOPPEN (Copenhagen); Lido Berlin (Berlin); Reverb Lounge (Omaha); The Chapel (San Francisco); The Pabst Theater (Milwaukee); The Underworld (London); The Waiting Room Lounge (Omaha); Underground Arts (Philadelphia); Whisky a Go Go (Los Angeles); White Oak Music Hall (Houston); Yoshi's (San Francisco).
- Coverage unclear; never checked in full (11): 40 Watt Club (Athens); Belgrave Music Hall & Canteen (Leeds); Cassiopeia (Berlin); Center Stage (Atlanta); Cinetol (Amsterdam); Hotel Utah (San Francisco); Mr Smalls (Pittsburgh); Northcote Social Club (Melbourne); Trinity Centre (Bristol); Wonder Ballroom (Portland); Woodward Theater (Cincinnati).
- No usable copies for S1 or S2 (27): Barfly Camden (London); Barrowland Ballroom (Glasgow); Bi Nuu (Berlin); Biltmore Cabaret (Vancouver); Brunswick Ballroom (Melbourne); Burdock Brewery music hall (Toronto); Bush Hall (London); Cactus Cafe & Bar (Austin); Corner Hotel (Melbourne); Crowbar Brisbane (Brisbane); DC9 (Washington); Delmar Hall (St. Louis); Doug Fir Lounge (Portland); El Club (Detroit); Gasa Gasa (New Orleans); Harlow's (Sacramento); Headrow House (Leeds); Holy Diver (Sacramento); Knuckleheads (Kansas City); MOTH Club (London); MOTR Pub (Cincinnati); Mahall's (Cleveland); Richmond Music Hall (Richmond); The Baby G; The Evening Muse (Charlotte); The Waiting Room (London); The Workers Club (Melbourne).
- Out on their own terms (§3, reading 3) (7): Belly Up (San Diego); Club Soda (Montreal); Headliners Music Hall (Louisville); Manchester Academy (Manchester); SO36 (Berlin): its terms page /agb is disallowed by its robots.txt, so the terms are unclear; Songbyrd (Washington); The Majestic Theatre complex (Detroit).
- Out on a bot check (reading 5) (1): Casa del Popolo / La Sala Rossa (Montreal).
- Out on §1 (1): The Pageant (St. Louis): 50% owned by Live Nation.
- Out on §6 (1): The Hook and Ladder (Minneapolis), Study 1 metro.

**Queued, never run (stopped 16 Oct).** Full checks (32): The Great Hall (Toronto); OCCII (Amsterdam); Lager House (Detroit); Frannz Club (Berlin); Privatclub Berlin (Berlin); Bitterzoet (Amsterdam); Stereo (Glasgow); Tolhuistuin (Amsterdam); MilkBoy Philadelphia (Philadelphia); Q-Factory (Amsterdam); Urban Spree (Berlin); Hotel Esplanade (Melbourne); The Night Cat (Melbourne); Continental Gallery (Austin); Nectar Lounge (Seattle); Brooklyn Bowl (New York); Music Box Supper Club (Cleveland); Oxford Art Factory (Sydney); The 8x10 (Baltimore); Natalie's (Worthington room) (Columbus); Dee's Country Cocktail Lounge (Minneapolis); Pie Shop (Washington); Columbiahalle (Berlin); Electric Brixton (London); The Center for Arts at the Armory (Boston); The Lost Church; Smalls; The Peer Hat (Manchester); Tipitina's (New Orleans); Visulite Theatre (Charlotte); Higher Ground; Reggies.
Archive surveys (66; most were found by the 15 Oct host retry): ALICE (Copenhagen); Aladdin Theater (Portland); BETA (small stage of Amager Bio) (Copenhagen); Bootleg Theater (Los Angeles); Bossa Bistro + Lounge (Washington); Bovine Sex Club (Toronto); Burdock Music Hall (Toronto); Club Dada (Dallas); Flicker Theatre & Bar (Athens); Georgia Theatre (Athens); Gold Diggers (Los Angeles); Green Mill (Chicago); Hi-Ho Lounge (New Orleans); Irving Theater (Indianapolis); Jazz St. Louis (St. Louis); Launchpad (Albuquerque); Lazybones Lounge (Sydney); Lee's Palace (Toronto); Lost Lake Lounge (Denver); Lost Lane (Dublin); Martyrs' (Chicago); Mississippi Studios (Portland); Mohawk (Austin); Neumos (Seattle); Neurolux (Boise); ONCE Somerville (Boston); Old Town School of Folk Music (Chicago); Ophelia's Electric Soapbox (Denver); Pat's Pub (Hastings Mill Brewing) (Vancouver); Pilot Light (Knoxville); Polaris Hall (Portland); Quasimodo (Berlin); Rae's London (London); Revolution Hall (Portland); Rio Theatre (Vancouver); Rosemount Hotel (Perth); SWG3 (Glasgow); Saturn (Birmingham); Shank Hall (Milwaukee); Star Theater (Portland); Sunset Tavern (Seattle); The Atlantis (Washington); The Burren (Boston); The End (Nashville); The Firkin; The Garrison (Toronto); The Heavy Anchor (St. Louis); The Lexington (London); The Magic Bag (Detroit); The Mint (Los Angeles); The New Parish (San Francisco); The Old Market Assembly (Bristol); The Pocket (7DrumCity) (Washington); The Pour House Music Hall (Raleigh); The Roxy (Los Angeles); The Sheldon (St. Louis); The Starry Plough (San Francisco); The State Room (Salt Lake City); The Tote (Melbourne); The Victoria (London); Thekla (Bristol); Trinosophes (Detroit); Underground Music Cafe; Willis Show Bar (Detroit); YES (Manchester); Zebulon (Los Angeles).

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
