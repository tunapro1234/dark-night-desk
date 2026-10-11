import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, REPO_ROOT } from '../server/config.js';
import { buildApp } from '../server/app.js';
import { decodeEntities, htmlText, isCanceled, listedShowCount, parseMonthPage } from '../server/calendar/firstavenue.js';
import { robotsVerdict } from '../server/calendar/robots.js';
import { validateVenue } from '../server/calendar/venues.js';
import {
  asciiJson, buildVenues, main, MIN_GAP_MS, monthsToRead, refreshVenues, roomId, USER_AGENT,
} from '../scripts/refresh-venues.js';

const HTML_DIR = path.join(REPO_ROOT, 'test', 'fixtures', 'synthetic', 'html');
const monthPage = await readFile(path.join(HTML_DIR, 'month-2026-11.html'), 'utf8');
const PAGE_URL = 'https://calendar.example.test/shows/?start_date=20261101';

const tmp = await mkdtemp(path.join(os.tmpdir(), 'dnd-refresh-'));
test.after(() => rm(tmp, { recursive: true, force: true }));

test('parseMonthPage: dates from day markers, room, title, link; nothing before the first marker', () => {
  const rows = parseMonthPage(monthPage, { pageUrl: PAGE_URL });
  assert.deepEqual(rows, [
    { date: '2026-11-01', room: 'Synthetic Room A', title: 'Synthetic Act 1', source_url: 'https://calendar.example.test/event/2026-11-synthetic-act-1/', canceled: false },
    { date: '2026-11-01', room: 'Synthetic Room & Hall', title: 'Synthetic Collective presents The Synthetic Night', source_url: 'https://calendar.example.test/event/2026-11-synthetic-presents/', canceled: false },
    { date: '2026-11-03', room: 'Synthetic Room A', title: 'Synthetic Act 3, Act 3b, and Act 3c \u2019n\u2019 Friends', source_url: 'https://calendar.example.test/event/2026-11-synthetic-act-3/', canceled: false },
    { date: '2026-11-04', room: 'Synthetic Room A', title: 'Synthetic Act 4', source_url: 'https://calendar.example.test/event/2026-11-synthetic-act-4-postponed/', canceled: true },
    { date: '2026-11-04', room: 'Synthetic Room B', title: 'Synthetic Act 5', source_url: 'https://calendar.example.test/event/2026-11-synthetic-act-5-cancelled/', canceled: true },
    { date: '2026-11-15', room: 'Synthetic Room B', title: 'CANCELED: Synthetic Act 6', source_url: 'https://calendar.example.test/event/2026-11-synthetic-act-6/', canceled: true },
    { date: '2026-11-15', room: 'Synthetic Room B', title: 'Synthetic Act 7', source_url: 'https://calendar.example.test/event/2026-11-synthetic-act-7/', canceled: false },
  ]);
  assert.equal(listedShowCount(monthPage), 8);
});

test('parseMonthPage: zero-padded marker, empty or markup-free input', () => {
  const html = '<div id="day-2026-11-03"></div><div class="show_list_item"><div class="venue_name"> Room </div>'
    + '<a href="/event/synthetic-act-1/">Synthetic Act 1</a></div>';
  assert.deepEqual(parseMonthPage(html, { pageUrl: PAGE_URL }), [
    { date: '2026-11-03', room: 'Room', title: 'Synthetic Act 1', source_url: 'https://calendar.example.test/event/synthetic-act-1/', canceled: false },
  ]);
  assert.deepEqual(parseMonthPage('', { pageUrl: PAGE_URL }), []);
  assert.deepEqual(parseMonthPage('<p>nothing</p>'), []);
  assert.deepEqual(parseMonthPage('<div id="day-2026-02-30"></div><div class="show_list_item"><div class="venue_name">R</div><h4><a href="/event/x/">X</a></h4></div>', { pageUrl: PAGE_URL }), []);
  assert.equal(listedShowCount('<p>nothing</p>'), null);
});

test('text helpers: entities, inline tags, white space, canceled words', () => {
  assert.equal(decodeEntities('A &amp; B &#8217; &#x2019; &nbsp;&unknown;'), 'A & B \u2019 \u2019  &unknown;');
  assert.equal(htmlText('<em>An Evening with</em> <br>Synthetic&nbsp;Act'), 'An Evening with Synthetic Act');
  assert.equal(htmlText('Act 1, <span class="performer">Act 2</span>, <strong>Act 3</strong>'), 'Act 1, Act 2, Act 3');
  assert.equal(htmlText('  a\n\t b  '), 'a b');
  assert.ok(isCanceled('Synthetic Act (Cancelled)'));
  assert.ok(isCanceled('Synthetic Act', '2026-11-synthetic-act-postponed'));
  assert.ok(!isCanceled('Synthetic Postponedness Act', '2026-11-synthetic-act'));
});

test('robots: our agent, the * group, longest match, empty Disallow, Crawl-delay', () => {
  const path_ = '/shows/?start_date=20261101';
  assert.equal(robotsVerdict('User-agent: SyntheticBot\nDisallow: /\n\nUser-agent: OtherBot\nDisallow:/', USER_AGENT, path_).allowed, true);
  assert.equal(robotsVerdict('', USER_AGENT, path_).allowed, true);
  assert.equal(robotsVerdict('User-agent: *\nDisallow:\n', USER_AGENT, path_).allowed, true);
  assert.deepEqual(robotsVerdict('User-agent: *\nDisallow: /shows\n', USER_AGENT, path_), { allowed: false, rule: 'Disallow: /shows', crawlDelay: null });
  assert.equal(robotsVerdict('User-agent: dark-night-desk\nDisallow: /\n\nUser-agent: *\nAllow: /\n', USER_AGENT, path_).allowed, false);
  assert.equal(robotsVerdict('User-agent: *\nDisallow: /\nAllow: /shows/\n', USER_AGENT, path_).allowed, true);
  assert.equal(robotsVerdict('User-agent: *\nDisallow: /*start_date=\n', USER_AGENT, path_).allowed, false);
  assert.equal(robotsVerdict('User-agent: *\nDisallow: /shows/$\n', USER_AGENT, path_).allowed, true);
  assert.equal(robotsVerdict('User-agent: *\nCrawl-delay: 10\n', USER_AGENT, path_).crawlDelay, 10);
});

test('months to read cover today - 90 to today + 60 days', () => {
  assert.deepEqual(monthsToRead('2026-10-11'), ['20260701', '20260801', '20260901', '20261001', '20261101', '20261201']);
  assert.deepEqual(monthsToRead('2026-11-15'), ['20260801', '20260901', '20261001', '20261101', '20261201', '20270101']);
});

test('room ids keep the fa-<room-slug> form', () => {
  assert.equal(roomId('Synthetic Room & Hall'), 'fa-synthetic-room-hall');
  assert.equal(roomId('  Caf\u00E9 Synthetic  '), 'fa-cafe-synthetic');
  assert.equal(asciiJson({ t: 'A \u2019n\u2019 B' }), '{\n  "t": "A \\u2019n\\u2019 B"\n}\n');
});

test('buildVenues: windows, canceled rows skipped, existing file name and capacity kept, new room unknown', () => {
  const rows = [
    { date: '2026-11-20', room: 'Synthetic Room A', title: 'Synthetic Act 2', source_url: 'https://calendar.example.test/event/2/', canceled: false },
    { date: '2026-11-01', room: 'Synthetic Room A', title: 'Synthetic Act 1', source_url: 'https://calendar.example.test/event/1/', canceled: false },
    { date: '2026-11-01', room: 'Synthetic Room A', title: 'Synthetic Act 1', source_url: 'https://calendar.example.test/event/1/', canceled: false },
    { date: '2026-11-02', room: 'Synthetic Room A', title: 'Synthetic Act 9', source_url: 'https://calendar.example.test/event/9/', canceled: true },
    { date: '2026-08-10', room: 'Synthetic Room A', title: 'Synthetic Act 0', source_url: 'https://calendar.example.test/event/0/', canceled: false },
    { date: '2026-08-02', room: 'Synthetic Room A', title: 'Synthetic Act 11', source_url: 'https://calendar.example.test/event/11/', canceled: false },
    { date: '2026-12-25', room: 'Synthetic Room A', title: 'Synthetic Act 10', source_url: 'https://calendar.example.test/event/10/', canceled: false },
    { date: '2026-11-03', room: 'Synthetic New Room', title: 'Synthetic Act 3', source_url: 'https://calendar.example.test/event/3/', canceled: false },
  ];
  const existing = new Map([
    ['synthetic room a', { file: 'fa-room-a-old-name.json', venue: { id: 'fa-room-a-old-name', name: 'Synthetic Room A', city: 'Synthville', capacity_band: '200-400', closed_weekdays: [1], locality: 'x' } }],
    ['synthetic gone room', { file: 'fa-synthetic-gone-room.json', venue: { id: 'fa-synthetic-gone-room', name: 'Synthetic Gone Room', city: 'Synthville', capacity_band: '100-200', closed_weekdays: [] } }],
  ]);
  const built = buildVenues(rows, existing, { today: '2026-11-01', readAt: '2026-11-01T06:30:00Z' });
  assert.deepEqual(built.map((b) => [b.file, b.isNew]), [
    ['fa-room-a-old-name.json', false], ['fa-synthetic-gone-room.json', false], ['fa-synthetic-new-room.json', true],
  ]);
  const [a, gone, fresh] = built.map((b) => b.venue);
  assert.deepEqual(Object.keys(a), ['id', 'name', 'city', 'capacity_band', 'calendar_source_url', 'read_at', 'closed_weekdays', 'shows', 'past_shows', 'locality']);
  assert.equal(a.capacity_band, '200-400');
  assert.equal(a.city, 'Synthville');
  assert.deepEqual(a.closed_weekdays, [1]);
  assert.deepEqual(a.shows.map((s) => s.headliner), ['Synthetic Act 1', 'Synthetic Act 2', 'Synthetic Act 10']);
  assert.deepEqual(a.past_shows.map((s) => s.headliner), ['Synthetic Act 0']);
  assert.deepEqual(gone.shows, []);
  assert.deepEqual(gone.past_shows, []);
  assert.equal(fresh.capacity_band, 'unknown');
  assert.equal(fresh.city, 'Minneapolis');
  assert.deepEqual(fresh.closed_weekdays, []);
  for (const b of built) assert.deepEqual(validateVenue(b.venue), { ok: true, errors: [] });
});

/** A fake site: robots.txt plus one synthetic month page per start_date, on a fake clock. */
function fakeSite({ robots = 'User-agent: SyntheticBot\nDisallow: /\n', statusFor = () => 200 } = {}) {
  let clock = Date.parse('2026-11-15T12:00:00Z');
  const calls = [];
  const page = (yyyymm) => {
    const y = yyyymm.slice(0, 4);
    const m = String(Number(yyyymm.slice(4, 6)));
    return `<h4><em>Viewing</em> 3 <em>shows in</em> month</h4>
<div id="day-${y}-${m}-20"></div>
<div class="show_list_item"><div class="venue_name">Synthetic Room A</div><h4><a href="/event/${yyyymm}-synthetic-act-a/">Synthetic Act A ${yyyymm}</a></h4></div>
<div class="show_list_item"><div class="venue_name">Synthetic Room &amp; Hall</div><h4><a href="/event/${yyyymm}-synthetic-act-b/">Synthetic Act B&nbsp;&#8217;${yyyymm}</a></h4></div>
<div class="show_list_item"><div class="venue_name">Synthetic Room A</div><h4><a href="/event/${yyyymm}-synthetic-act-c-postponed/">Synthetic Act C</a></h4></div>`;
  };
  const fetch = async (url, init) => {
    calls.push({ url: String(url), method: init.method, ua: init.headers['User-Agent'], at: clock });
    clock += 40;
    const status = statusFor(String(url));
    if (String(url).endsWith('/robots.txt')) return { status, text: async () => robots };
    const start = new URL(url).searchParams.get('start_date');
    return { status, text: async () => (status === 200 ? page(start.slice(0, 6)) : 'no') };
  };
  return {
    calls,
    io: { fetch, now: () => clock, sleep: async (ms) => void (clock += ms) },
  };
}

async function freshDirs(name) {
  const venuesDir = path.join(tmp, name, 'venues');
  const dataDir = path.join(tmp, name, 'data');
  await mkdir(venuesDir, { recursive: true });
  return { venuesDir, dataDir };
}

test('refresh: robots first, GET only with our agent, 2.5 s apart, atomic ASCII files that pass the schema', async () => {
  const { venuesDir, dataDir } = await freshDirs('ok');
  await writeFile(path.join(venuesDir, 'fa-synthetic-room-a.json'), asciiJson({
    id: 'fa-synthetic-room-a', name: 'Synthetic Room A', city: 'Synthville', capacity_band: '200-400',
    calendar_source_url: 'https://calendar.example.test/shows/', read_at: '2026-10-01', closed_weekdays: [], shows: [], past_shows: [],
  }));
  const synthetic = await readFile(path.join(REPO_ROOT, 'test', 'fixtures', 'synthetic', 'venues', 'example-room.json'), 'utf8');
  await writeFile(path.join(venuesDir, 'example-room.json'), synthetic);
  const site = fakeSite();
  const lines = [];
  const out = await refreshVenues({ venuesDir, dataDir, print: (l) => lines.push(l), ...site.io });

  assert.ok(site.calls[0].url.endsWith('/robots.txt'));
  assert.equal(site.calls.length, 7);
  assert.ok(site.calls.every((c) => c.method === 'GET' && c.ua === 'Mozilla/5.0 (research; dark-night-desk)'));
  for (let i = 1; i < site.calls.length; i++) assert.ok(site.calls[i].at - site.calls[i - 1].at >= MIN_GAP_MS);
  assert.deepEqual(site.calls.slice(1).map((c) => new URL(c.url).searchParams.get('start_date')),
    ['20260801', '20260901', '20261001', '20261101', '20261201', '20270101']);

  const files = (await readdir(venuesDir)).sort();
  assert.deepEqual(files, ['example-room.json', 'fa-synthetic-room-a.json', 'fa-synthetic-room-hall.json']);
  assert.equal(await readFile(path.join(venuesDir, 'example-room.json'), 'utf8'), synthetic);
  const a = JSON.parse(await readFile(path.join(venuesDir, 'fa-synthetic-room-a.json'), 'utf8'));
  assert.equal(a.capacity_band, '200-400');
  assert.equal(a.read_at, out.readAt);
  assert.match(a.read_at, /^2026-11-15T12:00:\d\dZ$/);
  assert.deepEqual(a.shows.map((s) => s.date), ['2026-11-20', '2026-12-20']);
  assert.deepEqual(a.past_shows.map((s) => s.date), ['2026-08-20', '2026-09-20', '2026-10-20']);
  assert.ok(a.shows.every((s) => !/Act C/.test(s.headliner)));
  const hallText = await readFile(path.join(venuesDir, 'fa-synthetic-room-hall.json'), 'utf8');
  assert.ok(/^[\x00-\x7F]*$/.test(hallText));
  const hall = JSON.parse(hallText);
  assert.equal(hall.name, 'Synthetic Room & Hall');
  assert.equal(hall.capacity_band, 'unknown');
  assert.equal(hall.shows[0].headliner, 'Synthetic Act B \u2019202611');
  assert.ok(hall.shows[0].source_url.endsWith('/event/202611-synthetic-act-b/'));
  for (const f of ['fa-synthetic-room-a.json', 'fa-synthetic-room-hall.json']) {
    assert.ok(validateVenue(JSON.parse(await readFile(path.join(venuesDir, f), 'utf8'))).ok);
  }
  assert.deepEqual((await readdir(path.join(dataDir, 'raw-calendar'))).sort(),
    ['202608.html', '202609.html', '202610.html', '202611.html', '202612.html', '202701.html', 'robots.txt']);
  assert.ok(lines.some((l) => l.startsWith('wrote 2 venue files')));
});

test('refresh --dry-run counts but writes no venue file', async () => {
  const { venuesDir, dataDir } = await freshDirs('dry');
  const site = fakeSite();
  const lines = [];
  const code = await main(['--dry-run'], { VENUES_DIR: venuesDir, DATA_DIR: dataDir }, (l) => lines.push(l), site.io);
  assert.equal(code, 0);
  assert.deepEqual(await readdir(venuesDir), []);
  assert.ok(lines.some((l) => l === 'fa-synthetic-room-a.json: 2 shows, 3 past shows (new room)'));
  assert.ok(lines.some((l) => l.startsWith('dry run, nothing written')));
});

test('refresh stops before any month page when robots.txt disallows the calendar', async () => {
  const { venuesDir, dataDir } = await freshDirs('robots');
  const site = fakeSite({ robots: 'User-agent: *\nDisallow: /shows/\n' });
  const lines = [];
  const code = await main([], { VENUES_DIR: venuesDir, DATA_DIR: dataDir }, (l) => lines.push(l), site.io);
  assert.equal(code, 2);
  assert.equal(site.calls.length, 1);
  assert.match(lines.at(-1), /robots\.txt disallows \/shows\//);
  assert.deepEqual(await readdir(venuesDir), []);
});

for (const status of [403, 429]) {
  test(`refresh stops on ${status} and leaves existing files untouched`, async () => {
    const { venuesDir, dataDir } = await freshDirs(`s${status}`);
    const file = path.join(venuesDir, 'fa-synthetic-room-a.json');
    const before = asciiJson({
      id: 'fa-synthetic-room-a', name: 'Synthetic Room A', city: 'Synthville', capacity_band: '200-400',
      calendar_source_url: 'https://calendar.example.test/shows/', read_at: '2026-10-01', closed_weekdays: [], shows: [], past_shows: [],
    });
    await writeFile(file, before);
    const site = fakeSite({ statusFor: (u) => (u.includes('start_date=20261001') ? status : 200) });
    const lines = [];
    const code = await main([], { VENUES_DIR: venuesDir, DATA_DIR: dataDir }, (l) => lines.push(l), site.io);
    assert.equal(code, 2);
    assert.equal(site.calls.length, 4);
    assert.match(lines.at(-1), new RegExp(`answered ${status}`));
    assert.equal(await readFile(file, 'utf8'), before);
    assert.deepEqual(await readdir(venuesDir), ['fa-synthetic-room-a.json']);
  });
}

test('refresh rejects unknown arguments', async () => {
  const lines = [];
  assert.equal(await main(['--fast'], {}, (l) => lines.push(l)), 1);
  assert.match(lines[0], /unknown argument --fast/);
});

test('GET /api/venues sees a venue file that changed while the server runs', async () => {
  const { venuesDir, dataDir } = await freshDirs('live');
  const write = (name) => writeFile(path.join(venuesDir, 'fa-synthetic-room-a.json'), asciiJson({
    id: 'fa-synthetic-room-a', name, city: 'Synthville', capacity_band: '200-400',
    calendar_source_url: 'https://calendar.example.test/shows/', read_at: '2026-10-01', closed_weekdays: [], shows: [], past_shows: [],
  }));
  await write('Synthetic Room A');
  const app = await buildApp(loadConfig({ DATA_DIR: dataDir, VENUES_DIR: venuesDir }));
  try {
    assert.equal((await app.inject('/api/venues')).json()[0].name, 'Synthetic Room A');
    await write('Synthetic Room A Renamed');
    const t = new Date(Date.now() + 5000);
    await utimes(path.join(venuesDir, 'fa-synthetic-room-a.json'), t, t);
    assert.equal((await app.inject('/api/venues')).json()[0].name, 'Synthetic Room A Renamed');
    await writeFile(path.join(venuesDir, 'fa-synthetic-room-b.json'), asciiJson({
      id: 'fa-synthetic-room-b', name: 'Synthetic Room B', city: 'Synthville', capacity_band: 'unknown',
      calendar_source_url: 'https://calendar.example.test/shows/', read_at: '2026-10-01', closed_weekdays: [], shows: [], past_shows: [],
    }));
    assert.deepEqual((await app.inject('/api/venues')).json().map((v) => v.id), ['fa-synthetic-room-a', 'fa-synthetic-room-b']);
    assert.ok((await stat(path.join(venuesDir, 'fa-synthetic-room-b.json'))).isFile());
  } finally {
    await app.close();
  }
});
