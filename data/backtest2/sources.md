# Study 2 source notes

Public pages only, for the pre-registered Study 2 in `BACKTEST-2.md`. Nothing here is a ranking result. No Qloo or LLM ranking call
was made. Show lists are compiled later and get their own section below.

## Eligibility check (14-16 Oct 2026)
- Every page was read with one fetcher that enforces robots.txt (RFC 9309 matching). It reads the rules for its own token and for `*`,
  and also every group that names an Anthropic agent (ClaudeBot, Claude-User, Claude-SearchBot, Claude-Web, anthropic-ai); all of them
  must allow the path. It waits at least 2.5 s between requests to a host (6 s on web.archive.org), honours any Crawl-delay, stops a host
  for good at its first 403 or 429, and refuses ticketing, aggregator, social and setlist sites outright.
- User-Agent: `Mozilla/5.0 (research; dark-night-desk)`. GET only.
- 3,568 requests in all, logged from 14 Oct 19:29 to 16 Oct 06:09 UTC, to 518 hosts: the scouted venues' sites (including the 15 Oct
  retry of hosts that failed the first sweep), their terms pages, platform terms, the Internet Archive (552 requests) and press pages.
  531 of them are robots.txt reads. Per-venue counts for the venues in `venues.csv` are below.
- Venues that sent a 403, a bot check or a robots.txt refusal were not read in any other way. One exception was found afterwards and is
  closed by Amendment 14: Lodge Room's own show archive sits behind a bot check, while its events feed was open and was read during the
  check. Lodge Room is not used, and nothing read from it is used.
- During early scouting (14 Oct 2026), before this fetcher was written, 21 requests to five hosts went to paths their robots.txt
  disallows, and one more read a web.archive.org copy of such a page. The causes were chiefly a robots parser bug (wildcard rules) and
  a generic user agent that skipped the rules written for Claude's agents. None of that data was used: the bodies are quarantined
  pending deletion, and none of the five venues is in `venues.csv`. A few hosts were fetched before their robots.txt was read; it
  allowed those paths. A few pages of one site whose terms forbid automated reading were read; nothing was saved or used. The fetcher
  used since then reads the rules for ClaudeBot, the other Anthropic agents and `*` separately, and all of them must allow a path.
- One narrow exception was added to the fetcher's refusal list on 15 Oct: Etix's own policy pages
  (`www.etix.com/ticket/online3/...privacy|purchase|terms|legal...jsp` and `hello.etix.com/`), so that the terms of the Rockhouse Partners
  sites could be judged. Etix listings and ticket pages are still refused. 3 page requests and 2 robots.txt reads were made.
- One web.archive.org copy of The Garage's gig listing (Glasgow, 13 Mar 2026) is a hosting check page served to the Archive's crawler.
  Under reading 5 the venue is not used and its other copies are not used either; our own live requests to it got no check.
- Verdicts for every scouted venue: `candidates.md`. Readings of §3: Amendment 14.

## Platform and archive terms (read 14-16 Oct 2026)
- **Fatsoma** (https://www.fatsoma.com/policies): "Website" takes in "such other URL or URLs as Fatsoma may ... decide by means of which
  Fatsoma may provide the Service"; clause 5.1.6 forbids copying content. Unclear whether it reaches the venue sites it builds, so they
  are not used (Deaf Institute, Gorilla).
- **Music Glue** (https://www.musicglue.com/policies): its "Website" expressly includes pages hosted or powered by Music Glue. Not used
  (Hug & Pint).
- **Squarespace** (https://www.squarespace.com/terms-of-service, effective 27 Mar 2025; https://www.squarespace.com/acceptable-use-policy,
  updated 24 Feb 2020): the Services are defined openly ("including without limitation"), the visitors of a customer's site are called
  users of the Services, and Acceptable Use Policy 1.6 forbids access "by any means other than our publicly supported interfaces (for
  example, scraping, spidering or crawling)". Unclear, so not used (The Lilypad, Hyde Park Book Club, Button Factory, Théâtre Fairmount).
- **Weebly** (https://termsandprivacy.weebly.com/tos-en.html, updated 27 Nov 2023), host of Make-Out Room: "THESE TERMS APPLY SOLELY TO
  THE SERVICE. ... WE HOST WEBSITES FOR CERTAIN THIRD PARTIES ("THIRD PARTY SITES") ... YOUR ACCESS OR USE OF ANY THIRD PARTY SITE IS
  GOVERNED BY THE TERMS APPLICABLE TO SUCH THIRD PARTY SITE." The venue site has no terms, so it passes.
- **Wix** (https://www.wix.com/about/terms-of-use, last revised 9 Jul 2026), host of The Grand Social: the terms forbid access to
  "User Content", the content of its customers' sites, "through any means or technology (e.g. scraping and crawling), other than our
  publicly supported interfaces". They call a customer's visitors "End Users", but no sentence leaves those sites to their own terms.
  Unclear, so not used (The Grand Social), as with Fatsoma and Squarespace. Pages already read from it are not used (Amendment 14).
- **Webflow** (https://webflow.com/legal/terms, effective 15 Nov 2023; https://webflow.com/legal/aup, effective 6 Oct 2026), host of
  Horseshoe Tavern: ToS 4.4, "Webflow does not have a direct relationship with any of your End Users"; the Acceptable Use Policy forbids
  scraping only of material "outside of what is intentionally made available". The terms bind Webflow's customers, not the visitors
  of their sites, so they do not decide the venue, as with Weebly. Read on 15 Oct 2026 (3 requests with robots.txt).
- **Rockhouse Partners / Etix.** 18 scouted venue sites say "Powered by ROCKHOUSE PARTNERS an ETIX company", linked to hello.etix.com;
  some (Old Rock House) give Etix's own pages as their privacy and purchase policy. Those pages
  (https://www.etix.com/ticket/online3/privacy-policy.jsp, .../purchase-policy.jsp) return only a script shell that loads a bot-defence
  check, so their text cannot be read, and hello.etix.com links no terms of use. Whether Etix's terms reach the visitors of these sites
  is unclear, so they are not used (Larimer Lounge, Kung Fu Necktie, Old Rock House and 15 more; list in `candidates.md`), as with
  Fatsoma. Read on 15 Oct 2026.
- **Ticket widgets.** The Wardrobe's event pages embed a See Tickets price widget, and Lizard Lounge's an Eventbrite one. The listings
  are the venues' own WordPress pages and feeds; no widget content and no ticket site is read.
- **Hosting providers** (GoDaddy, Pantheon, CarrierZone) bind their account holders, not visitors, and are not the site's terms.
- **Internet Archive** (web.archive.org). Its Terms of Use (dated 31 Dec 2014) bind anyone who reads an archived page on its site, so they
  bind us directly. The live page https://archive.org/about/terms.php is a JavaScript shell; its text comes from
  https://archive.org/metadata/ia-page-terms, read on 15 Oct 2026, and matches word for word the server-rendered copy of 4 Nov 2024
  (https://web.archive.org/web/20241104205241id_/https://archive.org/about/terms.php). They have no clause on robots, crawling, scraping
  or request rates, and web.archive.org's robots.txt allows the snapshot and CDX paths used. The change notice
  (https://blog.archive.org/?p=9040, 30 Dec 2014) shows that the bans on copying offsite and on commercial use were taken out. What
  remains: access is "for scholarship and research purposes only", use is "limited to noninfringing or fair use", no personal data is
  collected about anyone, and the Archive's servers are not interfered with. This back-test is pre-registered research published with
  the Archive cited; its rows are show dates and titles (facts) and hold no data about private persons; requests to web.archive.org were at
  least 6 s apart at the start of each request (25 of 552 got a 503 and 20 timed out or failed). So the terms are met. They do not replace the venue's own terms, which are judged as for
  a live site. Used for The EARL, Bottom of the Hill, VEGA, Club Passim, Horseshoe Tavern, The Pearl and Badehaus, and in part for Brudenell,
  The Wardrobe, Le Ministère, The Castle Hotel and Night & Day Cafe.

## Venues in `venues.csv`
### 529 (`atl-529`, Atlanta)
- Source: WordPress REST, custom post type cp-event: show date in meta._date, time in meta._time, headliners in meta._event_headliners (cp-band ids resolved through /wp-json/wp/v2/bands)
- Read: https://529atlanta.com/wp-json/wp/v2/events?per_page=100&page=1..3 (page 4 has only shows up to 2025-11-07)
- robots.txt (14 Oct 2026): allowed. robots.txt: 'User-Agent: * / Disallow:' (allow all). No Anthropic-specific groups.
- Terms (14 Oct 2026): none-found. Checked: https://529atlanta.com/ (footer); https://529atlanta.com/terms/ (404); https://529atlanta.com/terms-of-use/ (404); https://529atlanta.com/terms-of-service/ (404); https://529atlanta.com/terms-and-conditions/ (404); https://529atlanta.com/legal/ (404); https://529atlanta.com/privacy-policy/ (404); https://529atlanta.com/page-sitemap.xml (lists every page; none is a terms page); https://529atlanta.com/no-title/ (Safe Ride Home policy; not terms)
- Requests during the eligibility check: 529atlanta.com 22

### The EARL (`atl-earl`, Atlanta)
- Source: Own listing pages. The live homepage and /show-calendar/ list only upcoming shows, 20 cards per page. Each /show/<slug>/ page prints the show date. Past listings were read from web.archive.org snapshots of the venue's own homepage listing. The REST /wp-json/wp/v2/show has post dates only, not show dates.
- Read: https://web.archive.org/web/<ts>id_/https://badearl.com/ for ts 20260411052928, 20260512125117 (S1), 20260729221850, 20260809125436 (S2). Show pages on https://badearl.com/show/<slug>/ for date checks.
- robots.txt (14 Oct 2026): allowed. badearl.com robots.txt: 'User-agent: * Crawl-delay: 10 Disallow: /admin/ /includes/ /config/ /logs/ /backup/ /.env /wp-admin/ /wp-includes/'. The homepage, /show-calendar/ and /show/ are allowed (the 10 s delay was honoured). web.archive.org has no robots.txt (404, allow).
- Terms (14 Oct 2026): none-found. Checked: https://badearl.com/ (footer); https://badearl.com/contact/; https://badearl.com/terms/ (404); https://badearl.com/terms-of-use/ (404); https://badearl.com/terms-of-service/ (404); https://badearl.com/terms-and-conditions/ (404); https://badearl.com/legal/ (404); https://badearl.com/privacy-policy/ (404); https://badearl.com/wp-sitemap-posts-page-1.xml (pages: coming-soon, contact, home, menu-daily only)
- Requests during the eligibility check: badearl.com 20

### Badehaus (`ber-badehaus`, Berlin)
- Source: HTML listing of the venue's own WordPress site (Events Manager plugin), read from web.archive.org copies; the live site shows future events only (event-sitemap.xml holds 91 current/future entries, past events are removed)
- Read: https://web.archive.org/web/<ts>id_/https://badehaus-berlin.com/events/ (copies 20260317, 20260410, 20260417, 20260512, 20260607, 20260613, 20260920), /en/events/ (20260515), homepage https://badehaus-berlin.com/ (20260524, 20260627)
- Dates checked: As It Is: listing 'Di. 09.06.2026 | 19:00 UHR' = event page '09.06.2026 Badehaus Berlin Einlass 19:00 Beginn 20:00' (web.archive.org/web/20260607083812/https://badehaus-berlin.com/events/as-it-is/); 42 / DBG: 'Fr. 24.07.2026 | 19:00 UHR' = '24.07.2026 Badehaus Berlin Einlass 19:00 Beginn 20:00' (web.archive.org/web/20260608211746/https://badehaus-berlin.com/events/42-dbg/); jaschu 'Fri 15.05.2026 | 19:00 UHR' with an Eventim ticket link for the Badehaus show. Dates are show dates (doors/start), not post dates.
- robots.txt (15 Oct 2026): allowed. Live robots.txt (Yoast): 'User-agent: * / Disallow:' (empty) plus Sitemap: https://badehaus-berlin.com/sitemap_index.xml; no Anthropic group. polite.py allowed every URL read; web.archive.org allowed.
- Terms (15 Oct 2026): copyright-only. Only notice on the site: '(c) 2020 Badehaus Musik GmbH' (a bare notice, which Amendment 14 says is not terms). Footer links are only 'Impressum / Datenschutzerklaerung | Cookie-Richtlinien | Getraenkekarte | Jobs'. The Impressum/privacy page and the cookie policy contain no clause on copying, reuse or automated access. Every standard terms path returned 404. Platform: self-hosted WordPress (hosted by ALL-INKL; Events Manager, WPBakery, TranslatePress), not Fatsoma/Squarespace/Wix/Music Glue. Checked: https://badehaus-berlin.com/; https://badehaus-berlin.com/datenschutzerklaerung/; https://badehaus-berlin.com/cookie-richtlinie-eu/; https://badehaus-berlin.com/faq/; https://badehaus-berlin.com/contact/; https://badehaus-berlin.com/veranstalter/; https://badehaus-berlin.com/terms (404); https://badehaus-berlin.com/terms-of-use (404); https://badehaus-berlin.com/terms-of-service (404); https://badehaus-berlin.com/terms-and-conditions (404); https://badehaus-berlin.com/legal (404); https://badehaus-berlin.com/agb (404); https://badehaus-berlin.com/nutzungsbedingungen (404); https://badehaus-berlin.com/impressum (404)
- Platform: Self-hosted WordPress (Events Manager plugin, WPBakery, TranslatePress, Yoast), hosted by ALL-INKL. Tickets go through many outside sellers (Eventim, Eventbrite, RA, Landstreicher, vvk.link, Tickettoaster and others).
- Coverage: S1 >=90, S2 >=34 (union of 10 web.archive.org copies of the own listing; no copy between 27 Jun and 20 Sep, so Jul-Sep rows are advance listings). 14 S1 and 5 S2 pub-quiz rows removed (Amendment 4).
- Requests during the eligibility check: badehaus-berlin.com 23, web.archive.org 15

### Festsaal Kreuzberg (`ber-festsaal-*`, Berlin)
- Source: The site's own Wagtail CMS API at admin.festsaal-kreuzberg.de/api/v2, which the homepage itself calls, plus the SSR program pages. Event pages have the fields date, changed_date, start, status (cancelled / transferred / moved_date / sold_out), location (room) and new_location (other building). The type=home.EventPage list returns only upcoming events, so past events were read page by page.
- Read: https://admin.festsaal-kreuzberg.de/api/v2/pages/?limit=250&offset=N (all 624 event page ids and slugs) -> https://admin.festsaal-kreuzberg.de/api/v2/pages/<id>/ or https://festsaal-kreuzberg.de/de/programm/<slug>/
- Dates checked: Ty Segall (id 766): page title 'Ty Segall – Mo, 14 Sept 2026', 'Festsaal 19:00 Einlass 20:00 Beginn', payload date 2026-09-14. Emma Ruth Rundle (id 883): date 2027-03-22, doors 19:00, start 20:00. Festa Junina (id 833): date 2026-06-27, changed_date 2026-08-01, status moved_date, counted on 08-01. Rafiki Open Air (id 816): date 2026-06-28 with a stale changed_date of 2025-06-15 and no moved status, counted on 06-28. These are show dates.
- robots.txt (14 Oct 2026): allowed. festsaal-kreuzberg.de and admin.festsaal-kreuzberg.de robots.txt: 'User-Agent: * Allow: /'. No AI group.
- Terms (14 Oct 2026): none-found. No terms of use. The Impressum and Datenschutz have nothing on reuse or automated access. Checked: https://festsaal-kreuzberg.de/ (footer: Datenschutz, Impressum); https://festsaal-kreuzberg.de/de/impressum/; https://festsaal-kreuzberg.de/de/datenschutz/ (no copyright, crawler or automation clause); https://festsaal-kreuzberg.de/terms (soft 404, 'undefined'); https://festsaal-kreuzberg.de/de/agb/ (soft 404); https://festsaal-kreuzberg.de/de/info/faq/
- Rooms: the location field of each event page (Festsaal, Biergarten, Gewächshaus, Kaminzimmer, Ostflügel); rows with no location go to the house room.
- Coverage: Lower bounds from 74 of 624 event pages: Festsaal 16 / 21, Biergarten 2 / 8, no location 6 / 1 (24 / 30 in all). No room is shown at 20 / 20, so every room is pool for now; a room that reaches 20 in both periods on `shows.csv` becomes a test room (Amendment 12).
- Platform: Wagtail CMS on its own admin host, not Squarespace, Wix, Fatsoma or Music Glue.
- Requests during the eligibility check: admin.festsaal-kreuzberg.de 61, festsaal-kreuzberg.de 39

### Lizard Lounge (`bos-lizard`, Boston)
- Source: The Events Calendar (tribe) REST
- Read: https://lizardloungeclub.com/wp-json/tribe/events/v1/events?start_date=2026-04-01&end_date=2026-06-30&per_page=50&page=N (S2: 2026-07-01..2026-09-30)
- robots.txt (14 Oct 2026): allowed. User-agent * disallows only /calendar*/action~*/ (ai1ec views) and the ai1ec exporter. There is no ClaudeBot or anthropic group. /wp-json/ and /event/ are allowed.
- Terms (14 Oct 2026): none-found. Checked: https://lizardloungeclub.com/; https://lizardloungeclub.com/terms; https://lizardloungeclub.com/terms-of-use; https://lizardloungeclub.com/terms-of-service; https://lizardloungeclub.com/terms-and-conditions; https://lizardloungeclub.com/legal; https://lizardloungeclub.com/about/
- Requests during the eligibility check: lizardloungeclub.com 26

### Club Passim (`bos-passim`, Boston)
- Source: HTML page with an embedded FullCalendar JS events array (fields: title, detail, date, start, showtime, link, categories, ticketButton, postID) on the venue's own https://www.passim.org/live-music/. The live page lists only upcoming shows (2026-10-15 to 2027-02-26) and past event pages are dropped from the sitemap, so S1/S2 come from web.archive.org copies of that same own page. WordPress REST exposes no event type (/wp-json/wp/v2/types: posts, pages, popups only).
- Read: https://web.archive.org/web/<ts>id_/https://www.passim.org/live-music/ (6 snapshots requested at 20260320, 20260402, 20260525, 20260705, 20260810, 20260915; going by the first listed date, the copies served were taken about Mar 13, Apr 20, May 21, Jul 10, Aug 1 and Sep 16 2026)
- Dates checked: Confirmed on 3 examples that the array 'date' field is the local show date. Will Varley: array 2026-10-19 at 17:00 and 20:00; page says 'Monday, October 19, 2026 2 Shows! 5:00PM and 8:00PM'. Twangville Songwriter Showcase: array 2026-10-20 20:00; page says 'Tuesday, October 20, 2026 Doors 7PM | Show 8PM'. Heather Maloney (S1, wayback copy of the event page): array 2026-04-26; page says 'Sunday, April 26, 2026 2 Shows! 5:00PM and 8:00PM'. The 'start' value carries '+0000' but equals local showtime (8PM = T20:00), so it is not real UTC and the 'date' field is used as is. No starts between 00:01 and 04:59 were seen.
- robots.txt (15 Oct 2026): allowed. https://www.passim.org/robots.txt (fetched 2026-10-15): 'User-agent: * / Disallow: /wp-admin/ / Allow: /wp-admin/admin-ajax.php'. polite.py allowed every page read. clubpassim.org redirects to www.passim.org. polite.py allowed web.archive.org (the CDX query returned 503 and was not retried).
- Terms (15 Oct 2026): copyright-only. Footer on every page: '©2026' plus 'Site by ICS' (credit link to icscreative.com). No terms of use, privacy page or 'use licence' text found. I searched every page read for reproduc/republish/personal use/non-commercial and found no sentence forbidding copying or reuse. Platform: self-hosted WordPress with a custom theme by ICS Creative (not Squarespace, Wix, Fatsoma or Music Glue). Ticket checkout is on a Salesforce site, but the listings are on passim.org itself. Checked: https://www.passim.org/ (footer); https://www.passim.org/terms/ (404); https://www.passim.org/terms-of-use/ (404); https://www.passim.org/terms-of-service/ (404); https://www.passim.org/terms-and-conditions/ (404); https://www.passim.org/legal/ (404); https://www.passim.org/privacy-policy/ (404); https://www.passim.org/sitemap.xml (no terms or privacy page listed); https://www.passim.org/live-music/ticketing-faq/; https://www.passim.org/live-music/booking-info/; https://www.passim.org/mission/; https://www.passim.org/mission/accessibility/; https://www.passim.org/live-music/experience-passim/
- Platform: Self-hosted WordPress (custom theme 'Site by ICS'); in-room tickets through Passim's own Salesforce-sites box office; Ticketmaster only for some off-site Passim Presents shows
- Coverage: S1 >=79, S2 >=84 (union of six web.archive.org copies of the own calendar page; a single copy gives S1 58 and S2 68). Off-site "Passim Presents" rows (Arrow Street Arts, Crane Estate, Crystal Ballroom, hiking concerts) are not counted.
- Requests during the eligibility check: clubpassim.org 2, web.archive.org 10, www.passim.org 21

### The Rockwell (`bos-rockwell`, Boston)
- Source: The Events Calendar (tribe) REST
- Read: https://therockwell.org/wp-json/tribe/events/v1/events?start_date=2026-04-01&end_date=2026-06-30&per_page=50&page=N (S2: 2026-07-01..2026-09-30)
- robots.txt (14 Oct 2026): allowed. User-agent * disallows only /wp-admin/ and /*blackhole. There is no ClaudeBot or anthropic group. polite.py allowed /wp-json/tribe/... and /calendar/...
- Terms (14 Oct 2026): none-found. Checked: https://therockwell.org/; https://therockwell.org/terms; https://therockwell.org/terms-of-use; https://therockwell.org/terms-of-service; https://therockwell.org/terms-and-conditions; https://therockwell.org/legal; https://therockwell.org/contact-us/
- Requests during the eligibility check: therockwell.org 24

### Pumpehuset (`cph-pumpehuset`, Copenhagen)
- Source: Own WordPress concert pages /koncerter/<slug>/ from the concert sitemaps (h1 title, presenter line, Danish date '7. aug 2026', 'Showet starter' time). The program list is a POST to admin-ajax and was not used.
- Read: https://pumpehuset.dk/sitemap_index.xml -> concert-sitemap*.xml -> https://pumpehuset.dk/koncerter/<slug>/
- robots.txt (14 Oct 2026): allowed. Yoast robots: User-agent: * Disallow: (empty), allow all; no AI-token groups.
- Terms (14 Oct 2026): none-found. Checked: https://pumpehuset.dk/terms/; https://pumpehuset.dk/terms-of-use/; https://pumpehuset.dk/terms-of-service/; https://pumpehuset.dk/terms-and-conditions/; https://pumpehuset.dk/legal/; https://pumpehuset.dk/handelsbetingelser/; https://pumpehuset.dk/vilkaar/; https://pumpehuset.dk/privatlivspolitik/; https://pumpehuset.dk/faq/; https://pumpehuset.dk/om-pumpehuset/
- Requests during the eligibility check: pumpehuset.dk 67
- Rooms: one. The /program/ page has a location filter (Pumpehuset, Byhaven), but it loads by POST and offers only the coming months,
  so it cannot place an S1 or S2 row. Concert pages have no room field; Byhaven appears only in titles. Byhaven is at the same address,
  so its rows are on-site. Capacity 600: the largest figure the venue publishes ("Kransalen og Sort Sal ... 600 og 400").
- Coverage: S1 20, S2 20 (19 rows plus one page), counted on concert pages sampled by sitemap lastmod and stopped at the request budget.
  The sitemap has about 240 concert pages modified Mar-Sep 2026, and Byhaven alone presents "over 200" free concerts each April to
  September, so the role is expected to hold; the compile confirms it.

### VEGA (`cph-vega-*`, Copenhagen)
- Source: Wayback snapshots of the own homepage (Next.js __NEXT_DATA__ initialEvents.data: title, venue.name, dates[].state, firstDate; 25 per snapshot). The live sitemap lists only future events.
- Read: https://vega.dk/ and https://vega.dk/en (Wayback 20260403, 0417en, 0509, 0523, 0531, 0610, 0627en, 0811en, 0816, 0905)
- robots.txt (14 Oct 2026): allowed. vega.dk: User-agent: * Disallow: (empty), allow all. payload.vega.dk also allowed but not used for counting.
- Terms (14 Oct 2026): none-found. Checked: https://vega.dk/terms; https://vega.dk/terms-of-use; https://vega.dk/terms-of-service; https://vega.dk/terms-and-conditions; https://vega.dk/legal; https://vega.dk/handelsbetingelser; https://vega.dk/vilkaar; https://vega.dk/cookiepolitik-dit-privatliv; https://vega.dk/faq; https://vega.dk/kontakt-vega
- Requests during the eligibility check: vega.dk 16

### Brudenell Social Club (`lds-brudenell`, Leeds)
- Source: sitemap.xml -> /archive/YYYY-MM-DD-slug/ event pages (own). Wayback snapshots of /whats-on (4 Mar and 27 Aug 2026) used to sort the rows into on-site, off-site and canceled
- Read: https://www.brudenellsocialclub.co.uk/sitemap.xml ; https://www.brudenellsocialclub.co.uk/archive/<date>-<slug>/ ; https://web.archive.org/web/20260304134909id_/https://www.brudenellsocialclub.co.uk/whats-on ; https://web.archive.org/web/20260827083203id_/https://www.brudenellsocialclub.co.uk/whats-on
- robots.txt (14 Oct 2026): allowed. User-agent: * disallows only CMS folders (/blocks, /concrete, /config, /js, /tools ...). /archive/, /whats-on, /sitemap.xml and /about are allowed, and there is no Anthropic-specific group. The Wayback paths were allowed by polite.py.
- Terms (14 Oct 2026): none-found. Checked: https://www.brudenellsocialclub.co.uk/ (footer: only 'Privacy & Cookies'); https://www.brudenellsocialclub.co.uk/privacy-cookies; https://www.brudenellsocialclub.co.uk/terms (404); https://www.brudenellsocialclub.co.uk/terms-of-use (404); https://www.brudenellsocialclub.co.uk/terms-of-service (404); https://www.brudenellsocialclub.co.uk/terms-and-conditions (404); https://www.brudenellsocialclub.co.uk/legal (404)
- Requests during the eligibility check: www.brudenellsocialclub.co.uk 58

### The Wardrobe (`lds-wardrobe`, Leeds)
- Source: events-sitemap.xml -> /event/<slug>/ pages (own; date on page). Wayback snapshots of /events/ (19 Jan, 18 Apr, 9 May, 12 Jul 2026) used to find which rows fall in S1/S2.
- Read: https://www.thewardrobe.co.uk/events-sitemap.xml ; https://www.thewardrobe.co.uk/event/<slug>/ ; https://web.archive.org/web/{20260119145128,20260418041122,20260509170623,20260712120010}id_/https://www.thewardrobe.co.uk/events/
- robots.txt (14 Oct 2026): allowed. User-agent: * Disallow: /wp-admin/ only (Allow admin-ajax). No Anthropic group. The WP REST API has no events route.
- Terms (14 Oct 2026): none-found. Checked: https://www.thewardrobe.co.uk/ (footer: no terms/privacy link); https://www.thewardrobe.co.uk/terms (404); https://www.thewardrobe.co.uk/terms-of-use (404); https://www.thewardrobe.co.uk/terms-of-service (404); https://www.thewardrobe.co.uk/terms-and-conditions (404); https://www.thewardrobe.co.uk/legal (404); https://www.thewardrobe.co.uk/privacy-policy (404); https://www.futuresoundgroup.com/ (operator footer links only 'PRIVACY' and 'COMPETITION TERMS'; not read)
- Requests during the eligibility check: www.futuresoundgroup.com 4, www.thewardrobe.co.uk 67

### The Castle Hotel (`man-castle`, Manchester)
- Source: Venue's own HTML listings. /events/ shows only upcoming events (12 per page, paginated). The theme's own date filter /events/?date=DD/MM/YYYY (from jquery.main.js onSelect) returns the listing for any exact past date. There is no events REST route (the event post type is not in wp-json) and no iCal feed. Yoast event-sitemap1-3 list event URLs but carry no show dates. web.archive.org has copies of /events/ (2026-02-10, 2026-04-22) and of the homepage (nearest to 2026-06-01, 07-05, 08-01, 09-10). The CDX index was flaky (503 or timeout twice).
- Read: https://thecastlehotel.info/events/?date=DD/MM/YYYY ; https://thecastlehotel.info/events/ ; https://web.archive.org/web/20260422053418id_/https://thecastlehotel.info/events/ ; https://web.archive.org/web/2026MMDD000000id_/https://thecastlehotel.info/
- Dates checked: Event pages show the show date, the show time and a price: /events/gresley/ '05 05 2026 07.00 pm ... £14 Buy Tickets'; /events/theo-kandel/ '22 07 2026 07.00 pm ... £15'; /events/the-lotts/ '12 09 2026 07.00 pm ... £8'; /events/northcote/ '24 10 2026 07.00 pm'. Each matches its listing date. Note for the compiler: listing <time datetime='...T19:00Z'> writes local wall time with a false 'Z' (the page says 7.00 pm on a BST date), so read the time from the page, not as UTC. No evening date shifts either way. 'T00:00Z' rows are date-only.
- robots.txt (15 Oct 2026): allowed. robots.txt (Yoast block): 'User-agent: * / Disallow:' (empty), plus a Sitemap line. It has no AI-agent groups. polite.py allowed every path used.
- Terms (15 Oct 2026): none-found. No terms of use, no privacy page and no copyright notice anywhere on the site. The footer holds only 'Visit our sister venues:' with two logo links. /terms/ and /privacy-policy/ serve the homepage (canonical https://thecastlehotel.info/). The REST page list holds only Home, About, Find us, Access Information and TicketWeb Event. Checked: https://thecastlehotel.info/ (footer); https://thecastlehotel.info/terms/; https://thecastlehotel.info/privacy-policy/; https://thecastlehotel.info/wp-json/wp/v2/pages?per_page=100; https://thecastlehotel.info/page-sitemap.xml; https://thecastlehotel.info/about/; https://thecastlehotel.info/ticketweb-event/
- Platform: Self-hosted WordPress: custom theme "castle", /app/ paths, Yoast and Jetpack. It is not Fatsoma, Squarespace, Wix or Music Glue. Ticket buttons send buyers to external sellers (Skiddle, DICE, Fatsoma short links, WeGotTickets, Universe and others), but none of them hosts the site. A 2018 "TicketWeb Event" page still exists; it holds only an unrendered shortcode.
- Coverage: S1 >=26, S2 >=25 act-nights (lower bounds: days sampled through the site's own ?date= filter plus web.archive.org copies of /events/ and the home page). Rescheduled and canceled rows left out.
- Requests during the eligibility check: thecastlehotel.info 49, web.archive.org 10

### Night & Day Cafe (`man-nightday`, Manchester)
- Source: sitemap -> show pages (HTML, date without year, year inferred from weekday) + web.archive.org snapshots of the venue's own /listings/ page
- Read: https://nightnday.org/show-sitemap2.xml -> https://nightnday.org/show/<slug>/ (div.eventDate e.g. 'Sat 09 May - 10:00 pm'); https://web.archive.org/web/20260515010305id_/https://nightnday.org/listings/ , .../20260615041729id_/... , .../20260702180612id_/... (rows carry data-month-and-year)
- Dates checked: ryan-cassata: page 'Tue 19 May 7:30 pm' (sitemap lastmod 2026-03-24) = Wayback May-2026 listing 2026-05-19; piccadily-records-presents-beth-orton: page 2026-07-02 (lastmod 2026-06-10) = Wayback listing 2026-07-02; loose-joints-x-northern-grooves-2: page 'Sat 09 May' (lastmod 2026-05-06). Dates are show dates, not post dates; weekday picks a single year in 2024-2027.
- robots.txt (14 Oct 2026): allowed. User-agent: * Disallow: /wp/wp-admin/, /wp-content/uploads/wpforms/ (Yoast block: Disallow: empty); no AI-specific groups. Wayback snapshots are of /listings/, allowed.
- Terms (14 Oct 2026): none-found. Checked: https://nightnday.org/ (footer: no terms link); https://nightnday.org/page-sitemap.xml (no terms page); https://nightnday.org/terms/ 404; https://nightnday.org/terms-of-use/ 404; https://nightnday.org/terms-of-service/ 404; https://nightnday.org/terms-and-conditions/ 404; https://nightnday.org/legal/ 404
- Coverage: S1 >=26, S2 >=27 (counting stopped after 25 qualifying rows in each period; one room, no room field).
- Platform: self-hosted WordPress (not Squarespace, Wix, Fatsoma or Music Glue).
- Requests during the eligibility check: nightnday.org 58, web.archive.org 4

### Cactus Club (`mke-cactus`, Milwaukee)
- Source: HTML 'Past Events Archive' list with a dedicated show-date field (eventDate/eventTime). REST /wp-json/wp/v2/events gives only post dates and is not usable for dates.
- Read: https://www.cactusclubmilwaukee.com/events/ and /events/page/2..11/ (pages 1-11 of 125 cover 2026-03-25 to 2026-10-11)
- robots.txt (14 Oct 2026): allowed. www.cactusclubmilwaukee.com: User-agent: * disallows only wp-admin, wp-includes, trackback, login and register (cactusclubmilwaukee.com redirects to www).
- Terms (14 Oct 2026): none-found. Checked: https://www.cactusclubmilwaukee.com/ (no terms link); https://www.cactusclubmilwaukee.com/terms (404); https://www.cactusclubmilwaukee.com/terms-of-use (404); https://www.cactusclubmilwaukee.com/terms-of-service (404); https://www.cactusclubmilwaukee.com/terms-and-conditions (404); https://www.cactusclubmilwaukee.com/legal (404)
- Requests during the eligibility check: www.cactusclubmilwaukee.com 26

### Linneman's Riverwest Inn (`mke-linnemans`, Milwaukee)
- Source: The Events Calendar (tribe) REST
- Read: https://linnemans.com/wp-json/tribe/events/v1/events?start_date=2026-04-01%2000:00:00&end_date=2026-06-30%2023:59:59&per_page=50&page=1..2 (and S2)
- robots.txt (14 Oct 2026): allowed. User-agent: * Disallow: /wp-admin/ only.
- Terms (14 Oct 2026): none-found. Checked: https://linnemans.com/ (no terms link); https://linnemans.com/terms (404); https://linnemans.com/terms-of-use (404); https://linnemans.com/terms-of-service (404); https://linnemans.com/terms-and-conditions (404); https://linnemans.com/legal (404); https://linnemans.com/privacy-policy (404)
- Requests during the eligibility check: linnemans.com 18

### Le Ministère (`mtl-ministere`, Montreal)
- Source: Venue HTML. The /evenements listing is upcoming-only: a date filter for a past date returned 'Aucun résultat'. Past rows were enumerated from the venue's own sitemap (sitemap_sections_1_0.xml, 597 event URLs with lastmod), plus web.archive.org copies of /evenements. Every event page gives 'Dates de représentation', doors and start time.
- Read: https://leministere.ca/evenements/<slug> (own event pages, listed in https://leministere.ca/sitemap_sections_1_0.xml); web.archive.org copies of https://leministere.ca/evenements at 20260424192545, 20260521135903, 20260614101612 (CDX also lists 20260311132250, not fetched). There are no captures of /evenements after 2026-06-14.
- Dates checked: Card date in archived listing = date on live event page: Crash Adams card 2026-09-09 = page 'mercredi 09 septembre 2026', doors 19H00, start 20H00. Lucrecia Dalt card 2026-09-26 = page 2026-09-26, 19H00/20H00. LELO card 2026-07-07 = page 2026-07-07, 19H00/20H00. So dates are show dates. The live site also updates moved shows: Connexion IX was listed for 2026-09-11 in the May and June snapshots and now shows 2027-01-16.
- robots.txt (15 Oct 2026): allowed. https://leministere.ca/robots.txt: 'User-agent: * / Disallow: /cpresources/' plus Sitemap line. polite.py allowed every URL used, including /evenements, event pages, sitemap and the ?date= filter. web.archive.org was allowed by polite.py.
- Terms (15 Oct 2026): copyright-only. ©2026 Les Productions Le Ministère. Tous droits réservés. Checked: https://leministere.ca/ (footer links: only Événements, Productions, À propos, Services, Nous joindre, newsletter; no terms or privacy link); https://leministere.ca/terms (404); https://leministere.ca/legal (404); https://leministere.ca/a-propos/le-ministere; https://leministere.ca/a-propos/la-salle; https://leministere.ca/services/location-de-la-salle; Wayback CDX domain listing since 2026-06 (340 URL keys): no terms, conditions, legal, privacy or politique page; Text scan of all fetched pages for 'conditions d', 'reprodu', 'usage personnel': none apart from the bare footer notice
- Platform: Craft CMS, self-hosted (robots.txt disallows /cpresources/, Craft translation strings on the 404 page). It is not Squarespace, Wix, Fatsoma, Music Glue or Weebly.
- Coverage: S1 >=31 (web.archive.org copies of /evenements plus two own event pages; 1-23 Apr not covered), S2 21 (own event pages from the sitemap).
- Requests during the eligibility check: leministere.ca 45, web.archive.org 5

### Turbo Haus (`mtl-turbohaus`, Montreal)
- Source: Next.js monthly calendar pages, whose RSC payload holds id, href, title and startsAt (UTC). Event pages carry JSON-LD MusicEvent. The sitemap lists /calendrier/YYYY/M/D/slug.
- Read: https://turbohaus.ca/calendrier/2026/4 ... /2026/9 (6 pages)
- Dates checked: All 208 rows: the local date of startsAt (America/Toronto) equals the date in the URL. /calendrier/2026/4/25/chili-gutter-king: JSON-LD startDate 2026-04-26T00:00:00Z, page 'samedi 25 avril 2026 20 h 00'. /calendrier/2026/9/24/feelers--underground-fuzz--foreign-terrestrials: startDate 2026-09-25T00:00Z, page 'jeudi 24 septembre 2026 20 h 00'. These are show dates.
- robots.txt (14 Oct 2026): allowed. https://turbohaus.ca/robots.txt: User-Agent * Disallow /admin/ /api/ /next/ /menu/preview/ /*?*utm_. No AI-agent group. /calendrier/ is allowed.
- Terms (14 Oct 2026): none-found. No terms page exists. The site footer has only menu, calendar, merch, donate, tickets, tech rider and contact. Checked: https://turbohaus.ca/ (footer: no terms link); https://turbohaus.ca/terms (404); https://turbohaus.ca/terms-of-use (404); https://turbohaus.ca/terms-of-service (404); https://turbohaus.ca/terms-and-conditions (404); https://turbohaus.ca/legal (404); https://turbohaus.ca/conditions (404); https://turbohaus.ca/politique-de-confidentialite (404)
- Platform (15 Oct 2026, one request): the venue's own Next.js build; every script and image comes from its own host. thepointofsale.com is only the ticket link.
- Requests during the eligibility check: turbohaus.ca 24

### Bottom of the Hill (`sf-bottom`, San Francisco Bay Area)
- Source: Static HTML. calendar.html lists upcoming shows, one row per show, with an anchor YYYYMMDD[A]. Monthly picture calendars at calendar_archives.html -> iC2026MM.html link one day page per show (2026MMDD[A].html). Counted on web.archive.org snapshots of the own calendar.html.
- Read: https://www.bottomofthehill.com/calendar.html (9 Wayback snapshots: 20260320, 20260413, 20260513, 20260606, 20260629, 20260709, 20260807, 20260820, 20260928) and https://www.bottomofthehill.com/2026MMDD.html day pages
- robots.txt (14 Oct 2026): allowed. User-agent: * with Crawl-delay: 10. Disallows only /admin/, /includes/, /config/, /logs/, /backup/, /.env and /wp-*. calendar, iC and day pages are allowed. No AI-agent groups.
- Terms (14 Oct 2026): none-found. Checked: https://www.bottomofthehill.com/terms (404); https://www.bottomofthehill.com/terms-of-use (404); https://www.bottomofthehill.com/terms-of-service (404); https://www.bottomofthehill.com/terms-and-conditions (404); https://www.bottomofthehill.com/legal (404); https://www.bottomofthehill.com/info.html; https://www.bottomofthehill.com/faq.html; https://www.bottomofthehill.com/booking.html; https://www.bottomofthehill.com/calendar.html
- Requests during the eligibility check: www.bottomofthehill.com 25
- Also checked: tixinfo.html holds a ticket refund policy and a privacy policy dated 2008 that covers order data only; neither has a
  clause on automated reading or reuse. info.html carries a hidden link to a Project Honey Pot trap page (/ProjectHoneyPot_script/);
  the Wayback index shows that URL as 404 in every capture from 2015 to Feb 2026, so no terms page sits there, and we did not fetch it.
  info.html also carries injected spam markup, so it is not parsed for data. A TicketWeb URL inside an HTML comment on tickets.html is
  old ticketing, not ownership or booking; DICE sells tickets for late 2026.
- Second route: the site's own RSS feed (https://www.bottomofthehill.com/RSS.xml) gives 81 S1 and 74 S2 show dates.

### Make-Out Room (`sf-makeout`, San Francisco Bay Area)
- Source: Weebly blog with one post per night: blog-title (weekday and date), blog-date (M/D/YYYY) and free-text content with one or more events (bold names). Pages are 14 posts each, newest first.
- Read: https://www.makeoutroom.com/events/previous/1 .. /16 (covers 2026-03-06..2026-10-16)
- robots.txt (14 Oct 2026): allowed. User-agent: * disallows /ajax/ and /apps/. NerdyBot is fully disallowed and dotbot has Crawl-delay 10. /events/ pages are allowed for us.
- Terms (14 Oct 2026): none-found. Checked: https://www.makeoutroom.com/terms (404); https://www.makeoutroom.com/terms-of-use (404); https://www.makeoutroom.com/terms-of-service (404); https://www.makeoutroom.com/terms-and-conditions (404); https://www.makeoutroom.com/legal (404); https://www.makeoutroom.com/ (footer); https://www.makeoutroom.com/booking.html; https://www.makeoutroom.com/contact.html
- Requests during the eligibility check: www.makeoutroom.com 28

### Horseshoe Tavern (`tor-horseshoe`, Toronto)
- Source: HTML of the venue's own Webflow pages (homepage 'Upcoming Shows' list with weekday date and door time; schema.org Event JSON-LD with startDate and location 'Horseshoe Tavern' from Jun 2026). The live site lists only upcoming shows and past CMS items are removed (the sitemap holds 60 /event/ items, all current or future), so S1/S2 come from web.archive.org copies of the venue's own homepage and /events.
- Read: https://web.archive.org/web/{20260328052722 /events, 20260410160305 /, 20260516054217 /, 20260609123101 /, 20260726011441 /}id_/https://horseshoetavern.com/ ; live: https://horseshoetavern.com/ and /events
- Dates checked: These are show dates with door times. Robyn Hitchcock 'Saturday, April 11, 2026 / Door Time 8:00 pm' (Apr 10 snapshot). Noah Gundersen 'June 14, 2026', doors 7:30 pm, same in 3 snapshots. Hank Williams 103rd Birthday 'September 16, 2026', doors 8:00 pm, with JSON-LD startDate 'September 16, 2026' and location Horseshoe Tavern (Jul 26 snapshot). Live event page /event/hovvdy shows 'Monday, November 9, 2026 7:00 pm ... Horseshoe Tavern'.
- robots.txt (15 Oct 2026): allowed. https://horseshoetavern.com/robots.txt: 'User-Agent: * / Disallow: (empty) / Disallow: /talent/'. polite.py allowed every page read; web.archive.org also allowed.
- Terms (15 Oct 2026): none-found. The venue site has no terms and no copying or reuse text. The site is built on Webflow, which Amendment 14 does not name. As I read them, Webflow's terms do not reach people who visit customers' sites. ToS 1.1: 'These Terms of Service govern your access to and use of the Sites [www.webflow.com and associated domains] and Platform [the SaaS ... that you access or subscribe to]'. ToS 4.4: 'Any natural persons accessing or using your Website Content are deemed your "End Users." You agree that Webflow does not have a direct relationship with any of your End Users'. ToS 3.2: 'You understand and agree that third party individuals may search for, see, use, and/or re-post any Website Content that you make publicly available on the Internet via the Platform.' The AUP (effective Oct 6, 2026) 'supplements Customer's ... agreement between you and Webflow'. Its scraping ban covers only materials obtained 'from the Platform or Webflow IP outside of what is intentionally made available'. So even if it reached visitors, it would not forbid reading the published listings. Checked: https://horseshoetavern.com/ (footer: Events, News, Merch, History, Email Sign Up, Booking, Contact; no terms or privacy link; no copyright notice); https://horseshoetavern.com/terms (404); https://horseshoetavern.com/terms-of-use (404); https://horseshoetavern.com/terms-of-service (404); https://horseshoetavern.com/terms-and-conditions (404); https://horseshoetavern.com/legal (404); https://horseshoetavern.com/privacy (404); https://horseshoetavern.com/privacy-policy (404); https://horseshoetavern.com/booking; https://horseshoetavern.com/contact; https://horseshoetavern.com/history; https://webflow.com/legal/terms; https://webflow.com/legal/aup
- Platform: Webflow (data-wf-site, footer says "Powered by Webflow"); most tickets sold through Tixr, a minority through TicketWeb/Ticketmaster links
- Coverage: S1 >=78, S2 >=61 (union of five web.archive.org copies of the own pages; >=77 / >=59 without three rows that vanished before their date).
- Requests during the eligibility check: horseshoetavern.com 20, web.archive.org 8, www.horseshoetavern.com 1

### Tranzac (`tor-tranzac-*`, Toronto)
- Source: sitemap.xml lists /events/<slug>. Each event page's Nuxt payload gives title, startDate (with offset), rooms[] and source (the residency). The calendar page loads events client-side from /api/, which robots disallows, so it was not used.
- Read: https://tranzac.org/sitemap.xml -> https://tranzac.org/events/<slug>
- Dates checked: nags-players-presents-oscar-2026-04-16: startDate 2026-04-16T19:30:00-04:00, Main Hall. adjacent-spheres-2026-05-03: startDate 2026-05-03T22:00:00-04:00, Southern Cross. Slug dates are unreliable: tinys-jam-session-2026-05-19 has startDate 2026-05-12T21:30-04:00, and 4 of 50 pages differ from the slug by 5-7 days. The page startDate is the show date.
- robots.txt (14 Oct 2026): allowed. https://tranzac.org/robots.txt (nuxt-robots): User-agent * Disallow /api/ /Dashboard/ /Login /edit-event and similar; /events/ is allowed. Only AhrefsBot, SemrushBot and MJ12bot are fully blocked; there is no Anthropic group. www.tranzac.org redirects to tranzac.org.
- Terms (14 Oct 2026): none-found. There are no website terms of use. The footer has only a bare '© 2026 TRANZAC' line, and the policies page covers rental and event conduct only. Checked: https://tranzac.org/policies (only Payment & Cancellation, Accessibility, Code of Conduct for rentals and events); https://tranzac.org/about; https://tranzac.org/terms (404); https://tranzac.org/terms-of-use (404); https://tranzac.org/ (footer: 'policies • © 2026 TRANZAC site by Machine Magic')
- Rooms: the rooms[] field of each event page (Southern Cross, Zine Library, Living Room, Main Hall); rows with no room go to the house room.
- Coverage: Lower bounds from a seeded sample of 50 event pages, stopped at 25 qualifying rows per period: Southern Cross 16 / 15, Zine Library 4 / 7 (library open hours), Living Room 3 / 2, Main Hall 2 / 1. No room is shown at 20 / 20, so every room is pool for now; a room that reaches 20 in both periods on `shows.csv` becomes a test room (Amendment 12).
- Platform: its own Nuxt build ("site by Machine Magic"), not a site-builder platform.
- Requests during the eligibility check: tranzac.org 67, www.tranzac.org 2

### The Pearl (`van-pearl`, Vancouver)
- Source: web.archive.org id_ copies of the venue's own homepage. The homepage lists every upcoming show (an 'event-discovery' WordPress plugin fills it from TicketWeb, but the page is on the venue's own site). The live site keeps only upcoming shows and recent event pages: tm_events-sitemap.xml lists only current events, and the calendar loads by POST admin-ajax.
- Read: https://web.archive.org/web/<ts>id_/https://thepearlvancouver.com/ for ts = 20260401014514, 20260415093056, 20260501085900, 20260515085344, 20260523200958, 20260612084240, 20260713005349, 20260718205249, 20260826020628, 20260831085304, 20260924125708, plus the live https://thepearlvancouver.com/ (2026-10-15)
- Dates checked: The listed dates are show dates. (1) The event page https://thepearlvancouver.com/tm-event/daniel-james-mcfadyen-with-special-guests/ gives 'December 04, 2026 PST (Doors: 6:00 PM)', the same as the homepage list. (2) The three Wolf Parade rows (wolf-parade, -2, -3) are listed as 13, 14 and 15 Nov 2026, doors 7:00 PM, both in the 1 Apr 2026 snapshot and on the live page. (3) The event page https://thepearlvancouver.com/tm-event/sunn-o/ lists both nights, 1 and 2 Nov 2026, with doors at 7:00 PM. Each row shows a doors time beside its date.
- robots.txt (15 Oct 2026): allowed. https://thepearlvancouver.com/robots.txt = 'User-Agent: * / Disallow:' (allows everything; no group for any AI agent). polite.py allowed every venue URL and every web.archive.org URL it was given.
- Terms (15 Oct 2026): copyright-only. The only notice in the footer of every page is '© 2024 The Pearl, All rights reserved.' There is no terms page. The privacy policy is the WordPress default text, with no use-licence section and no copying or reuse clause. Platform: self-hosted WordPress (generator 'WordPress 7.1.3', 'Site by Thor Media'), not Squarespace, Wix, Fatsoma or Music Glue. Checked: https://thepearlvancouver.com/ (footer: only social links and 'Site by Thor Media'); https://thepearlvancouver.com/page-sitemap.xml (all 9 pages; no terms or legal page); https://thepearlvancouver.com/privacy-policy/ (WordPress default text); https://thepearlvancouver.com/terms/ (404); https://thepearlvancouver.com/terms-of-use/ (404); https://thepearlvancouver.com/terms-of-service/ (404); https://thepearlvancouver.com/terms-and-conditions/ (404); https://thepearlvancouver.com/legal/ (404)
- Platform: Self-hosted WordPress (site by Thor Media). The 'event-discovery' plugin imports TicketWeb listings onto the venue's own pages, and each listing links to TicketWeb for tickets. Not an excluded platform.
- Coverage: S1 >=76, S2 >=61 (union of 11 web.archive.org copies of the own home page and the live page; rows seen in at least two copies alone give 46 / 55). 3 S1 and 2 S2 watch-party rows removed (Amendment 4).
- Requests during the eligibility check: thepearlvancouver.com 20, web.archive.org 18

### Rickshaw Theatre (`van-rickshaw`, Vancouver)
- Source: WordPress REST, custom post type show_listings (post date = show date; future-dated posts appear only after the date passes)
- Read: https://rickshawtheatre.com/wp-json/wp/v2/show_listings?per_page=100&after=2026-03-31T12:00:00&before=2026-07-01T00:00:00 and the same for S2
- Dates checked: Militarie Gun: REST 2026-10-10T23:59 and page 'October 10th, 2026'. Amber Webber & Stephen McBean: REST 2026-07-11T16:39 and page prose 'a special duo performance at the Rickshaw Theatre on July 11th'. Quicksand & Fucked Up: REST 2026-09-23T23:59 and page 'September 23rd, 2026'. The Main Event (REST 13:14 time) page shows 'May 1st, 2026' = REST. The 23:59 time is a placeholder, printed on pages as 'Doors: 11:59pm' next to the real 'DOORS: 6:00PM'. It does not fall in the 00:01-04:59 window, so the date stands.
- robots.txt (14 Oct 2026): allowed. robots.txt has only a sitemap line, no rules.
- Terms (14 Oct 2026): none-found. No terms document exists; the footer word 'Terms' is unlinked. Checked: https://rickshawtheatre.com/ (footer text '© 2026 Rickshaw Theatre | Terms | Web': 'Terms' is plain text with no link); https://rickshawtheatre.com/terms (404); https://rickshawtheatre.com/terms-of-use (404); https://rickshawtheatre.com/terms-of-service (404); https://rickshawtheatre.com/terms-and-conditions (404); https://rickshawtheatre.com/legal (404); https://rickshawtheatre.com/privacy-policy (404)
- Coverage: S1 55, S2 33 (all published show posts with a date in the period; an upper bound if any row is off-site, since the feed has no venue field).
- Platform: self-hosted WordPress (not Squarespace, Wix, Fatsoma or Music Glue).
- Requests during the eligibility check: rickshawtheatre.com 25

## Operators, clusters and presenters (reading 1 of `candidates.md`)
Outside presenters' shares, where they were measured, are well under half of a room's shows, so none is a house booker. One cluster
joins rooms of two buildings by owner: MODO-LIVE owns The Pearl (`modo-live`); it also owns Lee's Palace in Toronto, which is not in
`venues.csv`.
- Futuresound Group (owner and booker of The Wardrobe) presents 7 of 40 sampled Brudenell Social Club archive pages.
- Triple D's appears in 529's promoter list and presents some nights at The EARL. Its share is not measured: 529's feed has no promoter
  field and The EARL's listing cards name no presenter.
- MODO-LIVE presents some nights at Rickshaw Theatre and single shows at Horseshoe Tavern, whose largest outside presenter is an
  independent promoter on a minority of rows. No company presents more than half of either room's shows.
- The Castle Hotel hires its room to many promoters; the most frequent one named presents 4 of 54 counted rows. Badehaus's outside
  promoters present single shows. Festsaal Kreuzberg is run by an operating company of a promoters' association.
- 529's owner is not identified; no public source links the venue to Live Nation or AEG, so it passes §1 under reading 2.
- Under the literal reading of Amendment 1 (Amendment 14, last item), every company a show's own page names as presenting it goes into
  `presented_by` and is an operator for the sensitivity analysis reported beside the result.
- Make-Out Room was listed for sale in June 2026; no buyer was reported by mid-October. If a sale closes before the run, owner and booker
  are checked again.

## Notes for compiling
- Scope: a venue's calendar source is all of its own event listings, not only a music category. Non-music rows are removed only by the
  Amendment 4 words; rows that pass them (comedy without the word, talks, screenings) count, as the text says.
- Roles at the line: Pumpehuset (20 / 20) and Le Ministère (S2 21) are test rooms, and the rooms of VEGA, Tranzac and Festsaal
  Kreuzberg are pool, on pre-compile counts. Badehaus (S2), The Castle Hotel and Night & Day Cafe were counted partly on advance
  listings. Amendment 12 checks every role against `shows.csv`; a role that disagrees is corrected in `venues.csv` with the
  reason here, before any Qloo call.
- Rooms: VEGA rows go to the room their venue.name gives; a row whose venue.name names no single room (just "VEGA") goes to
  `cph-vega-house`, a pool room of the same building. A row given two rooms goes to the first one listed.
- Rooms: Tranzac rows go to the room its event page's rooms[] gives, Festsaal Kreuzberg rows to the room its location field gives;
  rows with no room go to the house room (`tor-tranzac-house`, `ber-festsaal-house`); rows whose new_location names another building
  are `off-site`.
- Titles: 529's feed title is empty on many rows; the title is then the headliner names its calendar shows (from the band ids), never
  empty. Make-Out Room posts are titled with the date; each event is a bold name in the post, and lines that are handles, links, prices,
  the venue's name or award notes are not events.
- The Rockwell: take the canceled flag from the site's list view (schema.org eventStatus), not from the feed; two S2 rows are canceled
  only there.
- Lizard Lounge: "No Event Tonight" and "Closed" rows are all-day events whose feed start reads 02:00; they are notices that no show takes place,
  so they are not compiled into `shows.csv`. No other all-day row may be read as a 02:00 start: a date-only value keeps its listed date
  (Amendment 3).
- VEGA: VEGA Beyond pages are a separate series that may be held elsewhere; rows whose venue.name is not a VEGA room are dropped as
  `off-site`. Two guided tours ("Rundvisning") were left out of the coverage count; no registered rule drops them in the run.
- Badehaus: the weekly pub quiz is removed by the Amendment 4 word "quiz"; two acts listed under two slugs on one night (15 Aug,
  9 Sep) are one row each, as in the count.
- Rickshaw Theatre: the feed has no venue field, so off-site rows are found only on the show's own page; a row whose page names another
  building is `off-site`.
- Horseshoe Tavern and The Pearl: the live sites keep only coming shows, so rows come from the union of web.archive.org copies of their
  own pages, keyed on date and title or slug; a row that vanished from a later copy before its date is left out.
- Bottom of the Hill: one title on 6 Apr carries price text; titles are cut before the price.
- Capacities (Amendment 8): Badehaus 450, Festsaal 1,100 and The Castle Hotel 80 are the figures the venues publish.
  Lizard Lounge's 100 comes from its private-event page ("from 20 - 100"), the only figure it publishes.
