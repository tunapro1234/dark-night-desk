import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../server/config.js';
import { addDays, nightsFor, todayISO } from '../server/calendar/nights.js';
import { isISODate, loadVenues, validateVenue } from '../server/calendar/venues.js';

const FIXTURE_DIR = path.join(REPO_ROOT, 'test', 'fixtures', 'synthetic', 'venues');
const room = JSON.parse(readFileSync(path.join(FIXTURE_DIR, 'example-room.json'), 'utf8'));

const venue = {
  id: 'example-room', closed_weekdays: [1],
  shows: [
    { date: '2026-11-03', headliner: 'Synthetic Act A', source_url: 'https://example.org/a' },
    { date: '2026-11-05', headliner: 'Synthetic Act B', source_url: 'https://example.org/b' },
  ],
};

test('nightsFor: closed weekday, booked, dark and dark_count', () => {
  const r = nightsFor(venue, '2026-11-02', 7);
  assert.equal(r.from, '2026-11-02');
  assert.equal(r.to, '2026-11-08');
  assert.deepEqual(r.nights.map((n) => [n.date, n.status]), [
    ['2026-11-02', 'closed'], ['2026-11-03', 'booked'], ['2026-11-04', 'dark'], ['2026-11-05', 'booked'],
    ['2026-11-06', 'dark'], ['2026-11-07', 'dark'], ['2026-11-08', 'dark'],
  ]);
  assert.deepEqual(r.nights[1].show, { headliner: 'Synthetic Act A', source_url: 'https://example.org/a' });
  assert.equal('show' in r.nights[2], false);
  assert.equal(r.dark_count, 4);
});

test('nightsFor: a show on a usual closing day is booked, past shows count as booked', () => {
  const v = { closed_weekdays: [1], shows: [{ date: '2026-11-02', headliner: 'Synthetic Act C', source_url: 'https://example.org/c' }],
    past_shows: [{ date: '2026-10-28', headliner: 'Synthetic Act D', source_url: 'https://example.org/d' }] };
  assert.equal(nightsFor(v, '2026-11-02', 1).nights[0].status, 'booked');
  assert.equal(nightsFor(v, '2026-10-28', 1).nights[0].status, 'booked');
});

test('nightsFor: crosses month, year and leap-day boundaries', () => {
  assert.deepEqual(nightsFor({}, '2026-12-30', 4).nights.map((n) => n.date), ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  assert.deepEqual(nightsFor({}, '2028-02-28', 2).nights.map((n) => n.date), ['2028-02-28', '2028-02-29']);
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  // US and EU daylight-saving switches do not skip or repeat a date.
  const r = nightsFor({}, '2026-03-07', 60);
  assert.equal(new Set(r.nights.map((n) => n.date)).size, 60);
  assert.equal(r.to, '2026-05-05');
});

test('nightsFor: rejects bad from and days', () => {
  for (const from of ['2026-02-30', '2026-11-2', '', undefined, '2026-11-02T00:00:00Z']) {
    assert.throws(() => nightsFor(venue, from, 7), RangeError, String(from));
  }
  for (const days of [0, -1, 1.5, 367, '7']) assert.throws(() => nightsFor(venue, '2026-11-02', days), RangeError, String(days));
});

test('nightsFor gives the same nights whatever the process time zone is', () => {
  const script = `import { nightsFor, todayISO } from ${JSON.stringify(path.join(REPO_ROOT, 'server', 'calendar', 'nights.js'))};
    const v = ${JSON.stringify(venue)};
    console.log(JSON.stringify([nightsFor(v, '2026-11-02', 7), todayISO(Date.parse('2026-11-01T23:30:00Z'))]));`;
  const outs = ['UTC', 'Pacific/Kiritimati', 'America/Los_Angeles', 'Asia/Kolkata'].map((TZ) =>
    execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ }, encoding: 'utf8' }));
  for (const o of outs) assert.equal(o, outs[0]);
  assert.equal(JSON.parse(outs[0])[1], '2026-11-01');
});

test('todayISO uses the UTC date', () => {
  assert.equal(todayISO(Date.parse('2026-10-11T23:59:59Z')), '2026-10-11');
  assert.equal(todayISO(Date.parse('2026-10-12T00:00:00Z')), '2026-10-12');
});

test('isISODate accepts only real YYYY-MM-DD dates', () => {
  assert.equal(isISODate('2028-02-29'), true);
  for (const s of ['2027-02-29', '2026-13-01', '2026-1-01', '20261101', 20261101, null]) assert.equal(isISODate(s), false, String(s));
});

test('synthetic Example Room passes the schema and covers the agreed span', () => {
  assert.deepEqual(validateVenue(room), { ok: true, errors: [] });
  assert.equal(room._synthetic, true);
  assert.equal(room.name, 'Example Room');
  for (const s of [...room.shows, ...room.past_shows]) assert.match(s.headliner, /^Synthetic Act \d+$/);
  const span = (list) => (Date.parse(list.at(-1).date) - Date.parse(list[0].date)) / 86_400_000;
  assert.ok(span(room.shows) >= 60, 'at least 60 days of upcoming shows');
  assert.ok(span(room.past_shows) >= 89, 'at least 3 months of past shows');
  assert.ok(room.past_shows.at(-1).date < room.read_at && room.shows[0].date >= room.read_at);
  const r = nightsFor(room, room.read_at, 60);
  assert.ok(r.dark_count > 0 && r.nights.some((n) => n.status === 'booked') && r.nights.some((n) => n.status === 'closed'));
});

test('validateVenue reports each schema problem', () => {
  const bad = {
    id: 'Bad Id', name: '', city: 'X', capacity_band: '1-2', calendar_source_url: 'ftp://example.org',
    read_at: 'yesterday', closed_weekdays: [1, 1], _synthetic: false,
    shows: [{ date: '2026-02-30', headliner: ' ', source_url: 'nope' }], past_shows: 'none',
  };
  const { ok, errors } = validateVenue(bad);
  assert.equal(ok, false);
  for (const re of [/^id /, /^name /, /calendar_source_url/, /read_at/, /duplicates/, /_synthetic/, /shows\[0\]\.date/,
    /shows\[0\]\.headliner/, /shows\[0\]\.source_url/, /past_shows must be an array/]) {
    assert.ok(errors.some((e) => re.test(e)), `${re} in ${JSON.stringify(errors)}`);
  }
  assert.equal(validateVenue([]).ok, false);
  assert.equal(validateVenue({ ...room, read_at: '2026-10-11T08:00:00Z' }).ok, true);
});

test('loadVenues reads the synthetic directory', async () => {
  const skipped = [];
  const venues = await loadVenues(FIXTURE_DIR, { onSkip: (f, r) => skipped.push([f, r]) });
  assert.deepEqual(venues.map((v) => v.id), ['example-room']);
  assert.deepEqual(skipped, []);
});
