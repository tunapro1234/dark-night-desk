import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../server/config.js';
import { buildApp } from '../server/app.js';

const tmp = await mkdtemp(path.join(os.tmpdir(), 'dnd-test-'));
test.after(() => rm(tmp, { recursive: true, force: true }));

async function appWith(env) {
  return buildApp(loadConfig({ DATA_DIR: path.join(tmp, 'var'), VENUES_DIR: path.join(tmp, 'none'), ...env }));
}

test('health without keys: Qloo not connected, scripted agent, default caps', async () => {
  const app = await appWith({});
  const res = await app.inject('/api/health');
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ok, true);
  assert.equal(body.qloo, 'no-key');
  assert.equal(body.agent, 'scripted');
  assert.equal(body.outbound, 'on');
  assert.deepEqual(body.budget, { day_usd: 0, total_usd: 0, day_cap: 2, total_cap: 30, month_usd: 0, month_cap: 12 });
  assert.equal(typeof body.version, 'string');
  await app.close();
});

test('health reports OUTBOUND=off', async () => {
  const app = await appWith({ OUTBOUND: 'off' });
  const body = (await app.inject('/api/health')).json();
  assert.equal(body.outbound, 'off');
  assert.equal(body.qloo, 'no-key');
  await app.close();
});

test('health reports the package.json version and whole seconds of uptime', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const app = await appWith({});
  const body = (await app.inject('/api/health')).json();
  assert.equal(body.version, pkg.version);
  assert.ok(Number.isInteger(body.uptime) && body.uptime >= 0);
  await app.close();
});

test('health reports recorded mode when a recorded run exists', async () => {
  const dataDir = path.join(tmp, 'rec');
  await mkdir(path.join(dataDir, 'recorded'), { recursive: true });
  await writeFile(path.join(dataDir, 'recorded', 'run.json'), '{}');
  const app = await appWith({ DATA_DIR: dataDir });
  assert.equal((await app.inject('/api/health')).json().agent, 'recorded');
  await app.close();
});

test('health never exposes keys', async () => {
  const app = await appWith({ QLOO_API_KEY: 'qk-secret-123' });
  const res = await app.inject('/api/health');
  assert.equal(res.json().qloo, 'live');
  assert.doesNotMatch(res.body, /secret/);
  await app.close();
});

test('venues: missing directory gives an empty list', async () => {
  const app = await appWith({});
  assert.deepEqual((await app.inject('/api/venues')).json(), []);
  await app.close();
});

test('venues: synthetic fixture is listed with the public summary fields only', async () => {
  const app = await appWith({ VENUES_DIR: 'test/fixtures/synthetic/venues' });
  assert.deepEqual((await app.inject('/api/venues')).json(), [{
    id: 'example-room', name: 'Example Room', city: 'Exampleville', capacity_band: '250-500',
    calendar_source_url: 'https://example.org/calendar',
  }, {
    id: 'other-hall', name: 'Other Hall', city: 'Exampleville', capacity_band: '500-800',
    calendar_source_url: 'https://example.org/other-hall/calendar',
  }]);
  await app.close();
});

const validVenue = (id) => ({
  id, name: 'Room', city: 'Exampleville', capacity_band: '100-250', calendar_source_url: 'https://example.org/cal',
  read_at: '2026-10-01', closed_weekdays: [], shows: [], past_shows: [],
});

test('venues: unreadable, invalid and duplicate files are skipped', async () => {
  const dir = path.join(tmp, 'mixed');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'a.json'), JSON.stringify(validVenue('a')));
  await writeFile(path.join(dir, 'a2.json'), JSON.stringify(validVenue('a')));
  await writeFile(path.join(dir, 'b.json'), '{not json');
  await writeFile(path.join(dir, 'c.json'), '{"name":"no id"}');
  await writeFile(path.join(dir, 'd.json'), JSON.stringify({ ...validVenue('d'), closed_weekdays: [7] }));
  await writeFile(path.join(dir, 'notes.txt'), 'ignored');
  const app = await appWith({ VENUES_DIR: dir });
  assert.deepEqual((await app.inject('/api/venues')).json().map((v) => v.id), ['a']);
  await app.close();
});

const FIXED_NOW = Date.parse('2026-10-11T23:30:00Z');

async function calendarApp() {
  return buildApp(
    loadConfig({ DATA_DIR: path.join(tmp, 'var'), VENUES_DIR: 'test/fixtures/synthetic/venues' }),
    { now: () => FIXED_NOW },
  );
}

test('calendar: defaults to 60 nights from today (UTC) in the contract shape', async () => {
  const app = await calendarApp();
  const res = await app.inject('/api/venues/example-room/calendar');
  assert.equal(res.statusCode, 200);
  const cal = res.json();
  assert.equal(cal.venue.id, 'example-room');
  assert.equal(cal.from, '2026-10-11');
  assert.equal(cal.to, '2026-12-09');
  assert.equal(cal.nights.length, 60);
  assert.deepEqual(cal.source, { url: 'https://example.org/calendar', read_at: '2026-10-11' });
  assert.equal(cal.dark_count, cal.nights.filter((n) => n.status === 'dark').length);
  assert.ok(cal.dark_count > 0);
  for (const n of cal.nights) {
    assert.match(n.status, /^(booked|dark|closed|today)$/);
    if (n.status === 'booked') assert.match(n.show.headliner, /^Synthetic Act /);
    else assert.equal(n.show, undefined);
  }
  assert.ok(cal.nights.filter((n) => n.status === 'closed').every((n) => new Date(`${n.date}T00:00:00Z`).getUTCDay() === 1));
  await app.close();
});

test('calendar: today is shown and labelled but is not a dark night; earlier empty nights are past', async () => {
  const app = await calendarApp();
  const cal = (await app.inject('/api/venues/example-room/calendar')).json();
  assert.deepEqual(cal.nights[0], { date: '2026-10-11', status: 'today', today: true });
  assert.equal(cal.nights.filter((n) => n.today).length, 1);
  assert.equal(cal.dark_count, cal.nights.filter((n) => n.status === 'dark').length);
  assert.ok(cal.nights.filter((n) => n.status === 'dark').every((n) => n.date > '2026-10-11'));
  const back = (await app.inject('/api/venues/example-room/calendar?from=2026-10-05&days=10')).json();
  assert.deepEqual(back.nights.map((n) => n.status), ['closed', 'past', 'past', 'booked', 'booked', 'booked', 'today', 'closed', 'booked', 'dark']);
  assert.equal(back.dark_count, 1);
  await app.close();
});

test('calendar: the page asks for today plus 60 nights, and the 60 nights from tomorrow hold every dark night', async () => {
  const app = await calendarApp();
  const cal = (await app.inject('/api/venues/example-room/calendar?days=61')).json();
  assert.equal(cal.nights.length, 61);
  assert.equal(cal.nights[0].today, true);
  const ahead = cal.nights.filter((n) => !n.today);
  assert.equal(ahead.length, 60);
  assert.equal(ahead[0].date, '2026-10-12');
  assert.equal(cal.dark_count, ahead.filter((n) => n.status === 'dark').length);
  await app.close();
});

test('calendar: from and days are honoured', async () => {
  const app = await calendarApp();
  const cal = (await app.inject('/api/venues/example-room/calendar?from=2026-11-02&days=7')).json();
  assert.deepEqual(cal.nights.map((n) => n.status), ['closed', 'dark', 'dark', 'booked', 'dark', 'booked', 'dark']);
  assert.equal(cal.to, '2026-11-08');
  assert.equal(cal.dark_count, 4);
  await app.close();
});

test('calendar: bad input is a 400, an unknown venue a 404', async () => {
  const app = await calendarApp();
  for (const q of ['from=2026-13-01', 'from=11/02/2026', 'days=0', 'days=121', 'days=abc', 'days=7.5']) {
    assert.equal((await app.inject(`/api/venues/example-room/calendar?${q}`)).statusCode, 400, q);
  }
  assert.equal((await app.inject('/api/venues/nowhere/calendar')).statusCode, 404);
  await app.close();
});

test('rooms with a partial source listing are not offered; nights past listed_until are unlisted', async () => {
  const dir = path.join(tmp, 'listing');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'full.json'), JSON.stringify({ ...validVenue('full'), listed_until: '2026-10-20' }));
  await writeFile(path.join(dir, 'partner.json'), JSON.stringify({ ...validVenue('partner'), listing_complete: false }));
  await writeFile(path.join(dir, 'flagged.json'), JSON.stringify({ ...validVenue('flagged'), listing_complete: true }));
  const app = await buildApp(loadConfig({ DATA_DIR: path.join(tmp, 'var'), VENUES_DIR: dir }), { now: () => FIXED_NOW });
  try {
    assert.deepEqual((await app.inject('/api/venues')).json().map((v) => v.id).sort(), ['flagged', 'full']);
    const hidden = await app.inject('/api/venues/partner/calendar');
    assert.equal(hidden.statusCode, 404);
    assert.match(hidden.json().error, /lists only some of its shows/);
    const plan = (venue_id, date) => app.inject({ method: 'POST', url: '/api/plan', payload: { venue_id, date } });
    assert.equal((await plan('partner', '2026-10-14')).statusCode, 404);

    const cal = (await app.inject('/api/venues/full/calendar?days=15')).json();
    assert.deepEqual(cal.nights.map((n) => n.status), [
      'today', 'dark', 'dark', 'dark', 'dark', 'dark', 'dark', 'dark', 'dark', 'dark',
      'unlisted', 'unlisted', 'unlisted', 'unlisted', 'unlisted',
    ]);
    assert.equal(cal.dark_count, 9);
    const late = await plan('full', '2026-10-21');
    assert.equal(late.statusCode, 409);
    assert.match(late.json().error, /after 2026-10-20, the last date/);
    const ablate = await app.inject({ method: 'POST', url: '/api/ablate', payload: { venue_id: 'full', date: '2026-10-21', remove: [] } });
    assert.equal(ablate.statusCode, 409);
  } finally {
    await app.close();
  }
});

test('recorded runs: listed for plannable rooms and nights still dark; one is read back as recorded with no Qloo or Claude call', async () => {
  const dataDir = path.join(tmp, 'rec-list');
  await mkdir(path.join(dataDir, 'recorded'), { recursive: true });
  const run = (venue_id, date, saved_at = '2026-10-10T20:00:00.000Z') =>
    writeFile(path.join(dataDir, 'recorded', `${venue_id}__${date}__${saved_at.replace(/[:.]/g, '-')}.json`),
      JSON.stringify({ saved_at, venue_id, date, result: { mode: { agent: 'live', qloo: 'live' }, steps: ['Sizing to your room'], shortlist: [] } }));
  await run('example-room', '2026-10-14'); // dark
  await run('example-room', '2026-10-14', '2026-10-09T20:00:00.000Z'); // older run of the same night
  await run('example-room', '2026-10-13'); // booked since
  await run('example-room', '2026-10-07'); // past
  await run('nope', '2026-10-14'); // unknown room
  await writeFile(path.join(dataDir, 'recorded', 'broken.json'), '{');
  const app = await buildApp(loadConfig({ DATA_DIR: dataDir, VENUES_DIR: 'test/fixtures/synthetic/venues' }), { now: () => FIXED_NOW });
  assert.deepEqual((await app.inject('/api/recorded')).json(), { runs: [{ venue_id: 'example-room', date: '2026-10-14', recorded_at: '2026-10-10T20:00:00.000Z' }] });
  const one = await app.inject('/api/recorded/example-room/2026-10-14');
  assert.equal(one.statusCode, 200);
  assert.deepEqual(one.json().mode, { agent: 'recorded', qloo: 'recorded', recorded_at: '2026-10-10T20:00:00.000Z' });
  assert.deepEqual(one.json().steps, ['Sizing to your room']);
  for (const url of ['/api/recorded/example-room/2026-10-13', '/api/recorded/example-room/2026-10-15', '/api/recorded/nope/2026-10-14']) {
    assert.equal((await app.inject(url)).statusCode, 404, url);
  }
  await app.close();
  const scripted = await buildApp(loadConfig({ DATA_DIR: dataDir, VENUES_DIR: 'test/fixtures/synthetic/venues', AGENT_MODE: 'scripted' }), { now: () => FIXED_NOW });
  assert.deepEqual((await scripted.inject('/api/recorded')).json(), { runs: [] }, 'AGENT_MODE=scripted plays nothing back');
  await scripted.close();
  const none = await appWith({});
  assert.deepEqual((await none.inject('/api/recorded')).json(), { runs: [] });
  await none.close();
});

test('serves the static page at /', async () => {
  const app = await appWith({});
  const res = await app.inject('/');
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /text\/html/);
  assert.match(res.body, /Dark Night Desk/);
  assert.match(res.body, /fill the nights your venue sits empty/);
  await app.close();
});

test('serves the page script and stylesheet, with no outside scripts', async () => {
  const app = await appWith({});
  const page = (await app.inject('/')).body;
  assert.doesNotMatch(page, /<script[^>]+src="https?:\/\//);
  const js = await app.inject('/app.js');
  assert.equal(js.statusCode, 200);
  assert.match(js.headers['content-type'], /javascript/);
  for (const label of ['Agent: idle', 'Agent: idle (Qloo not connected)', 'Agent: live (Claude)', 'recorded run from', 'Agent: fixed steps, no AI writing',
    'Qloo: live', 'Qloo: not connected', 'Qloo: recorded']) {
    assert.ok(js.body.includes(label), `app.js lacks the mode label "${label}"`);
  }
  const css = await app.inject('/style.css');
  assert.equal(css.statusCode, 200);
  assert.match(css.body, /@media \(max-width/);
  for (const body of [page, js.body, css.body]) assert.doesNotMatch(body, /[^\x00-\x7F]/, 'web files stay ASCII');
  await app.close();
});

test('backtest: not-run until the test run has written its summary, then the summary', async () => {
  const file = path.join(tmp, 'bt', 'backtest-test.json');
  const withFile = () => buildApp(loadConfig({ DATA_DIR: path.join(tmp, 'var'), VENUES_DIR: path.join(tmp, 'none') }), { backtestFile: file });
  let app = await withFile();
  assert.deepEqual((await app.inject('/api/backtest')).json(), { status: 'not-run' });
  await app.close();

  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, 'not json');
  app = await withFile();
  assert.equal((await app.inject('/api/backtest')).json().status, 'not-run');
  await app.close();

  await writeFile(file, JSON.stringify({ status: 'pilot', label: 'pilot (N = 3 rooms, n = 9 shows)', rooms: 3 }));
  app = await withFile();
  assert.deepEqual((await app.inject('/api/backtest')).json(), { status: 'pilot', label: 'pilot (N = 3 rooms, n = 9 shows)', rooms: 3 });
  await app.close();
});

test('every response carries noindex: API, static page and its meta tag', async () => {
  const app = await appWith({});
  const api = await app.inject('/api/health');
  assert.equal(api.headers['x-robots-tag'], 'noindex, nofollow');
  const page = await app.inject('/');
  assert.equal(page.statusCode, 200);
  assert.equal(page.headers['x-robots-tag'], 'noindex, nofollow');
  assert.match(page.body, /<meta name="robots" content="noindex, nofollow">/);
  assert.equal((await app.inject('/no-such-file')).headers['x-robots-tag'], 'noindex, nofollow');
  await app.close();
});

test('robots.txt disallows every path', async () => {
  const app = await appWith({});
  const res = await app.inject('/robots.txt');
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /^text\/plain/);
  assert.equal(res.body, 'User-agent: *\nDisallow: /\n');
  assert.equal(res.headers['x-robots-tag'], 'noindex, nofollow');
  await app.close();
});
